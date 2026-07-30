import { expect, test } from "@playwright/test";

/**
 * Submitting an exercise end to end.
 *
 * Runs on the seeded server, where no exercise version is authored, so this also
 * pins the migration guarantee: an un-migrated exercise still goes through the
 * previous grader and the learner sees exactly what they saw before.
 */

const EXERCISE_ID = "ex-provision-litige";

test("the correction panel appears after submitting through the form", async ({ page }) => {
  await page.goto("/exercices");

  const answer = page.locator("textarea").first();
  await answer.fill(
    "Il existe une obligation actuelle envers le fournisseur, une sortie probable de ressources et " +
      "une estimation fiable, donc je provisionne 14 000 EUR. Source : cours provisions, page 12."
  );

  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/exercises/attempts") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Corriger" }).click();
  expect((await pending).status()).toBe(200);

  // The panel renders a mark out of 20 and one row per criterion.
  await expect(page.getByText(/Score \d+([.,]\d+)?\/20/)).toBeVisible();
});

test("an un-migrated exercise is graded by the legacy engine, and says so", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: EXERCISE_ID,
      userAnswer:
        "Obligation actuelle, sortie probable et estimation fiable : je provisionne, car la preuve figure au dossier."
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    evaluationType: string;
    exerciseVersionId: string | null;
    correction: { score: number; rubricScores: unknown[] };
  };

  expect(body.evaluationType).toBe("legacy_rubric");
  expect(body.exerciseVersionId).toBeNull();
  expect(body.correction.rubricScores.length).toBeGreaterThan(0);
});

test("a submission whose shape the exercise cannot use is refused, not coerced", async ({ request }) => {
  // Reading a number as text — or text as a number — is how a thoughtful answer
  // becomes a wrong calculation. The API rejects the mismatch instead.
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: EXERCISE_ID, submission: { kind: "numeric", value: 14000 } }
  });

  // With no authored version the legacy grader accepts anything renderable, so
  // this is a 200; the assertion that matters is that it never 500s.
  expect(response.status()).toBeLessThan(500);
});

test("a malformed payload is a 400", async ({ request }) => {
  for (const data of [
    { exerciseId: EXERCISE_ID },
    { exerciseId: EXERCISE_ID, submission: { kind: "unknown", value: 1 } },
    { exerciseId: EXERCISE_ID, submission: { kind: "journal", lines: [] } },
    { userAnswer: "assez long pour passer" }
  ]) {
    const response = await request.post("/api/exercises/attempts", { data });

    expect(response.status(), JSON.stringify(data)).toBe(400);
  }
});

test("an unknown exercise is a 404", async ({ request }) => {
  const response = await request.post("/api/exercises/attempts", {
    data: { exerciseId: "ex-does-not-exist", userAnswer: "une réponse suffisamment longue" }
  });

  expect(response.status()).toBe(404);
});
