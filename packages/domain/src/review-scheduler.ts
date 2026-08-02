import type { FlashcardStatus, ReviewRating } from "./types";

/**
 * The scheduling half of active review (PR-04).
 *
 * Everything here is a pure function of its arguments — no clock, no database,
 * no randomness — because the whole point of this version is that a learner can
 * be told *why* an item comes back when it does. A spaced-repetition engine that
 * cannot be explained cannot be trusted, and a learner who does not trust the
 * schedule stops reviewing.
 *
 * THE LADDER IS FIXED. `REVIEW_INTERVAL_DAYS` maps the learner's own assessment
 * of how the recall went onto one interval, and that is the entire algorithm.
 * There is no ease factor, no per-item difficulty, no half-life estimate. The
 * cost is real and stated in `docs/adr/004-active-review-scheduler.md`: an item
 * answered correctly ten times in a row still returns after seven days, so
 * intervals do not grow with mastery. The benefit is that two learners with
 * the same history always get the same queue, the schedule is reproducible in a
 * unit test, and nothing about it has to be taken on faith.
 *
 * THE RATING IS SELF-REPORTED, AND THAT IS DELIBERATE. The item's *answer* is
 * what the learner grades themselves against, which is why `ReviewOutcome`
 * carries `revealed`: recording a rating without a reveal means the learner
 * never compared, and the stored attempt says so rather than pretending the
 * review happened normally.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_ITEM_TYPES = ["flashcard", "exercise"] as const;

/**
 * What a queue entry points at. Both already exist: `flashcard` refers to a
 * `Flashcard` id from the seeded catalogue, `exercise` to an `Exercise` id
 * graded by the PR-03 evaluators. Review adds a schedule over them rather than a
 * third kind of content.
 */
export type ReviewItemType = (typeof REVIEW_ITEM_TYPES)[number];

/**
 * The whole scheduler.
 *
 * Keyed on `ReviewRating`, the four-way self-assessment introduced with the
 * flashcards, so review and remediation speak the same vocabulary as the rest of
 * the product instead of inventing a parallel scale.
 */
export const REVIEW_INTERVAL_DAYS: Record<ReviewRating, number> = {
  forgotten: 1,
  partial: 3,
  correct: 7,
  mastered: 14
};

/** How many items one session offers before the learner has to ask for more. */
export const REVIEW_SESSION_LIMIT = 12;

/**
 * Failure is `forgotten` and nothing else.
 *
 * `partial` shortens the interval to three days and is left at that: a learner
 * who half-remembered does not need a remediation task, they need to see the
 * item again sooner. Widening this to `partial` would generate a remediation on
 * roughly every second review and the list would stop meaning anything.
 */
export function isFailedReview(rating: ReviewRating): boolean {
  return rating === "forgotten";
}

export function addDays(instant: string | Date, days: number): string {
  const base = instant instanceof Date ? instant : new Date(instant);

  return new Date(base.getTime() + days * DAY_MS).toISOString();
}

/**
 * One scheduled item. `id` is opaque: a database row id once persisted, a
 * derived `rq-<itemRef>` while the app runs on the seeded fallback.
 */
export interface ReviewQueueItem {
  id: string;
  itemType: ReviewItemType;
  itemRef: string;
  /** Which PR-02 competency this item feeds, when the content declares one. */
  competencyId: string | null;
  dueAt: string;
  intervalDays: number;
  lastRating: ReviewRating | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  /** How many times this item has been rated `forgotten`. */
  lapseCount: number;
}

export function isDue(item: ReviewQueueItem, now: Date): boolean {
  return new Date(item.dueAt).getTime() <= now.getTime();
}

/**
 * Total order over the queue: oldest due date first, ties broken on the item
 * reference.
 *
 * The tie-break is not cosmetic. Every seeded flashcard shares one due date, so
 * without it the order would depend on however the rows came back from the
 * database and the session would reshuffle between two identical requests.
 */
export function compareReviewQueueItems(left: ReviewQueueItem, right: ReviewQueueItem): number {
  const byDue = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();

  return byDue !== 0 ? byDue : left.itemRef.localeCompare(right.itemRef);
}

export function countDueItems(items: ReviewQueueItem[], now: Date): number {
  return items.filter((item) => isDue(item, now)).length;
}

export function selectDueItems(
  items: ReviewQueueItem[],
  now: Date,
  limit: number = REVIEW_SESSION_LIMIT
): ReviewQueueItem[] {
  return items
    .filter((item) => isDue(item, now))
    .sort(compareReviewQueueItems)
    .slice(0, limit);
}

export interface ReviewOutcomeInput {
  rating: ReviewRating;
  /** Whether the learner revealed the answer before rating themselves. */
  revealed: boolean;
  /**
   * The clock belongs to the application boundary, never to this reducer.
   * Requiring it keeps identical inputs reproducible in every environment.
   */
  reviewedAt: Date;
}

/** What one review does to one item. Everything the caller needs to persist. */
export interface ReviewOutcome {
  itemId: string;
  itemType: ReviewItemType;
  itemRef: string;
  competencyId: string | null;
  rating: ReviewRating;
  revealed: boolean;
  reviewedAt: string;
  /** The due date this review replaces, kept so the log can show the shift. */
  previousDueAt: string;
  nextDueAt: string;
  intervalDays: number;
  nextStatus: FlashcardStatus;
  reviewCount: number;
  lapseCount: number;
  failed: boolean;
}

/**
 * Reduces (item, rating) to the item's next state.
 *
 * Idempotent in the sense that matters for a re-review: applying the same rating
 * to the *result* of this call produces the same interval and the same next due
 * date relative to the new review time. Only the counters move, and they only
 * ever move forward.
 */
export function scheduleReview(item: ReviewQueueItem, input: ReviewOutcomeInput): ReviewOutcome {
  const reviewedAt = input.reviewedAt;
  const intervalDays = REVIEW_INTERVAL_DAYS[input.rating];
  const failed = isFailedReview(input.rating);

  return {
    itemId: item.id,
    itemType: item.itemType,
    itemRef: item.itemRef,
    competencyId: item.competencyId,
    rating: input.rating,
    revealed: input.revealed,
    reviewedAt: reviewedAt.toISOString(),
    previousDueAt: item.dueAt,
    nextDueAt: addDays(reviewedAt, intervalDays),
    intervalDays,
    nextStatus: reviewStatus(input.rating),
    reviewCount: item.reviewCount + 1,
    lapseCount: item.lapseCount + (failed ? 1 : 0),
    failed
  };
}

/**
 * Card status after a rating. Mirrors the mapping the flashcard flow already
 * used, so a card rated through the review queue and a card rated through the
 * older per-card control end up in the same state.
 */
export function reviewStatus(rating: ReviewRating): FlashcardStatus {
  if (rating === "forgotten") {
    return "due";
  }

  return rating === "mastered" ? "mastered" : "learning";
}

export const REMEDIATION_REASONS = ["failed-review", "failed-attempt"] as const;

export type RemediationReason = (typeof REMEDIATION_REASONS)[number];

export const REMEDIATION_STATUSES = ["open", "done", "dismissed"] as const;

export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

/**
 * A remediation task before it has an id or an owner.
 *
 * `dueAt` is the deferred retest: the same day the failed item itself comes
 * back, so a learner who works their queue meets the remediation and the item
 * together instead of being asked to do the same work twice on two days.
 */
export interface RemediationDraft {
  itemType: ReviewItemType;
  itemRef: string;
  competencyId: string | null;
  reason: RemediationReason;
  microLesson: string;
  nextAction: string;
  /** An exercise to re-attempt, when the content offers one. */
  exerciseId: string | null;
  dueAt: string;
}

export interface RemediationTask extends RemediationDraft {
  id: string;
  status: RemediationStatus;
  createdAt: string;
  completedAt: string | null;
}

/**
 * The remediation a failed review earns, or null when the review did not fail.
 *
 * Returning null rather than an "empty" task keeps the caller honest: there is
 * no such thing as a remediation with nothing to remediate, and a nullable
 * return makes the failure branch impossible to forget.
 */
export function planReviewRemediation(
  outcome: ReviewOutcome,
  content: { prompt: string; exerciseId?: string | null }
): RemediationDraft | null {
  if (!outcome.failed) {
    return null;
  }

  return {
    itemType: outcome.itemType,
    itemRef: outcome.itemRef,
    competencyId: outcome.competencyId,
    reason: "failed-review",
    microLesson: `Reprendre la notion avant de réessayer : ${content.prompt}`,
    nextAction:
      "Relire la règle et son exemple, puis réécrire la réponse de mémoire avant le retest.",
    exerciseId: content.exerciseId ?? null,
    dueAt: outcome.nextDueAt
  };
}

/**
 * Where a graded attempt lands on the review ladder.
 *
 * This is the join between PR-03 and PR-04: an evaluator produces a mark out of
 * 20, and the same four ratings a learner would have given themselves are read
 * off it, so one submission feeds the schedule without a second scale to
 * maintain. The bands are round percentages rather than tuned constants —
 * anything cleverer would be unexplainable, which is the failure this module
 * exists to avoid.
 */
export function ratingFromScore(score: number, maxScore = 20): ReviewRating {
  // A malformed numeric score must never become "mastered" merely because all
  // comparisons with NaN are false. Runtime validation normally prevents this,
  // but keeping the pure boundary total makes every caller safe and testable.
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return "forgotten";
  }

  const percent = maxScore <= 0 ? 0 : (score / maxScore) * 100;

  if (percent < 50) {
    return "forgotten";
  }

  if (percent < 70) {
    return "partial";
  }

  if (percent < 90) {
    return "correct";
  }

  return "mastered";
}

/** A mark at or below this, out of 20, is a failed attempt. */
export const ATTEMPT_FAILURE_SCORE = 10;

export function isFailedAttempt(score: number, maxScore = 20): boolean {
  return isFailedReview(ratingFromScore(score, maxScore));
}

/**
 * Schedules an exercise for review off the back of a graded attempt, and adds a
 * remediation task when the mark failed.
 *
 * The item is enqueued whatever the mark: retention is the point, and an
 * exercise answered well today is exactly the one worth seeing again in a week.
 */
export function planAttemptReview(input: {
  exerciseId: string;
  competencyId: string | null;
  score: number;
  maxScore?: number;
  microLesson: string;
  nextAction: string;
  reviewedAt: Date;
}): { rating: ReviewRating; intervalDays: number; dueAt: string; remediation: RemediationDraft | null } {
  const reviewedAt = input.reviewedAt;
  const rating = ratingFromScore(input.score, input.maxScore ?? 20);
  const intervalDays = REVIEW_INTERVAL_DAYS[rating];
  const dueAt = addDays(reviewedAt, intervalDays);

  return {
    rating,
    intervalDays,
    dueAt,
    remediation: isFailedReview(rating)
      ? {
          itemType: "exercise",
          itemRef: input.exerciseId,
          competencyId: input.competencyId,
          reason: "failed-attempt",
          microLesson: input.microLesson,
          nextAction: input.nextAction,
          exerciseId: input.exerciseId,
          dueAt
        }
      : null
  };
}
