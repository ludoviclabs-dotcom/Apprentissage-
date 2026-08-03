import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The unlock loop against PostgreSQL, with accounts on.
 *
 * Only the `authenticated` project matches `*-enabled.spec.ts`. This is the test
 * the roadmap asks for: finishing level 1 below the threshold must leave level 2
 * gated, and finishing it above the threshold must open level 2.
 */

const STRONG_PASSWORD = "correct horse battery staple";
const LEVEL_1 = "level-compta-generale-v1-1";
const DIRECT_EXERCISE = "ex-cgv1-achat-marchandises";
const DIAGNOSTIC_EXERCISE = "ex-cgv1-tva-deductible-qcm";
const correctJournal = {
  kind: "journal",
  lines: [
    { account: "607", debit: 1200 },
    { account: "44566", debit: 240 },
    { account: "401", credit: 1440 }
  ]
};

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

async function submitCorrected(
  request: APIRequestContext,
  activityContext: "exercise" | "case_study" = "exercise"
) {
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: DIRECT_EXERCISE, submission: correctJournal, activityContext }
  });
  expect(response.status()).toBe(200);
}

async function recordRetention(request: APIRequestContext) {
  const response = await request.post("/api/revisions/review", {
    data: {
      itemType: "exercise",
      itemRef: DIRECT_EXERCISE,
      rating: "mastered",
      revealed: true
    }
  });
  expect(response.status()).toBe(200);
}

async function recordDiagnostic(request: APIRequestContext) {
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: DIAGNOSTIC_EXERCISE,
      submission: { kind: "choice", selectedOptionIds: ["marchandises", "informatique"] }
    }
  });
  expect(response.status()).toBe(200);
}

async function strengthenCriticalCompetency(request: APIRequestContext) {
  for (let index = 0; index < 8; index += 1) {
    await submitCorrected(request);
  }
}

async function completeLevelOne(request: APIRequestContext) {
  await strengthenCriticalCompetency(request);
  await submitCorrected(request, "case_study");
  await recordRetention(request);
  await recordDiagnostic(request);
}

async function levelStatuses(page: Page): Promise<string[]> {
  await page.goto("/parcours");
  const track = page.locator('[data-canonical-track="track-compta-generale-v1"]');
  await expect(track).toBeVisible();
  // PR-12a : la verticale complète — N1/N2 (cycle facture) puis N3 (clôture)
  // et N4 (états financiers).
  await expect(track.locator("[data-level-status]")).toHaveCount(4);

  return track
    .locator("[data-level-status]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-level-status") ?? ""));
}

async function canonicalScore(page: Page, path: string): Promise<string | null> {
  await page.goto(path);
  const track = page.locator('[data-canonical-track="track-compta-generale-v1"]').first();
  await expect(track).toBeVisible();
  return track.getAttribute("data-canonical-score");
}

test("a browser cannot declare a mastery score", async ({ request }) => {
  const response = await request.post("/api/mastery/events", {
    data: { levelId: LEVEL_1, kind: "direct", scorePercent: 90 }
  });

  expect(response.status()).toBe(410);
});

test("home, path, progression and module expose the same canonical score", async ({ page }, testInfo) => {
  await signUp(page, `levels-consistency-${testInfo.workerIndex}@example.test`);
  await submitCorrected(page.request);

  const scores: Array<string | null> = [];

  for (const path of ["/", "/parcours", "/progression", "/modules/comptabilite-generale"]) {
    scores.push(await canonicalScore(page, path));
  }

  expect(new Set(scores).size).toBe(1);
  expect(scores[0]).not.toBe("neutral");
});

test("an insufficient score leaves the next level gated", async ({ page }, testInfo) => {
  await signUp(page, `levels-low-${testInfo.workerIndex}@example.test`);

  // 50 on the heaviest component alone is 20/100 — well below the 75 threshold.
  await page.request.post("/api/exercises/attempts", {
    data: {
      exerciseId: DIRECT_EXERCISE,
      submission: { kind: "journal", lines: [{ account: "607", debit: 1 }] }
    }
  });

  const statuses = await levelStatuses(page);

  expect(statuses[0]).toBe("in_progress");
  expect(statuses[1]).toBe("locked");
});

test("clearing level one opens level two", async ({ page }, testInfo) => {
  await signUp(page, `levels-pass-${testInfo.workerIndex}@example.test`);

  await strengthenCriticalCompetency(page.request);
  await submitCorrected(page.request, "case_study");
  await recordRetention(page.request);

  // The diagnostic is a gate, not a weighted component: without it the level
  // stays in progress no matter how high the score is.
  const beforeDiagnostic = await levelStatuses(page);
  expect(beforeDiagnostic[0]).toBe("in_progress");
  expect(beforeDiagnostic[1]).toBe("locked");

  await recordDiagnostic(page.request);

  const statuses = await levelStatuses(page);
  expect(statuses[0]).toBe("passed");
  expect(statuses[1]).toBe("available");
  // Le déblocage est strictement séquentiel : N1 acquis ouvre N2 seulement.
  expect(statuses[2]).toBe("locked");
  expect(statuses[3]).toBe("locked");
});

test("a cleared level stays acquired after a bad later result", async ({ page }, testInfo) => {
  await signUp(page, `levels-monotonic-${testInfo.workerIndex}@example.test`);

  await completeLevelOne(page.request);
  expect((await levelStatuses(page))[0]).toBe("passed");

  // Latest-wins scoring drops the score, but acquisition is monotonic.
  await page.request.post("/api/exercises/attempts", {
    data: {
      exerciseId: DIRECT_EXERCISE,
      submission: { kind: "journal", lines: [{ account: "607", debit: 1 }] }
    }
  });

  const statuses = await levelStatuses(page);
  expect(statuses[0]).toBe("passed");
  expect(statuses[1]).toBe("available");
});

test("level two names the critical competency that still blocks it", async ({ page }, testInfo) => {
  await signUp(page, `levels-critical-${testInfo.workerIndex}@example.test`);

  await submitCorrected(page.request);
  await submitCorrected(page.request, "case_study");
  await recordRetention(page.request);
  await recordDiagnostic(page.request);

  await page.goto("/parcours");

  // Une réponse correcte ne fait monter cg-operations-courantes qu'à partir du
  // zéro personnel. La compétence reste sous le minimum de 60 et le blocker
  // doit donc identifier précisément cette compétence critique.
  await expect(page.getByText(/cg-operations-courantes/).first()).toBeVisible();
});

test("progression is private to its owner", async ({ browser }, testInfo) => {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  try {
    await signUp(pageA, `levels-owner-a-${testInfo.workerIndex}@example.test`);
    await signUp(pageB, `levels-owner-b-${testInfo.workerIndex}@example.test`);

    await completeLevelOne(pageA.request);

    expect((await levelStatuses(pageA))[0]).toBe("passed");
    // B did nothing, so B's track must be untouched by A's progress.
    expect((await levelStatuses(pageB))[0]).toBe("available");
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
