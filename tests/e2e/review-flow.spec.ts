import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The active review loop end to end: hidden answer, deliberate reveal,
 * self-assessment, reschedule, remediation.
 *
 * Runs on the seeded server, so nothing here is persisted — and that is the
 * point. The queue, the ladder and the remediation are computed by the same code
 * a database-backed run uses; only the storage differs. A regression in any of
 * them fails here without needing PostgreSQL.
 */

const REVEAL = "Afficher la réponse";

/** A card that exists in the seeded catalogue, used for the API-level checks. */
const KNOWN_CARD = "fc-obligation-definition";
const KNOWN_ANSWER = "Un evenement passe cree une responsabilite presente envers un tiers.";

/**
 * The item the review screen actually puts first.
 *
 * Derived rather than hard-coded: the session shows the twelve oldest due items,
 * so naming a card here would make these tests depend on the seed's ordering and
 * pass vacuously the day it changes.
 */
async function firstDueItem(request: APIRequestContext) {
  const response = await request.get("/api/revisions/due");
  expect(response.status()).toBe(200);

  const { queue } = (await response.json()) as {
    queue: { entries: Array<{ itemType: string; itemRef: string; prompt: string }> };
  };

  expect(queue.entries.length, "the seeded queue should not be empty").toBeGreaterThan(0);

  return queue.entries[0];
}

async function answerFor(request: APIRequestContext, item: { itemType: string; itemRef: string }) {
  const response = await request.post("/api/revisions/reveal", {
    data: { itemType: item.itemType, itemRef: item.itemRef }
  });
  expect(response.status()).toBe(200);

  return ((await response.json()) as { item: { answer: string } }).item.answer;
}

test.describe("the answer stays hidden until the learner asks", () => {
  test("the answer to the first due item is absent from the page source", async ({
    page,
    request
  }) => {
    const item = await firstDueItem(request);
    const answer = await answerFor(request, item);

    const response = await page.goto("/revisions");

    // Read the server's own bytes, not the rendered DOM: an answer shipped in
    // the RSC payload and merely styled away would still be readable here, and
    // a learner who can read the answer is not testing recall.
    const html = (await response?.text()) ?? "";

    expect(answer.length, "the reveal endpoint should return real content").toBeGreaterThan(0);
    expect(html).not.toContain(answer);
    await expect(page.getByText(answer)).toHaveCount(0);
    await expect(page.getByRole("button", { name: REVEAL }).first()).toBeVisible();
  });

  test("the rating buttons are disabled, and say why, until the answer is revealed", async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name === "public-demo", "writes are refused for a different reason");

    await page.goto("/revisions");

    const card = page.locator("article.flashcard").first();

    await expect(card.getByRole("button", { name: "Pas su" })).toBeDisabled();
    await expect(card.getByText("Affiche la réponse avant de t'auto-évaluer.")).toBeVisible();

    await card.getByRole("button", { name: REVEAL }).click();

    await expect(card.getByText("Réponse attendue")).toBeVisible();
    await expect(card.getByRole("button", { name: "Pas su" })).toBeEnabled();
  });
});

test("revealing fetches the answer from the server rather than unhiding it", async ({
  page,
  request
}) => {
  const item = await firstDueItem(request);
  const answer = await answerFor(request, item);

  await page.goto("/revisions");

  const card = page.locator(`article.flashcard[data-item-ref="${item.itemRef}"]`);
  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/revisions/reveal") && response.request().method() === "POST"
  );

  await card.getByRole("button", { name: REVEAL }).click();

  expect((await pending).status()).toBe(200);
  await expect(card.getByText(answer)).toBeVisible();
});

test("rating an item « Pas su » reschedules it and opens a remediation", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  await page.goto("/revisions");

  const card = page.locator("article.flashcard").first();

  await card.getByRole("button", { name: REVEAL }).click();
  await expect(card.getByText("Réponse attendue")).toBeVisible();

  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/revisions/review") && response.request().method() === "POST"
  );

  await card.getByRole("button", { name: "Pas su" }).click();
  expect((await pending).status()).toBe(200);

  // J+1 for a forgotten item, and the failure earns a dated retest.
  await expect(card.getByText(/Prochaine révision : \d{4}-\d{2}-\d{2} \(dans 1 jour\)/)).toBeVisible();
  await expect(card.getByText("Remédiation créée")).toBeVisible();
  await expect(card.getByText(/Retest prévu le \d{4}-\d{2}-\d{2}/)).toBeVisible();

  // One rating per item per session: the buttons close once the item is done.
  await expect(card.getByRole("button", { name: "Pas su" })).toBeDisabled();
});

test("a remembered item is pushed further out and creates no work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  await page.goto("/revisions");

  const card = page.locator("article.flashcard").first();

  await card.getByRole("button", { name: REVEAL }).click();
  await card.getByRole("button", { name: "Su", exact: true }).click();

  await expect(card.getByText(/Prochaine révision : \d{4}-\d{2}-\d{2} \(dans 7 jours\)/)).toBeVisible();
  await expect(card.getByText("Remédiation créée")).toHaveCount(0);
});

test("the API schedules on the documented ladder", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  const ladder = [
    { rating: "forgotten", intervalDays: 1, remediated: true },
    { rating: "partial", intervalDays: 3, remediated: false },
    { rating: "correct", intervalDays: 7, remediated: false },
    { rating: "mastered", intervalDays: 14, remediated: false }
  ];

  for (const step of ladder) {
    const response = await request.post("/api/revisions/review", {
      data: {
        itemType: "flashcard",
        itemRef: KNOWN_CARD,
        rating: step.rating,
        revealed: true
      }
    });

    expect(response.status(), step.rating).toBe(200);

    const body = (await response.json()) as {
      outcome: { intervalDays: number; nextDueAt: string; revealed: boolean };
      remediation: { dueAt: string; reason: string } | null;
      persisted: boolean;
    };

    expect(body.outcome.intervalDays, step.rating).toBe(step.intervalDays);
    expect(body.outcome.revealed).toBe(true);
    expect(Boolean(body.remediation), step.rating).toBe(step.remediated);

    if (body.remediation) {
      // The retest lands the day the failed item itself comes back.
      expect(body.remediation.dueAt).toBe(body.outcome.nextDueAt);
      expect(body.remediation.reason).toBe("failed-review");
    }
  }
});

test("the legacy flashcardId payload still means a flashcard", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  const response = await request.post("/api/revisions/review", {
    data: { flashcardId: KNOWN_CARD, rating: "correct" }
  });

  expect(response.status()).toBe(200);
  expect(((await response.json()) as { outcome: { itemRef: string } }).outcome.itemRef).toBe(
    KNOWN_CARD
  );
});

test("an unknown item is a 404 and a malformed payload a 400", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  const missing = await request.post("/api/revisions/review", {
    data: { itemRef: "fc-does-not-exist", rating: "correct", revealed: true }
  });
  expect(missing.status()).toBe(404);

  for (const data of [
    { rating: "correct" },
    { itemRef: KNOWN_CARD },
    { itemRef: KNOWN_CARD, rating: "brilliant" },
    { itemType: "lesson", itemRef: KNOWN_CARD, rating: "correct" }
  ]) {
    const response = await request.post("/api/revisions/review", { data });

    expect(response.status(), JSON.stringify(data)).toBe(400);
  }
});

test("the queue payload never carries an answer", async ({ request }) => {
  const response = await request.get("/api/revisions/due");

  expect(response.status()).toBe(200);

  const body = await response.text();

  expect(body).not.toContain(KNOWN_ANSWER);
  expect(body).not.toContain('"answer"');

  const { queue } = JSON.parse(body) as {
    queue: { entries: Array<{ prompt: string; dueAt: string }>; dueCount: number };
  };

  expect(queue.dueCount).toBeGreaterThan(0);
  expect(queue.entries.length).toBeGreaterThan(0);

  // Oldest first, and deterministically so.
  const dueDates = queue.entries.map((entry) => entry.dueAt);
  expect([...dueDates].sort()).toEqual(dueDates);
});

test("revealing is a read, so even the public demo may study", async ({ request }) => {
  const response = await request.post("/api/revisions/reveal", {
    data: { itemType: "flashcard", itemRef: KNOWN_CARD }
  });

  expect(response.status()).toBe(200);
  expect(((await response.json()) as { item: { answer: string } }).item.answer).toBe(KNOWN_ANSWER);
});

test("a graded submission tells the learner when the exercise comes back", async ({
  request
}, testInfo) => {
  test.skip(testInfo.project.name === "public-demo", "the public demo refuses every write");

  const response = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: "ex-provision-litige",
      userAnswer: "Une réponse trop vague pour couvrir le moindre critère du barème."
    }
  });

  expect(response.status()).toBe(200);

  const body = (await response.json()) as {
    correction: { score: number };
    review: { intervalDays: number; dueAt: string; remediation: { reason: string } | null };
  };

  // Grading and retention are one act: every graded exercise is scheduled.
  expect(body.review).toBeDefined();
  expect([1, 3, 7, 14]).toContain(body.review.intervalDays);

  if (body.correction.score < 10) {
    expect(body.review.intervalDays).toBe(1);
    expect(body.review.remediation?.reason).toBe("failed-attempt");
  }
});

test("the dashboard offers the session and counts what is due", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Réviser 5 min" });

  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(/\/revisions/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
