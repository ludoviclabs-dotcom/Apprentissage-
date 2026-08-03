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

test("the lab lists both levels, its datasets, and says what it is not", async ({ page }) => {
  await page.goto(BASE);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Excel Finance Lab");
  await expect(page.getByRole("link", { name: "Ouvrir le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir le niveau 2" })).toBeVisible();

  // A learner expecting Excel and finding a grid that will not recalculate would
  // reasonably conclude the thing is broken, so the page has to say so.
  await expect(page.getByText(/Rien n'est recalculé ici/)).toBeVisible();

  // Each path appears twice now: once in the dataset list, once in the sources
  // panel, since the citations point at the very files the list describes.
  for (const file of [
    "datasets/excel/monthly_pnl.csv",
    "datasets/excel/cash_forecast.csv",
    "datasets/excel/budget_vs_actual.csv"
  ]) {
    await expect(page.getByText(file).first()).toBeVisible();
  }
});

test("a level that does not exist is a 404, not a silent fallback to level 1", async ({ page }) => {
  for (const path of [`${BASE}/9`, `${BASE}/0`, `${BASE}/abc`]) {
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
  await page.goto(`${BASE}/exercices/${EBE}`);

  // 204 000 + 9 000 - 14 000 - 132 000 - 21 000: the misconception this
  // exercise exists to catch, since EBE is measured before amortisation.
  await fillCell(page, "B13", "46000", "=B12+B9-B7-B8-B10");

  const response = await submitAndWait(page);

  expect(((await response.json()) as { correction: { score: number } }).correction.score).toBe(0);
});

test("a two-cell exercise awards partial credit for one correct column", async ({ page }) => {
  await page.goto(`${BASE}/exercices/${CASH}`);

  await expect(page.getByLabel("Cellule B5")).toBeVisible();
  await expect(page.getByLabel("Cellule C5")).toBeVisible();

  await fillCell(page, "B5", "464000", "=SUM(B2:B4)");

  const response = await submitAndWait(page);

  expect(((await response.json()) as { correction: { score: number } }).correction.score).toBe(10);
});

test("every lab exercise is graded by the spreadsheet evaluator", async ({ request }) => {
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
    "ex-xl-budget-ecart"
  ];

  for (const exerciseId of ids) {
    const response = await request.post("/api/exercises/attempts", {
      data: { exerciseId, submission: { kind: "spreadsheet", cells: { B12: { value: 1 } } } }
    });

    expect(response.status(), exerciseId).toBe(200);

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
      exerciseId: EBE,
      submission: { kind: "spreadsheet", cells: { B13: { value: 67000, formula: "=B12+B9-B7-B8" } } }
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
  expect(body.progress.levelId).toBe("level-excel-finance-2");
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

  const body = (await response.json()) as {
    correction: { accountingTreatmentErrors: string[]; reasoningErrors: string[] };
  };

  expect(body.correction.accountingTreatmentErrors.length).toBeGreaterThan(0);
  expect(body.correction.reasoningErrors).toHaveLength(0);
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
    data: { exerciseId: EBE, submission: { kind: "spreadsheet", cells: { B13: { value: 1 } } } }
  });

  const body = (await response.json()) as {
    correction: { score: number };
    review: { intervalDays: number; remediation: { reason: string } | null };
  };

  expect(body.correction.score).toBe(0);
  expect(body.review.intervalDays).toBe(1);
  expect(body.review.remediation?.reason).toBe("failed-attempt");
});

test("the learner can walk from one exercise to the next", async ({ page }) => {
  await page.goto(`${BASE}/exercices/${CA}`);

  await fillCell(page, "B12", "600000", "=B2+B3");
  await submitAndWait(page);

  await page.getByRole("link", { name: "Exercice suivant" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/exercices/ex-xl-cout-achat-vendues$`));
});
