import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The engine levels against PostgreSQL, with accounts on (PR-12b).
 *
 * Only the `authenticated` project matches `*-enabled.spec.ts`. Two things are
 * proved here that the seeded server cannot show: the canonical progression
 * unlocks N3 after N1 and N2 are cleared — never before, never out of order —
 * and the engine grid then works end to end: recalculation on screen, keyboard
 * navigation, a draft that survives a reload, and a submission graded by
 * `spreadsheet_formula`.
 */

const STRONG_PASSWORD = "correct horse battery staple";
const BASE = "/modules/excel-finance-lab";
const N1_DIRECT = "ex-xl-chiffre-affaires";
const N1_DIAGNOSTIC = "ex-xl-taux-marge";
const N2_DIAGNOSTIC = "ex-xl-budget-ecart";
const N3_GRID = "ex-xl-n3-tri-familles";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(STRONG_PASSWORD);

  const pending = page.waitForResponse(
    (response) => response.url().includes("/api/auth/signup") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Créer le compte" }).click();
  expect((await pending).status(), `signup for ${email}`).toBe(201);
  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

async function submitPerfect(
  request: APIRequestContext,
  exerciseId: string,
  cells: Record<string, { value?: number; formula?: string }>
) {
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId, submission: { kind: "spreadsheet", cells } }
  });

  expect(response.status(), exerciseId).toBe(200);

  const body = (await response.json()) as { correction: { score: number } };

  expect(body.correction.score, exerciseId).toBe(20);
}

async function recordRetention(request: APIRequestContext, itemRef: string) {
  const response = await request.post("/api/revisions/review", {
    data: { itemType: "exercise", itemRef, rating: "mastered", revealed: true }
  });

  expect(response.status(), itemRef).toBe(200);
}

/**
 * Clears N1 then N2, all through the public grading API — the same calls the
 * forms make. The diagnostic exercises double as case-study evidence, exactly
 * as `getAttemptEvidenceKinds` documents.
 */
async function clearFirstTwoLevels(request: APIRequestContext) {
  // N1 — strengthen the critical competency, then close the diagnostic.
  for (let index = 0; index < 8; index += 1) {
    await submitPerfect(request, N1_DIRECT, { B12: { value: 600000, formula: "=B2+B3" } });
  }

  await recordRetention(request, N1_DIRECT);
  await submitPerfect(request, N1_DIAGNOSTIC, { B13: { value: 37.5, formula: "=B12/B2*100" } });

  // N2 — same shape; the diagnostic targets the critical competency itself.
  for (let index = 0; index < 8; index += 1) {
    await submitPerfect(request, N2_DIAGNOSTIC, {
      D2: { value: 8000, formula: "=C2-B2" },
      E2: { value: 2.58, formula: "=(C2-B2)/B2*100" }
    });
  }

  await recordRetention(request, N2_DIAGNOSTIC);
}

async function excelLevelStatuses(page: Page): Promise<string[]> {
  await page.goto("/parcours");
  const track = page.locator('[data-canonical-track="track-excel-finance"]');
  await expect(track).toBeVisible();
  await expect(track.locator("[data-level-status]")).toHaveCount(4);

  return track
    .locator("[data-level-status]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-level-status") ?? ""));
}

test("clearing N1 and N2 opens N3 — and only N3", async ({ page }, testInfo) => {
  await signUp(page, `xl-unlock-${testInfo.workerIndex}@example.test`);

  await clearFirstTwoLevels(page.request);

  const statuses = await excelLevelStatuses(page);

  expect(statuses[0]).toBe("passed");
  expect(statuses[1]).toBe("passed");
  expect(statuses[2]).toBe("available");
  // Sequential unlocking: the DCF level waits for the forecasting level.
  expect(statuses[3]).toBe("locked");
});

test("the engine grid recalculates, navigates by keyboard, keeps a draft and grades", async ({
  page
}, testInfo) => {
  await signUp(page, `xl-grid-${testInfo.workerIndex}@example.test`);
  await clearFirstTwoLevels(page.request);

  await page.goto(`${BASE}/exercices/${N3_GRID}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Totaux par famille");

  // Type a formula: the computed value appears in the cell without submitting,
  // because the same engine that grades runs the grid.
  const b12 = page.getByLabel("Cellule B12");

  await b12.fill('=SOMME.SI(A2:A10;"VENTES";B2:B10)');
  await expect(page.locator('[data-cell-value="B12"]')).toHaveText(/51\s?200/);

  // The formula bar mirrors the selected cell, and the status line reads it.
  await expect(page.getByLabel(/Barre de formule, cellule B12/)).toHaveValue(
    '=SOMME.SI(A2:A10;"VENTES";B2:B10)'
  );
  await expect(page.getByTestId("formula-status")).toContainText("B12");

  // Keyboard: ArrowDown moves to the next editable cell.
  await b12.press("ArrowDown");
  await expect(page.getByLabel("Cellule B13")).toBeFocused();

  // An error is shown as a value, in the cell and in the status line.
  await page.getByLabel("Cellule B13").fill("=1/0");
  await expect(page.locator('[data-cell-value="B13"]')).toHaveText("#DIV/0!");

  // The draft autosaves; a reload restores both cells as typed.
  await expect(page.getByTestId("draft-state")).toContainText("Brouillon enregistré.");
  await page.reload();
  await expect(page.getByLabel("Cellule B12")).toHaveValue(
    '=SOMME.SI(A2:A10;"VENTES";B2:B10)'
  );
  await expect(page.getByLabel("Cellule B13")).toHaveValue("=1/0");

  // Fix B13, submit, and the engine-backed evaluator grades it 20/20.
  await page.getByLabel("Cellule B13").fill('=SUMIF(A2:A10,"ACHATS",B2:B10)');

  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/exercises/attempts") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Corriger" }).click();

  const response = await pending;
  const body = (await response.json()) as {
    correction: { score: number };
    evaluationType: string;
  };

  expect(response.status()).toBe(200);
  expect(body.evaluationType).toBe("spreadsheet_formula");
  expect(body.correction.score).toBe(20);
});

test("a hard-coded result on the engine level is named a method error", async ({
  page
}, testInfo) => {
  await signUp(page, `xl-hardcode-${testInfo.workerIndex}@example.test`);
  await clearFirstTwoLevels(page.request);

  const response = await page.request.post("/api/exercises/attempts", {
    data: {
      exerciseId: N3_GRID,
      submission: {
        kind: "spreadsheet",
        cells: { B12: { formula: "=51200" }, B13: { formula: "=-10700" } }
      }
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    correction: { score: number; accountingReasoningNotes?: unknown };
  };

  // The figures are right; the method is absent. 60% — and the perturbation is
  // what caught it, not a text pattern.
  expect(body.correction.score).toBe(12);
});

test("a case-study step submits with case evidence once the level is open", async ({
  page
}, testInfo) => {
  await signUp(page, `xl-case-${testInfo.workerIndex}@example.test`);
  await clearFirstTwoLevels(page.request);

  await page.goto(`${BASE}/cas/tresorerie-13-semaines/2`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Totalisez ventes et achats");
  await expect(page.getByLabel("Cellule B12")).toBeVisible();

  const response = await page.request.post("/api/exercises/attempts", {
    data: {
      exerciseId: N3_GRID,
      submission: {
        kind: "spreadsheet",
        cells: {
          B12: { formula: '=SOMME.SI(A2:A10;"VENTES";B2:B10)' },
          B13: { formula: '=SOMME.SI(A2:A10;"ACHATS";B2:B10)' }
        }
      },
      activityContext: "case_study"
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    correction: { score: number };
    progress: { attributed: boolean; levelId: string | null };
  };

  expect(body.correction.score).toBe(20);
  expect(body.progress.attributed).toBe(true);
  expect(body.progress.levelId).toBe("level-excel-finance-3");
});
