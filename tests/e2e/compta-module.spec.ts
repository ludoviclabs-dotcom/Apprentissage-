import { expect, test, type Page } from "@playwright/test";

/**
 * The comptabilité générale v1 module, end to end.
 *
 * Runs on the seeded server, which is the point: PR-05 made the authored
 * specifications resolve without a database, so the typed evaluators grade here
 * exactly as they do against PostgreSQL. Before that, every exercise on this
 * server fell back to the rubric matcher and none of these assertions could have
 * been written.
 */

const BASE = "/modules/comptabilite-generale";
const ACHAT = "ex-cgv1-achat-marchandises";
const TVA = "ex-cgv1-tva-a-decaisser";

/** Fills one line of the interactive journal. */
async function fillLine(
  page: Page,
  index: number,
  values: { account: string; debit?: string; credit?: string }
) {
  await page.getByLabel(`Compte ligne ${index}`).fill(values.account);

  if (values.debit) {
    await page.getByLabel(`Débit ligne ${index}`).fill(values.debit);
  }

  if (values.credit) {
    await page.getByLabel(`Crédit ligne ${index}`).fill(values.credit);
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

test("the module lists both levels and its exercises", async ({ page }) => {
  await page.goto(BASE);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Comptabilité générale");
  await expect(page.getByRole("link", { name: "Ouvrir le niveau 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir le niveau 2" })).toBeVisible();

  await page.getByRole("link", { name: "Ouvrir le niveau 1" }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/1$`));

  // Every exercise of the level is reachable, not just listed.
  const cards = page.locator("article[data-exercise-id]");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
});

test("a level that does not exist is a 404, not a silent fallback to level 1", async ({ page }) => {
  for (const path of [`${BASE}/9`, `${BASE}/0`, `${BASE}/abc`]) {
    const response = await page.goto(path);

    expect(response?.status(), path).toBe(404);
  }
});

test.describe("the interactive journal", () => {
  test("opens from the level, keeps dynamic rows stable, then grades the edited entry", async ({ page }) => {
    await page.goto(`${BASE}/1`);

    const exercise = page.locator(`article[data-exercise-id="${ACHAT}"]`);
    await exercise.getByRole("link", { name: "Faire l'exercice" }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/exercices/${ACHAT}$`));

    await fillLine(page, 1, { account: "607", debit: "1200" });
    await fillLine(page, 2, { account: "44566", debit: "240" });
    await fillLine(page, 3, { account: "401", credit: "1440" });

    await page.getByRole("button", { name: "Ajouter une ligne" }).click();
    await expect(page.getByLabel("Compte ligne 4")).toBeVisible();
    await page.getByRole("button", { name: "Supprimer la ligne 4" }).click();
    await expect(page.getByLabel("Compte ligne 4")).toHaveCount(0);
    await expect(page.getByLabel("Compte ligne 1")).toHaveValue("607");

    expect((await submitAndWait(page)).status()).toBe(200);
    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });

  test("keeps a running balance and grades a correct entry 20/20", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${ACHAT}`);

    // The expected answer must not be on the page before the attempt.
    await expect(page.getByText("Débit 607 Achats de marchandises 1 200,00")).toHaveCount(0);

    const balance = page.getByTestId("journal-balance");
    await expect(balance).toContainText("Aucun montant saisi");

    await fillLine(page, 1, { account: "607", debit: "1200" });
    await expect(balance).toContainText("Déséquilibre");

    await fillLine(page, 2, { account: "44566", debit: "240" });
    await fillLine(page, 3, { account: "401", credit: "1440" });

    await expect(page.getByTestId("journal-total-debit")).toHaveText("1 440,00");
    await expect(page.getByTestId("journal-total-credit")).toHaveText("1 440,00");
    await expect(balance).toContainText("Équilibrée");

    const response = await submitAndWait(page);
    expect(response.status()).toBe(200);

    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });

  test("accepts an amount written the French way", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${ACHAT}`);

    // "1 200,00" is how the statement writes it; refusing it would fail a
    // learner for transcribing the figure exactly as given.
    await fillLine(page, 1, { account: "607", debit: "1 200,00" });
    await fillLine(page, 2, { account: "44566", debit: "240,00" });
    await fillLine(page, 3, { account: "401", credit: "1 440,00" });

    await expect(page.getByTestId("journal-balance")).toContainText("Équilibrée");

    const response = await submitAndWait(page);
    expect(response.status()).toBe(200);
    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });

  test("an inverted entry loses the direction marks and says which line is wrong", async ({
    page
  }) => {
    await page.goto(`${BASE}/exercices/${ACHAT}`);

    await fillLine(page, 1, { account: "607", credit: "1200" });
    await fillLine(page, 2, { account: "44566", credit: "240" });
    await fillLine(page, 3, { account: "401", debit: "1440" });

    const response = await submitAndWait(page);
    expect(response.status()).toBe(200);

    // Balanced, right accounts, wrong side: the mark must not be full and the
    // feedback must name the direction rather than say "wrong answer".
    await expect(page.getByText(/Score 9([.,]23)?\/20/)).toBeVisible();
    await expect(page.getByText(/sens inversé/i).first()).toBeVisible();
  });

  test("the submit button stays disabled while there is nothing to grade", async ({ page }) => {
    await page.goto(`${BASE}/exercices/${ACHAT}`);

    await expect(page.getByRole("button", { name: "Corriger" })).toBeDisabled();

    await fillLine(page, 1, { account: "607", debit: "1200" });
    await expect(page.getByRole("button", { name: "Corriger" })).toBeEnabled();
  });
});

test("a numeric exercise is answered with a number and graded by the numeric evaluator", async ({
  page
}) => {
  await page.goto(`${BASE}/exercices/${TVA}`);

  await expect(page.locator("[data-exercise-kind='numeric']")).toBeVisible();

  await page.getByLabel("Réponse numérique").fill("1300");

  const response = await submitAndWait(page);
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { evaluationType: string; correction: { score: number } };

  expect(body.evaluationType).toBe("numeric");
  expect(body.correction.score).toBe(20);
});

test("a wrong number is marked zero rather than rewarded for looking numeric", async ({ page }) => {
  await page.goto(`${BASE}/exercices/${TVA}`);

  await page.getByLabel("Réponse numérique").fill("1900");

  const response = await submitAndWait(page);
  expect((await response.json()).correction.score).toBe(0);
});

test("a QCM is answered with checkboxes and penalises ticking everything", async ({ page }) => {
  await page.goto(`${BASE}/exercices/ex-cgv1-comptes-tiers-qcm`);

  const boxes = page.locator("input[type='checkbox']");
  const count = await boxes.count();
  expect(count).toBe(5);

  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).check();
  }

  const response = await submitAndWait(page);
  expect((await response.json()).correction.score).toBe(0);
});

test("every module exercise is graded by a typed evaluator, never the rubric matcher", async ({
  request
}) => {
  // One submission per exercise, in its own shape. If any exercise fell back to
  // `legacy_rubric` this fails, which is the guarantee the module is built on.
  const submissions: Array<[string, unknown]> = [
    [ACHAT, { kind: "journal", lines: [{ account: "607", debit: 1200 }] }],
    [TVA, { kind: "numeric", value: 1300 }],
    ["ex-cgv1-comptes-tiers-qcm", { kind: "choice", selectedOptionIds: ["401"] }],
    ["ex-cgv1-immo-acquisition", { kind: "journal", lines: [{ account: "2183", debit: 3000 }] }],
    ["ex-cgv1-rapprochement-bancaire", { kind: "numeric", value: 4220 }]
  ];

  for (const [exerciseId, submission] of submissions) {
    const response = await request.post("/api/exercises/attempts", {
      data: { exerciseId, submission }
    });

    expect(response.status(), exerciseId).toBe(200);

    const body = (await response.json()) as { evaluationType: string; exerciseVersionId: string };

    expect(body.evaluationType, exerciseId).not.toBe("legacy_rubric");
    expect(body.exerciseVersionId, exerciseId).toBeTruthy();
  }
});

test("submitting a module exercise schedules it for review", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: TVA,
      submission: { kind: "numeric", value: 1300 }
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    review: { intervalDays: number; remediation: unknown };
    progress: { levelId: string | null; attributed: boolean };
  };

  // 20/20 reads as `mastered` on the review ladder: J+14, and no remediation.
  expect(body.review.intervalDays).toBe(14);
  expect(body.review.remediation).toBeNull();
  // The exercise knows which level it feeds, even where nothing is persisted.
  expect(body.progress.levelId).toBe("level-compta-generale-v1-2");
});

test("a failed module exercise opens a remediation", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: TVA, submission: { kind: "numeric", value: 1 } }
  });

  const body = (await response.json()) as {
    correction: { score: number };
    review: { intervalDays: number; remediation: { reason: string } | null };
  };

  expect(body.correction.score).toBe(0);
  expect(body.review.intervalDays).toBe(1);
  expect(body.review.remediation?.reason).toBe("failed-attempt");
});

test.describe("the mini-case", () => {
  test("shows the dossier before asking for a single entry", async ({ page }) => {
    await page.goto(`${BASE}/cas-pratique`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Vélo Cité");
    // The reference appears in the dossier and again in the step list.
    await expect(page.getByText("Facture fournisseur F-2031").first()).toBeVisible();
    await expect(page.getByText("Récapitulatif TVA de mars").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Commencer le cas" })).toBeVisible();
  });

  test("walks the month step by step and closes on the VAT it implies", async ({ page }) => {
    await page.goto(`${BASE}/cas-pratique/1`);

    // Step 1 is the purchase invoice, with its piece alongside.
    await expect(page.getByText("Cyclo Pro — 60 pneus")).toBeVisible();

    await fillLine(page, 1, { account: "607", debit: "1200" });
    await fillLine(page, 2, { account: "44566", debit: "240" });
    await fillLine(page, 3, { account: "401", credit: "1440" });

    expect((await submitAndWait(page)).status()).toBe(200);
    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();

    await page.getByRole("link", { name: "Étape suivante" }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/cas-pratique/2$`));

    // The last step is the VAT liquidation, and it is a graded exercise.
    const response = await page.goto(`${BASE}/cas-pratique/6`);
    await expect(page.getByText("Récapitulatif TVA de mars").first()).toBeVisible();

    // The closing figure is the exact expected answer to the field below it.
    // It must be absent from the server's own bytes, not merely out of view —
    // the same guarantee PR-04 gave a flashcard's answer before its reveal.
    const html = (await response?.text()) ?? "";
    expect(html).not.toContain("Déclaration de TVA de mars N");
    await expect(page.getByText("Déclaration de TVA de mars N")).toHaveCount(0);

    await page.getByLabel("Réponse numérique").fill("1300");
    expect((await submitAndWait(page)).status()).toBe(200);

    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Terminer le cas" })).toBeVisible();
    await expect(page.getByText("Déclaration de TVA de mars N")).toBeVisible();
  });

  test("a step beyond the case is a 404", async ({ page }) => {
    expect((await page.goto(`${BASE}/cas-pratique/99`))?.status()).toBe(404);
  });
});

test("the public demo grades the module but says nothing is kept", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");

  await page.goto(`${BASE}/exercices/${ACHAT}`);

  // Grading is a pure computation and the API performs it here, so the control
  // is live rather than disabled. What the demo cannot do is remember, and the
  // form says which of the two is missing.
  await expect(page.getByText(/Indisponible sans base de données/).first()).toBeVisible();

  await fillLine(page, 1, { account: "607", debit: "1200" });
  await fillLine(page, 2, { account: "44566", debit: "240" });
  await fillLine(page, 3, { account: "401", credit: "1440" });

  await expect(page.getByRole("button", { name: "Corriger" })).toBeEnabled();
  expect((await submitAndWait(page)).status()).toBe(200);

  await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  await expect(page.getByText(/non enregistrée/).first()).toBeVisible();
});
