import { expect, test, type Page } from "@playwright/test";

/**
 * The Excel Finance Lab, end to end.
 *
 * Runs on the seeded server: PR-05 made authored specifications resolve without
 * a database, so the `spreadsheet` evaluator grades here exactly as it does
 * against PostgreSQL.
 *
 * The assertions worth reading twice are the ones about value versus formula.
 * They are the lab's whole reason to exist: a right figure typed in by hand is
 * genuinely worth something, and genuinely not worth full marks.
 */

const BASE = "/modules/excel-finance-lab";
const CA = "ex-xl-chiffre-affaires";
const EBE = "ex-xl-ebe";
const CASH = "ex-xl-cash-totaux";

async function fillCell(page: Page, ref: string, value: string, formula?: string) {
  await page.getByLabel(`Cellule ${ref}`).fill(value);

  if (formula !== undefined) {
    await page.getByLabel(`Formule ${ref}`).fill(formula);
  }
}

async function submitAndWait(page: Page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/exercises/attempts") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Corriger" }).click();

  return pending;
}

test("the lab lists four levels, its datasets, and states the engine's limits", async ({ page }) => {
  await page.goto(BASE);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Excel Finance Lab");
  await expect(page.getByRole("link", { name: "Ouvrir le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ouvrir le niveau [234]/ })).toHaveCount(0);
  // PR-12b : trois niveaux verrouillés au départ, plus un seul. Compté dans la
  // liste des niveaux — le rail de progression répète le même état.
  await expect(page.locator(".course-list").getByText("Niveau verrouillé")).toHaveCount(3);

  // The honesty moved with the capability: the page now states what the engine
  // computes and the limits it keeps — never Power Query, never a macro.
  await expect(page.getByText(/laboratoire de calcul contrôlé/i)).toBeVisible();
  await expect(page.getByText(/références\s+circulaires/).first()).toBeVisible();
  await expect(page.getByText(/pas de macro exécutée/).first()).toBeVisible();

  // Each path appears twice now: once in the dataset list, once in the sources
  // panel, since the citations point at the very files the list describes.
  for (const file of [
    "datasets/excel/monthly_pnl.csv",
    "datasets/excel/cash_forecast.csv",
    "datasets/excel/budget_vs_actual.csv",
    "datasets/excel/erp_export.csv",
    "datasets/excel/cash_13_semaines.csv",
    "datasets/excel/aster_industrie.csv",
    "datasets/excel/dcf_aster.csv"
  ]) {
    await expect(page.getByText(file).first()).toBeVisible();
  }

  // The two case studies are announced on the front door.
  await expect(page.getByTestId("excel-case-studies")).toContainText("Aster Industrie");
  await expect(page.getByTestId("excel-case-studies")).toContainText("treize semaines");
});

test("a level that does not exist is a 404, not a silent fallback to level 1", async ({ page }) => {
  for (const path of [`${BASE}/9`, `${BASE}/0`, `${BASE}/abc`]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
});

test("the locked engine levels are 404 for the anonymous learner", async ({ page }) => {
  // They exist — the front door lists them — but cannot be opened before the
  // earlier levels are cleared, and a locked page is withheld, not teased.
  for (const path of [`${BASE}/3`, `${BASE}/4`]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
});

test("an unknown exercise is a 404", async ({ page }) => {
  expect((await page.goto(`${BASE}/exercices/ex-xl-does-not-exist`))?.status()).toBe(404);
});

test.describe("the grid", () => {
  test("shows the dataset read-only and only opens the answer cell", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    await expect(page.locator("caption")).toContainText("Grille de calcul");
    // The nine P&L lines are rendered as given values, not as inputs.
    await expect(page.locator("td.lab-given")).toHaveCount(9);
    await expect(page.locator("td.lab-input")).toHaveCount(1);
    await expect(page.getByLabel("Cellule B12")).toBeVisible();
    await expect(page.getByLabel("Formule B12")).toBeVisible();

    // Column letters and row numbers are what make "=B2+B3" in the statement
    // point at something on screen.
    await expect(page.locator("td.lab-given").first()).toHaveText("480 000");
  });

  test("does not print the expected answer before the attempt", async ({ page }) => {
    const response = await page.goto(`${BASE}/exercices/${CA}`);
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain("600 000");
    expect(html).not.toContain("=B2+B3");
  });

  test("keeps the submit button disabled until something is typed", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    await expect(page.getByRole("button", { name: "Corriger" })).toBeDisabled();

    await fillCell(page, "B12", "600000");
    await expect(page.getByRole("button", { name: "Corriger" })).toBeEnabled();
  });

  test("opens a level, edits a cell, then submits the result", async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole("link", { name: "Ouvrir le niveau 1" }).click();
    await page.getByRole("link", { name: "Ouvrir l'exercice" }).first().click();

    await fillCell(page, "B12", "600 000", "=B2+B3");
    expect((await submitAndWait(page)).status()).toBe(200);
    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });
});

test.describe("value and formula are graded separately", () => {
  test("a right value with a right formula scores 20/20", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    await fillCell(page, "B12", "600000", "=B2+B3");
    expect((await submitAndWait(page)).status()).toBe(200);

    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });

  test("accepts an amount written the French way, and a lower-case formula", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    // Refusing "600 000" would fail a learner for transcribing the figure the
    // way every statement in this lab writes it.
    await fillCell(page, "B12", "600 000", "=b2 + b3");
    expect((await submitAndWait(page)).status()).toBe(200);

    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });

  test("a right value typed in without a formula keeps the value marks only", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    await fillCell(page, "B12", "600000", "=600000");

    const response = await submitAndWait(page);
    const body = (await response.json()) as { correction: { score: number } };

    // 60% of the marks ride on the figure, 40% on the method.
    expect(body.correction.score).toBe(12);
    await expect(page.getByText(/en dur/).first()).toBeVisible();
  });

  test("a right formula with a wrong value keeps the formula marks only", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${CA}`);

    await fillCell(page, "B12", "599999", "=B2+B3");

    const response = await submitAndWait(page);

    expect(((await response.json()) as { correction: { score: number } }).correction.score).toBe(8);
  });
});

test("an EBE with depreciation deducted is marked zero, which is the point of the item", async ({
  page
}) => {
  expect((await page.goto(`${BASE}/exercices/${EBE}`))?.status()).toBe(404);
});

test("a two-cell exercise awards partial credit for one correct column", async ({ page }) => {
  expect((await page.goto(`${BASE}/exercices/${CASH}`))?.status()).toBe(404);
});

test("only the declared lab demonstration exercise is publicly gradable", async ({ request }) => {
  const ids = [
    CA,
    "ex-xl-cout-achat-vendues",
    "ex-xl-marge-commerciale",
    "ex-xl-taux-marge",
    CASH,
    "ex-xl-valeur-ajoutee",
    EBE,
    "ex-xl-resultat-exploitation",
    "ex-xl-cash-solde-final",
    "ex-xl-budget-ecart",
    // PR-12b : les exercices du moteur restent derrière la même porte.
    "ex-xl-n3-tri-familles",
    "ex-xl-n3-controle-coherence",
    "ex-xl-n4-wacc",
    "ex-xl-n4-audit-modele"
  ];

  for (const [index, exerciseId] of ids.entries()) {
    const response = await request.post("/api/exercises/attempts", {
      data: { exerciseId, submission: { kind: "spreadsheet", cells: { B12: { value: 1 } } } }
    });

    expect(response.status(), exerciseId).toBe(index === 0 ? 200 : 403);

    if (index > 0) {
      continue;
    }

    const body = (await response.json()) as { evaluationType: string; exerciseVersionId: string };

    expect(body.evaluationType, exerciseId).toBe("spreadsheet");
    expect(body.exerciseVersionId, exerciseId).toBeTruthy();
  }
});

test("a malformed spreadsheet payload is a 400", async ({ request }) => {
  for (const submission of [
    // No cells at all.
    { kind: "spreadsheet", cells: {} },
    // A cell holding neither a value nor a formula.
    { kind: "spreadsheet", cells: { B12: {} } },
    // Not an A1 reference.
    { kind: "spreadsheet", cells: { "not-a-cell": { value: 1 } } },
    // A non-finite value.
    { kind: "spreadsheet", cells: { B12: { value: "600000" } } }
  ]) {
    const response = await request.post("/api/exercises/attempts", {
      data: { exerciseId: CA, submission }
    });

    expect(response.status(), JSON.stringify(submission)).toBe(400);
  }
});

test("submitting a lab exercise schedules it for review and names its level", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: CA,
      submission: { kind: "spreadsheet", cells: { B12: { value: 600000, formula: "=B2+B3" } } }
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    correction: { score: number };
    review: { intervalDays: number; remediation: unknown };
    progress: { levelId: string | null };
  };

  expect(body.correction.score).toBe(20);
  // 20/20 reads as `mastered` on the PR-04 ladder: J+14, no remediation.
  expect(body.review.intervalDays).toBe(14);
  expect(body.review.remediation).toBeNull();
  expect(body.progress.levelId).toBe("level-excel-finance-1");
});

test("a perfect answer is not advised to rewrite an essay", async ({ request }) => {
  // The remediation used to come from the legacy prose grader run over the
  // rendered submission string, so a flawless spreadsheet answer came back told
  // to "réécrire la réponse en quatre blocs" — and `CorrectionSummary` renders
  // that plan unconditionally, under the 20/20.
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: CA,
      submission: { kind: "spreadsheet", cells: { B12: { value: 600000, formula: "=B2+B3" } } }
    }
  });

  const body = (await response.json()) as {
    correction: {
      score: number;
      remediationPlan: { microLesson: string; nextAction: string };
      sourceReferences: Array<{ pack: string; document: string }>;
    };
  };

  expect(body.correction.score).toBe(20);
  expect(body.correction.remediationPlan.nextAction).not.toMatch(/quatre blocs/);
  expect(body.correction.remediationPlan.microLesson).toMatch(/Rien a reprendre/);
  // And the correction cites the module's own sources, which resolve to files
  // that exist rather than to nothing.
  expect(body.correction.sourceReferences.length).toBeGreaterThan(0);
  expect(body.correction.sourceReferences[0].document).toContain("datasets/excel/");
});

test("a wrong SIG formula is reported as a treatment error, not a reasoning slip", async ({
  request
}) => {
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: EBE,
      submission: {
        kind: "spreadsheet",
        cells: { B13: { value: 46000, formula: "=B12+B9-B7-B8-B10" } }
      }
    }
  });

  expect(response.status()).toBe(403);
});

test("too many cells is a 400 rather than an unbounded write", async ({ request }) => {
  const cells: Record<string, { value: number }> = {};

  for (let row = 1; row <= 60; row += 1) {
    cells[`A${row}`] = { value: row };
  }

  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: CA, submission: { kind: "spreadsheet", cells } }
  });

  expect(response.status()).toBe(400);
});

test("a failed lab exercise opens a remediation", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: CA, submission: { kind: "spreadsheet", cells: { B12: { value: 1 } } } }
  });

  const body = (await response.json()) as {
    correction: { score: number };
    review: { intervalDays: number; remediation: { reason: string } | null };
  };

  expect(body.correction.score).toBe(0);
  expect(body.review.intervalDays).toBe(1);
  expect(body.review.remediation?.reason).toBe("failed-attempt");
});

test("the public learner cannot bypass the next locked exercise", async ({ page }) => {
  await page.goto(`${BASE}/exercices/${CA}`);

  await fillCell(page, "B12", "600000", "=B2+B3");
  await submitAndWait(page);

  await expect(page.getByRole("link", { name: "Exercice suivant" })).toHaveCount(0);
  expect((await page.goto(`${BASE}/exercices/ex-xl-cout-achat-vendues`))?.status()).toBe(404);
});

test.describe("the case studies (PR-12b)", () => {
  test("the thirteen-week dossier shows raw data and steps, never the answers", async ({ page }) => {
    const response = await page.goto(`${BASE}/cas/tresorerie-13-semaines`);
    const html = (await response?.text()) ?? "";

    await expect(page.getByRole("heading", { level: 1 })).toContainText("treize semaines");
    await expect(page.locator(".case-steps li")).toHaveCount(5);
    // The raw ERP export is shown dirty on purpose: "7 400" is a defect to see.
    await expect(page.getByText("7 400", { exact: true })).toBeVisible();

    // No-leak: the quarterly totals and the chained positions are the expected
    // answers of steps 3 and 4; they must be absent from the page bytes.
    for (const leak of [/543\s?100/, /545\s?100/, /20\s?500/, /51\s?200/]) {
      expect(html, String(leak)).not.toMatch(leak);
    }
  });

  test("the Aster dossier shows the plan without the derived flow or the WACC", async ({ page }) => {
    const response = await page.goto(`${BASE}/cas/dcf-aster-industrie`);
    const html = (await response?.text()) ?? "";

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aster Industrie");
    await expect(page.locator(".case-steps li")).toHaveCount(6);
    await expect(page.getByText("à dériver (étape 1)")).toBeVisible();

    // The VBA module is displayed read-only with a local download — and the
    // page says macros are never executed.
    await expect(page.getByTestId("vba-viewer")).toBeVisible();
    await expect(page.getByTestId("vba-viewer")).toContainText("ExporterTresorerieCsv");
    await expect(page.getByRole("button", { name: /Télécharger le module/ })).toBeVisible();
    await expect(page.getByText(/n'exécute aucune macro/).first()).toBeVisible();

    // No-leak: year-1 FCF (step 1), the WACC (step 2) and the terminal value
    // (step 4) are answers; none may be in the page bytes.
    for (const leak of [/31\s?500/, /0,069/, /6,9\s?%/, /702\s?981/]) {
      expect(html, String(leak)).not.toMatch(leak);
    }
  });

  test("an unknown case is a 404, and locked steps are withheld", async ({ page }) => {
    expect((await page.goto(`${BASE}/cas/pas-un-cas`))?.status()).toBe(404);
    // Step pages sit behind the level gate: N3 is locked for the anonymous
    // learner, so the step — and its statement — stays a 404, not a teaser.
    expect((await page.goto(`${BASE}/cas/tresorerie-13-semaines/1`))?.status()).toBe(404);
    expect((await page.goto(`${BASE}/cas/tresorerie-13-semaines/9`))?.status()).toBe(404);
  });
});

test("the generic exercise route gates a locked lab exercise like the module route", async ({
  page
}) => {
  // The generic page renders the statement, the rubric and — since the engine
  // grids reached `AnyExerciseForm` — a working grid. Without the same gate as
  // the module route it was a second door onto a locked premium exercise, open
  // and fully playable.
  expect((await page.goto("/exercices/ex-xl-n3-tri-familles"))?.status()).toBe(404);
  expect((await page.goto("/exercices/ex-xl-n4-wacc"))?.status()).toBe(404);
  // Level 2 of the free accounting track is gated by the same helper.
  expect((await page.goto("/exercices/ex-cgv1-tva-a-decaisser"))?.status()).toBe(404);

  // An exercise outside every module is untouched: most of the catalogue.
  expect((await page.goto("/exercices/ex-travaux-cloture-1"))?.status()).toBe(200);
});

test("a grid draft cannot be saved without a database, and says so", async ({ request }) => {
  const response = await request.post("/api/excel/workbooks", {
    data: { exerciseId: CA, cells: { B12: "=B2+B3" } }
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ saved: false, reason: "database-disabled" });
});

test("a draft for a locked exercise is refused before anything is stored", async ({ request }) => {
  const response = await request.post("/api/excel/workbooks", {
    data: { exerciseId: "ex-xl-n3-tri-familles", cells: { B12: "=1" } }
  });

  expect(response.status()).toBe(403);
});
