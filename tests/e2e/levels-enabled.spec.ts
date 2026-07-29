import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The unlock loop against PostgreSQL, with accounts on.
 *
 * Only the `authenticated` project matches `*-enabled.spec.ts`. This is the test
 * the roadmap asks for: finishing level 1 below the threshold must leave level 2
 * gated, and finishing it above the threshold must open level 2.
 */

const STRONG_PASSWORD = "correct horse battery staple";
const LEVEL_1 = "level-compta-generale-1";

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

async function recordEvent(
  request: APIRequestContext,
  event: { levelId: string; kind: string; scorePercent: number }
) {
  const response = await request.post("/api/mastery/events", { data: event });

  expect(response.status(), `${event.kind} @ ${event.scorePercent}`).toBe(201);
}

async function levelStatuses(page: Page): Promise<string[]> {
  await page.goto("/parcours");
  await expect(page.locator("[data-level-status]")).toHaveCount(4);

  return page
    .locator("[data-level-status]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-level-status") ?? ""));
}

test("recording an event requires a session", async ({ request }) => {
  const response = await request.post("/api/mastery/events", {
    data: { levelId: LEVEL_1, kind: "direct", scorePercent: 90 }
  });

  expect(response.status()).toBe(401);
});

test("an insufficient score leaves the next level gated", async ({ page }, testInfo) => {
  await signUp(page, `levels-low-${testInfo.workerIndex}@example.test`);

  // 50 on the heaviest component alone is 20/100 — well below the 75 threshold.
  await recordEvent(page.request, { levelId: LEVEL_1, kind: "direct", scorePercent: 50 });

  const statuses = await levelStatuses(page);

  expect(statuses[0]).toBe("in-progress");
  expect(statuses[1]).toBe("locked");
});

test("clearing level one opens level two", async ({ page }, testInfo) => {
  await signUp(page, `levels-pass-${testInfo.workerIndex}@example.test`);

  for (const kind of ["direct", "retention", "caseStudy", "explanation"]) {
    await recordEvent(page.request, { levelId: LEVEL_1, kind, scorePercent: 90 });
  }

  // The diagnostic is a gate, not a weighted component: without it the level
  // stays in progress no matter how high the score is.
  const beforeDiagnostic = await levelStatuses(page);
  expect(beforeDiagnostic[0]).toBe("in-progress");
  expect(beforeDiagnostic[1]).toBe("locked");

  await recordEvent(page.request, { levelId: LEVEL_1, kind: "finalDiagnostic", scorePercent: 100 });

  const statuses = await levelStatuses(page);
  expect(statuses[0]).toBe("acquired");
  expect(statuses[1]).toBe("available");
  expect(statuses[2]).toBe("locked");
});

test("a cleared level stays acquired after a bad later result", async ({ page }, testInfo) => {
  await signUp(page, `levels-monotonic-${testInfo.workerIndex}@example.test`);

  for (const kind of ["direct", "retention", "caseStudy", "explanation"]) {
    await recordEvent(page.request, { levelId: LEVEL_1, kind, scorePercent: 90 });
  }
  await recordEvent(page.request, { levelId: LEVEL_1, kind: "finalDiagnostic", scorePercent: 100 });
  expect((await levelStatuses(page))[0]).toBe("acquired");

  // Latest-wins scoring drops the score, but acquisition is monotonic.
  await recordEvent(page.request, { levelId: LEVEL_1, kind: "direct", scorePercent: 5 });

  const statuses = await levelStatuses(page);
  expect(statuses[0]).toBe("acquired");
  expect(statuses[1]).toBe("available");
});

test("level two names the critical competency that still blocks it", async ({ page }, testInfo) => {
  await signUp(page, `levels-critical-${testInfo.workerIndex}@example.test`);

  for (const kind of ["direct", "retention", "caseStudy", "explanation"]) {
    await recordEvent(page.request, { levelId: LEVEL_1, kind, scorePercent: 90 });
  }
  await recordEvent(page.request, { levelId: LEVEL_1, kind: "finalDiagnostic", scorePercent: 100 });

  await page.goto("/parcours");

  // cg-provisions is seeded at 45, under the 60 minimum, so level 2 opens but
  // cannot be cleared until it is raised. The learner must be told which one.
  await expect(page.getByText(/cg-provisions/).first()).toBeVisible();
});

test("progression is private to its owner", async ({ browser }, testInfo) => {
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  try {
    await signUp(pageA, `levels-owner-a-${testInfo.workerIndex}@example.test`);
    await signUp(pageB, `levels-owner-b-${testInfo.workerIndex}@example.test`);

    for (const kind of ["direct", "retention", "caseStudy", "explanation"]) {
      await recordEvent(pageA.request, { levelId: LEVEL_1, kind, scorePercent: 90 });
    }
    await recordEvent(pageA.request, { levelId: LEVEL_1, kind: "finalDiagnostic", scorePercent: 100 });

    expect((await levelStatuses(pageA))[0]).toBe("acquired");
    // B did nothing, so B's track must be untouched by A's progress.
    expect((await levelStatuses(pageB))[0]).toBe("available");
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
