import { describe, expect, it } from "vitest";
import {
  ATTEMPT_FAILURE_SCORE,
  REVIEW_INTERVAL_DAYS,
  addDays,
  compareReviewQueueItems,
  countDueItems,
  isDue,
  isFailedAttempt,
  isFailedReview,
  planAttemptReview,
  planReviewRemediation,
  ratingFromScore,
  reviewStatus,
  scheduleReview,
  selectDueItems,
  type ReviewQueueItem,
  type ReviewRating
} from "../src";

const NOW = new Date("2026-08-02T09:00:00.000Z");

function item(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: "rq-flashcard-fc-obligation-definition",
    itemType: "flashcard",
    itemRef: "fc-obligation-definition",
    competencyId: "cg-provisions",
    dueAt: "2026-08-01T09:00:00.000Z",
    intervalDays: 3,
    lastRating: "partial",
    lastReviewedAt: "2026-07-29T09:00:00.000Z",
    reviewCount: 2,
    lapseCount: 1,
    ...overrides
  };
}

describe("the interval ladder", () => {
  it("maps each self-assessment to J+1 / J+3 / J+7 / J+14", () => {
    expect(REVIEW_INTERVAL_DAYS).toEqual({
      forgotten: 1,
      partial: 3,
      correct: 7,
      mastered: 14
    });
  });

  it("schedules the next review from the moment of the review, not from the old due date", () => {
    // An item three days overdue must not come back three days early: the
    // interval runs from when the learner actually worked, otherwise a backlog
    // compounds into a queue that can never be cleared.
    const outcome = scheduleReview(item({ dueAt: "2026-07-30T09:00:00.000Z" }), {
      rating: "correct",
      revealed: true,
      reviewedAt: NOW
    });

    expect(outcome.previousDueAt).toBe("2026-07-30T09:00:00.000Z");
    expect(outcome.nextDueAt).toBe("2026-08-09T09:00:00.000Z");
    expect(outcome.intervalDays).toBe(7);
  });

  it.each([
    ["forgotten", "2026-08-03T09:00:00.000Z", 1],
    ["partial", "2026-08-05T09:00:00.000Z", 3],
    ["correct", "2026-08-09T09:00:00.000Z", 7],
    ["mastered", "2026-08-16T09:00:00.000Z", 14]
  ] as Array<[ReviewRating, string, number]>)(
    "%s reschedules to %s",
    (rating, expectedDue, expectedInterval) => {
      const outcome = scheduleReview(item(), { rating, revealed: true, reviewedAt: NOW });

      expect(outcome.nextDueAt).toBe(expectedDue);
      expect(outcome.intervalDays).toBe(expectedInterval);
    }
  );

  it("is stable across a re-review: the same rating always yields the same interval", () => {
    const first = scheduleReview(item(), { rating: "correct", revealed: true, reviewedAt: NOW });
    const second = scheduleReview(
      item({ dueAt: first.nextDueAt, intervalDays: first.intervalDays, lastRating: "correct" }),
      { rating: "correct", revealed: true, reviewedAt: new Date(first.nextDueAt) }
    );

    expect(second.intervalDays).toBe(first.intervalDays);
    expect(second.nextDueAt).toBe(addDays(first.nextDueAt, 7));
  });

  it("advances the review count and only counts a lapse on a forgotten rating", () => {
    const forgotten = scheduleReview(item(), { rating: "forgotten", revealed: true, reviewedAt: NOW });
    const remembered = scheduleReview(item(), { rating: "partial", revealed: true, reviewedAt: NOW });

    expect(forgotten.reviewCount).toBe(3);
    expect(forgotten.lapseCount).toBe(2);
    expect(remembered.reviewCount).toBe(3);
    expect(remembered.lapseCount).toBe(1);
  });

  it("carries the reveal flag into the outcome untouched", () => {
    const outcome = scheduleReview(item(), { rating: "correct", revealed: false, reviewedAt: NOW });

    expect(outcome.revealed).toBe(false);
  });

  it("maps a rating onto the card status the flashcard list already uses", () => {
    expect(reviewStatus("forgotten")).toBe("due");
    expect(reviewStatus("partial")).toBe("learning");
    expect(reviewStatus("correct")).toBe("learning");
    expect(reviewStatus("mastered")).toBe("mastered");
  });
});

describe("the due queue", () => {
  it("treats an item due exactly now as due", () => {
    expect(isDue(item({ dueAt: NOW.toISOString() }), NOW)).toBe(true);
    expect(isDue(item({ dueAt: addDays(NOW, 1) }), NOW)).toBe(false);
  });

  it("orders by due date, oldest first", () => {
    const items = [
      item({ itemRef: "b", dueAt: "2026-08-02T00:00:00.000Z" }),
      item({ itemRef: "a", dueAt: "2026-07-30T00:00:00.000Z" })
    ];

    expect(selectDueItems(items, NOW).map((entry) => entry.itemRef)).toEqual(["a", "b"]);
  });

  it("breaks ties on the item reference so one due date never means a random order", () => {
    // Every seeded flashcard shares a due date. Without the tie-break the
    // session would reshuffle between two identical requests.
    const sameDay = ["fc-c", "fc-a", "fc-b"].map((itemRef) =>
      item({ itemRef, dueAt: "2026-08-01T09:00:00.000Z" })
    );

    expect(selectDueItems(sameDay, NOW).map((entry) => entry.itemRef)).toEqual([
      "fc-a",
      "fc-b",
      "fc-c"
    ]);
    expect(compareReviewQueueItems(sameDay[1], sameDay[2])).toBeLessThan(0);
  });

  it("caps the session but still counts everything that is due", () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      item({ itemRef: `fc-${String(index).padStart(2, "0")}` })
    );

    expect(selectDueItems(items, NOW, 5)).toHaveLength(5);
    expect(countDueItems(items, NOW)).toBe(20);
  });

  it("leaves items scheduled for the future out of the session", () => {
    const items = [item({ itemRef: "due" }), item({ itemRef: "later", dueAt: addDays(NOW, 5) })];

    expect(selectDueItems(items, NOW).map((entry) => entry.itemRef)).toEqual(["due"]);
    expect(countDueItems(items, NOW)).toBe(1);
  });
});

describe("remediation after a failed review", () => {
  it("only a forgotten rating fails", () => {
    expect(isFailedReview("forgotten")).toBe(true);
    expect(isFailedReview("partial")).toBe(false);
    expect(isFailedReview("correct")).toBe(false);
    expect(isFailedReview("mastered")).toBe(false);
  });

  it("creates a task dated on the same day the failed item comes back", () => {
    const outcome = scheduleReview(item(), { rating: "forgotten", revealed: true, reviewedAt: NOW });
    const remediation = planReviewRemediation(outcome, { prompt: "Une obligation actuelle ?" });

    expect(remediation).not.toBeNull();
    expect(remediation?.reason).toBe("failed-review");
    expect(remediation?.dueAt).toBe(outcome.nextDueAt);
    expect(remediation?.dueAt).toBe("2026-08-03T09:00:00.000Z");
    expect(remediation?.competencyId).toBe("cg-provisions");
    expect(remediation?.microLesson).toContain("Une obligation actuelle ?");
  });

  it("creates nothing when the learner remembered", () => {
    for (const rating of ["partial", "correct", "mastered"] as ReviewRating[]) {
      const outcome = scheduleReview(item(), { rating, revealed: true, reviewedAt: NOW });

      expect(planReviewRemediation(outcome, { prompt: "x" }), rating).toBeNull();
    }
  });

  it("attaches an exercise to retest when the item offers one", () => {
    const outcome = scheduleReview(item({ itemType: "exercise", itemRef: "ex-provision-litige" }), {
      rating: "forgotten",
      revealed: true,
      reviewedAt: NOW
    });

    expect(
      planReviewRemediation(outcome, { prompt: "x", exerciseId: "ex-provision-litige" })?.exerciseId
    ).toBe("ex-provision-litige");
  });
});

describe("a graded attempt entering the queue", () => {
  it.each([
    [0, "forgotten"],
    [9.99, "forgotten"],
    [10, "partial"],
    [13.99, "partial"],
    [14, "correct"],
    [17.99, "correct"],
    [18, "mastered"],
    [20, "mastered"]
  ] as Array<[number, ReviewRating]>)("a mark of %s/20 reads as %s", (score, expected) => {
    expect(ratingFromScore(score)).toBe(expected);
  });

  it("puts the failure boundary at the documented mark", () => {
    expect(isFailedAttempt(ATTEMPT_FAILURE_SCORE - 0.01)).toBe(true);
    expect(isFailedAttempt(ATTEMPT_FAILURE_SCORE)).toBe(false);
  });

  it("never divides by a zero maximum", () => {
    expect(ratingFromScore(5, 0)).toBe("forgotten");
  });

  it("schedules every graded exercise, and only opens work for a failing mark", () => {
    const passed = planAttemptReview({
      exerciseId: "ex-provision-litige",
      competencyId: "cg-provisions",
      score: 16,
      microLesson: "m",
      nextAction: "n",
      reviewedAt: NOW
    });

    expect(passed.dueAt).toBe("2026-08-09T09:00:00.000Z");
    expect(passed.remediation).toBeNull();

    const failed = planAttemptReview({
      exerciseId: "ex-provision-litige",
      competencyId: "cg-provisions",
      score: 6,
      microLesson: "Reprendre les trois conditions.",
      nextAction: "Refaire l'exercice.",
      reviewedAt: NOW
    });

    expect(failed.dueAt).toBe("2026-08-03T09:00:00.000Z");
    expect(failed.remediation?.reason).toBe("failed-attempt");
    expect(failed.remediation?.itemType).toBe("exercise");
    expect(failed.remediation?.exerciseId).toBe("ex-provision-litige");
    expect(failed.remediation?.dueAt).toBe(failed.dueAt);
  });
});

describe("addDays", () => {
  it("crosses a month boundary and keeps the time of day", () => {
    expect(addDays("2026-08-31T09:00:00.000Z", 1)).toBe("2026-09-01T09:00:00.000Z");
  });
});
