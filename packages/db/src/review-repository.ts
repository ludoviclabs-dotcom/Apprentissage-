import { and, asc, eq } from "drizzle-orm";
import {
  REVIEW_ITEM_TYPES,
  REVIEW_SESSION_LIMIT,
  countDueItems,
  isDue,
  planAttemptReview,
  planReviewRemediation,
  scheduleReview,
  selectDueItems,
  type Exercise,
  type Flashcard,
  type RemediationDraft,
  type RemediationStatus,
  type RemediationTask,
  type ReviewItemType,
  type ReviewOutcome,
  type ReviewQueueItem,
  type ReviewRating,
  type SourceReference
} from "@finance/domain";
import { canUseDatabase, type FinanceDb } from "./client";
import {
  flashcardStatesTable,
  remediationTasksTable,
  reviewAttemptsTable,
  reviewQueueTable
} from "./drizzle-schema";
import { getExercises, getFlashcards } from "./repository";
import { assertUserId, withUserContext } from "./user-context";

/**
 * Persistence for the active review loop of `@finance/domain/review-scheduler`.
 *
 * THE ANSWER IS NEVER PART OF A QUEUE READ. `ReviewQueueEntry` carries the
 * prompt and nothing else; the back of a card is only obtainable through
 * {@link revealReviewItem}. That is a structural guarantee rather than a styling
 * one — a hidden `<details>` still ships the answer in the HTML, and a learner
 * who can read it in the page source is not testing recall, they are reading. It
 * also means the reveal is a request the server sees, which is what makes
 * `review_attempts.revealed` worth recording.
 *
 * THE QUEUE IS A UNION, NOT A TABLE READ. Items come from two places: rows in
 * `review_queue`, which are this learner's actual schedule, and the seeded
 * flashcard catalogue, which supplies a starting due date for every card nobody
 * has rated yet. Merging them on read is what lets a brand-new account have a
 * queue at all, and what lets a card added to the catalogue later appear without
 * a backfill.
 *
 * SEEDED MODE IS A FIRST-CLASS PATH. With no database the whole loop still works
 * — the queue is derived, a review is scheduled, a remediation is planned — it
 * simply is not stored, and every result says so through `persisted: false`. The
 * public demo runs this way, and so does the default Playwright project, so the
 * flow that CI exercises is the flow a visitor gets.
 */

// --- Content resolution ----------------------------------------------------
//
// A queue entry is `(itemType, itemRef)`, which points into one of two
// catalogues. This is the only place that split is resolved.

/** Everything about an item, including what must stay hidden until revealed. */
interface ReviewContent {
  itemType: ReviewItemType;
  itemRef: string;
  kindLabel: string;
  prompt: string;
  answer: string;
  explanation: string;
  competencyId: string | null;
  /** An exercise the learner can re-attempt; itself when the item is one. */
  exerciseId: string | null;
  sourceReferences: SourceReference[];
  /** Due date to start from when this item has never been reviewed. */
  defaultDueAt: string;
  defaultIntervalDays: number;
}

function contentKey(itemType: ReviewItemType, itemRef: string): string {
  return `${itemType}:${itemRef}`;
}

function flashcardContent(card: Flashcard): ReviewContent {
  return {
    itemType: "flashcard",
    itemRef: card.id,
    kindLabel: card.type,
    prompt: card.front,
    answer: card.back,
    explanation: card.explanation,
    competencyId: card.competencyIds[0] ?? null,
    exerciseId: null,
    sourceReferences: card.sourceReferences,
    defaultDueAt: card.dueAt,
    defaultIntervalDays: card.intervalDays
  };
}

function exerciseContent(exercise: Exercise): ReviewContent {
  return {
    itemType: "exercise",
    itemRef: exercise.id,
    kindLabel: exercise.type,
    prompt: exercise.statement,
    answer: exercise.expectedAnswer,
    explanation: exercise.rubric.map((item) => `${item.label} (${item.points} pts)`).join(" · "),
    competencyId: exercise.competencyIds[0] ?? null,
    exerciseId: exercise.id,
    sourceReferences: [],
    // Exercises never enter the queue from the catalogue — only a graded attempt
    // puts one there — so this default is only ever a fallback for a stored row
    // whose date is somehow missing.
    defaultDueAt: new Date().toISOString(),
    defaultIntervalDays: 0
  };
}

async function loadReviewContent(userId?: string | null): Promise<Map<string, ReviewContent>> {
  const [flashcards, exercises] = await Promise.all([getFlashcards(userId), getExercises()]);
  const content = new Map<string, ReviewContent>();

  for (const card of flashcards) {
    content.set(contentKey("flashcard", card.id), flashcardContent(card));
  }

  for (const exercise of exercises) {
    content.set(contentKey("exercise", exercise.id), exerciseContent(exercise));
  }

  return content;
}

/**
 * The schedule an item has before anybody has reviewed it.
 *
 * Only flashcards get one from the catalogue: the seeded cards carry an authored
 * due date, which is what gives a new account something to revise on day one.
 */
function catalogueItem(content: ReviewContent): ReviewQueueItem {
  return {
    id: `rq-${content.itemType}-${content.itemRef}`,
    itemType: content.itemType,
    itemRef: content.itemRef,
    competencyId: content.competencyId,
    dueAt: content.defaultDueAt,
    intervalDays: content.defaultIntervalDays,
    lastRating: null,
    lastReviewedAt: null,
    reviewCount: 0,
    lapseCount: 0
  };
}

function isReviewItemType(value: string): value is ReviewItemType {
  return (REVIEW_ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * A stored row read back as its domain type.
 *
 * Returns null on an `item_type` outside the union rather than casting: the
 * column has a CHECK constraint, so a value outside it means the row was written
 * by something other than this application, and guessing which catalogue it
 * meant would schedule the wrong content.
 */
function toQueueItem(row: typeof reviewQueueTable.$inferSelect): ReviewQueueItem | null {
  if (!isReviewItemType(row.itemType)) {
    return null;
  }

  return {
    id: row.id,
    itemType: row.itemType,
    itemRef: row.itemRef,
    competencyId: row.competencyId,
    dueAt: row.dueAt,
    intervalDays: row.intervalDays,
    lastRating: (row.lastRating as ReviewRating | null) ?? null,
    lastReviewedAt: row.lastReviewedAt,
    reviewCount: row.reviewCount,
    lapseCount: row.lapseCount
  };
}

function toRemediationTask(row: typeof remediationTasksTable.$inferSelect): RemediationTask | null {
  if (!isReviewItemType(row.itemType)) {
    return null;
  }

  return {
    id: row.id,
    itemType: row.itemType,
    itemRef: row.itemRef,
    competencyId: row.competencyId,
    reason: row.reason as RemediationTask["reason"],
    microLesson: row.microLesson,
    nextAction: row.nextAction,
    exerciseId: row.exerciseId,
    dueAt: row.dueAt,
    status: row.status as RemediationStatus,
    createdAt: row.createdAt,
    completedAt: row.completedAt
  };
}

// --- Reading the queue -----------------------------------------------------

/** One item as the review screen sees it. Deliberately carries no answer. */
export interface ReviewQueueEntry {
  itemType: ReviewItemType;
  itemRef: string;
  kindLabel: string;
  prompt: string;
  competencyId: string | null;
  dueAt: string;
  intervalDays: number;
  lastRating: ReviewRating | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
  due: boolean;
}

export interface ReviewQueueView {
  generatedAt: string;
  /** The session: due items only, oldest first, capped at the session limit. */
  entries: ReviewQueueEntry[];
  /** Everything due, including what did not fit in this session. */
  dueCount: number;
  /** Everything scheduled, due or not. */
  totalCount: number;
  /** False in seeded mode: the schedule is computed but not stored. */
  persisted: boolean;
}

function toEntry(item: ReviewQueueItem, content: ReviewContent, now: Date): ReviewQueueEntry {
  return {
    itemType: item.itemType,
    itemRef: item.itemRef,
    kindLabel: content.kindLabel,
    prompt: content.prompt,
    competencyId: item.competencyId,
    dueAt: item.dueAt,
    intervalDays: item.intervalDays,
    lastRating: item.lastRating,
    lastReviewedAt: item.lastReviewedAt,
    reviewCount: item.reviewCount,
    lapseCount: item.lapseCount,
    due: isDue(item, now)
  };
}

async function readStoredQueue(userId: string): Promise<ReviewQueueItem[]> {
  const rows = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(reviewQueueTable)
      .orderBy(asc(reviewQueueTable.dueAt))
  );

  return rows.map(toQueueItem).filter((item): item is ReviewQueueItem => item !== null);
}

/**
 * Merges the learner's stored schedule over the catalogue defaults.
 *
 * A stored row always wins: it is the record of work actually done. A stored row
 * whose content no longer exists is dropped rather than rendered as an empty
 * card — deleting a flashcard should remove it from the queue, not leave a
 * prompt nobody can answer.
 */
function mergeQueue(
  content: Map<string, ReviewContent>,
  stored: ReviewQueueItem[]
): ReviewQueueItem[] {
  const items = new Map<string, ReviewQueueItem>();

  for (const [key, entry] of content) {
    // Exercises only enter the queue once attempted, so they need a stored row.
    if (entry.itemType === "flashcard") {
      items.set(key, catalogueItem(entry));
    }
  }

  for (const item of stored) {
    const key = contentKey(item.itemType, item.itemRef);

    if (content.has(key)) {
      items.set(key, item);
    }
  }

  return [...items.values()];
}

export async function getReviewQueue(
  userId?: string | null,
  now: Date = new Date(),
  limit: number = REVIEW_SESSION_LIMIT
): Promise<ReviewQueueView> {
  const content = await loadReviewContent(userId);
  const persisted = canUseDatabase() && Boolean(userId);
  const stored = persisted ? await readStoredQueue(userId as string) : [];
  const items = mergeQueue(content, stored);

  return {
    generatedAt: now.toISOString(),
    entries: selectDueItems(items, now, limit).map((item) =>
      toEntry(item, content.get(contentKey(item.itemType, item.itemRef)) as ReviewContent, now)
    ),
    dueCount: countDueItems(items, now),
    totalCount: items.length,
    persisted
  };
}

// --- Revealing -------------------------------------------------------------

export interface RevealedReviewItem {
  itemType: ReviewItemType;
  itemRef: string;
  answer: string;
  explanation: string;
  sourceReferences: SourceReference[];
}

/**
 * The second half of a card, fetched only when the learner asks for it.
 *
 * Returns null for an unknown item so the caller can answer 404 instead of
 * inventing an empty answer the learner would grade themselves against.
 */
export async function revealReviewItem(
  userId: string | null | undefined,
  itemType: ReviewItemType,
  itemRef: string
): Promise<RevealedReviewItem | null> {
  const content = (await loadReviewContent(userId)).get(contentKey(itemType, itemRef));

  if (!content) {
    return null;
  }

  return {
    itemType,
    itemRef,
    answer: content.answer,
    explanation: content.explanation,
    sourceReferences: content.sourceReferences
  };
}

// --- Recording a review ----------------------------------------------------

export interface RecordReviewInput {
  itemType: ReviewItemType;
  itemRef: string;
  rating: ReviewRating;
  /** Whether the learner revealed the answer before rating themselves. */
  revealed: boolean;
  reviewedAt?: Date;
}

export interface RecordReviewResult {
  outcome: ReviewOutcome;
  /** Null unless the review failed. */
  remediation: RemediationDraft | null;
  /** Set only when the remediation was stored. */
  remediationId: string | null;
  persisted: boolean;
}

/**
 * Records one self-assessment: reschedules the item, appends to the log, and
 * opens a remediation task when the learner did not know the answer.
 *
 * Everything happens in a single transaction, which is also the scope
 * `withUserContext` binds `app.current_user_id` in, so row level security
 * applies to every statement. Returns null when the item does not exist.
 */
export async function recordReviewOutcome(
  userId: string | null | undefined,
  input: RecordReviewInput
): Promise<RecordReviewResult | null> {
  const content = (await loadReviewContent(userId)).get(contentKey(input.itemType, input.itemRef));

  if (!content) {
    return null;
  }

  const schedule = (item: ReviewQueueItem) =>
    scheduleReview(item, {
      rating: input.rating,
      revealed: input.revealed,
      reviewedAt: input.reviewedAt
    });

  if (!canUseDatabase()) {
    // Seeded mode: the same computation, kept in memory. `persisted: false` is
    // what the UI shows the learner, so "not recorded" is never mistaken for
    // "recorded and lost".
    const outcome = schedule(catalogueItem(content));

    return {
      outcome,
      remediation: planReviewRemediation(outcome, {
        prompt: content.prompt,
        exerciseId: content.exerciseId
      }),
      remediationId: null,
      persisted: false
    };
  }

  assertUserId(userId, "recordReviewOutcome");

  return withUserContext(userId as string, async (tx) => {
    const existing = await selectQueueRow(tx, userId as string, input.itemType, input.itemRef);
    const outcome = schedule(existing ?? catalogueItem(content));
    const queueItemId = await upsertQueueRow(tx, userId as string, outcome, {
      competencyId: content.competencyId,
      source: existing ? undefined : "catalogue"
    });

    const [attempt] = await tx
      .insert(reviewAttemptsTable)
      .values({
        userId: userId as string,
        queueItemId,
        itemType: outcome.itemType,
        itemRef: outcome.itemRef,
        rating: outcome.rating,
        revealed: outcome.revealed,
        intervalDays: outcome.intervalDays,
        previousDueAt: outcome.previousDueAt,
        nextDueAt: outcome.nextDueAt,
        reviewedAt: outcome.reviewedAt
      })
      .returning({ id: reviewAttemptsTable.id });

    // The flashcard overlay of PR-02 is written too, so the card list and the
    // queue can never disagree about when a card comes back.
    if (outcome.itemType === "flashcard") {
      await upsertFlashcardState(tx, userId as string, outcome);
    }

    const remediation = planReviewRemediation(outcome, {
      prompt: content.prompt,
      exerciseId: content.exerciseId
    });

    const remediationId = remediation
      ? await openRemediationTask(tx, userId as string, remediation, {
          queueItemId,
          reviewAttemptId: attempt?.id ?? null
        })
      : null;

    return { outcome, remediation, remediationId, persisted: true };
  });
}

async function selectQueueRow(
  tx: FinanceDb,
  userId: string,
  itemType: ReviewItemType,
  itemRef: string
): Promise<ReviewQueueItem | null> {
  const rows = await tx
    .select()
    .from(reviewQueueTable)
    .where(
      and(
        eq(reviewQueueTable.userId, userId),
        eq(reviewQueueTable.itemType, itemType),
        eq(reviewQueueTable.itemRef, itemRef)
      )
    )
    .limit(1);

  return rows[0] ? toQueueItem(rows[0]) : null;
}

/**
 * Writes the item's new schedule, inserting the row the first time.
 *
 * The conflict target is the `(user_id, item_type, item_ref)` uniqueness of
 * migration 0007, which is what makes a second review of the same item move the
 * existing schedule instead of adding a duplicate entry to the session.
 */
async function upsertQueueRow(
  tx: FinanceDb,
  userId: string,
  outcome: ReviewOutcome,
  extra: { competencyId: string | null; source?: "catalogue" | "attempt" | "remediation" }
): Promise<string> {
  const next = {
    competencyId: outcome.competencyId ?? extra.competencyId,
    dueAt: outcome.nextDueAt,
    intervalDays: outcome.intervalDays,
    lastRating: outcome.rating,
    lastReviewedAt: outcome.reviewedAt,
    reviewCount: outcome.reviewCount,
    lapseCount: outcome.lapseCount
  };

  const [row] = await tx
    .insert(reviewQueueTable)
    .values({
      userId,
      itemType: outcome.itemType,
      itemRef: outcome.itemRef,
      source: extra.source ?? "catalogue",
      ...next
    })
    .onConflictDoUpdate({
      target: [reviewQueueTable.userId, reviewQueueTable.itemType, reviewQueueTable.itemRef],
      set: next
    })
    .returning({ id: reviewQueueTable.id });

  return row.id;
}

async function upsertFlashcardState(tx: FinanceDb, userId: string, outcome: ReviewOutcome) {
  const state = {
    status: outcome.nextStatus,
    dueAt: outcome.nextDueAt,
    intervalDays: outcome.intervalDays,
    updatedAt: outcome.reviewedAt
  };

  await tx
    .insert(flashcardStatesTable)
    .values({ userId, flashcardId: outcome.itemRef, ...state })
    .onConflictDoUpdate({
      target: [flashcardStatesTable.userId, flashcardStatesTable.flashcardId],
      set: state
    });
}

/**
 * Opens a remediation task unless one is already open for the same item.
 *
 * Checked rather than left to `ON CONFLICT`, because the uniqueness in migration
 * 0007 is a *partial* index and the existing task's id is worth returning: the
 * learner is told "you already owe yourself this" instead of silently getting
 * nothing back. The index remains the guarantee; this is the path that keeps it
 * from ever firing.
 */
async function openRemediationTask(
  tx: FinanceDb,
  userId: string,
  draft: RemediationDraft,
  provenance: { queueItemId: string | null; reviewAttemptId: string | null }
): Promise<string> {
  const open = await tx
    .select({ id: remediationTasksTable.id })
    .from(remediationTasksTable)
    .where(
      and(
        eq(remediationTasksTable.userId, userId),
        eq(remediationTasksTable.itemType, draft.itemType),
        eq(remediationTasksTable.itemRef, draft.itemRef),
        eq(remediationTasksTable.status, "open")
      )
    )
    .limit(1);

  if (open[0]) {
    return open[0].id;
  }

  const [created] = await tx
    .insert(remediationTasksTable)
    .values({
      userId,
      queueItemId: provenance.queueItemId,
      reviewAttemptId: provenance.reviewAttemptId,
      itemType: draft.itemType,
      itemRef: draft.itemRef,
      competencyId: draft.competencyId,
      reason: draft.reason,
      microLesson: draft.microLesson,
      nextAction: draft.nextAction,
      exerciseId: draft.exerciseId,
      status: "open",
      dueAt: draft.dueAt
    })
    .returning({ id: remediationTasksTable.id });

  return created.id;
}

// --- Remediation -----------------------------------------------------------

/**
 * A learner's open remediation tasks, soonest first.
 *
 * Empty in seeded mode and for an anonymous visitor, and deliberately so: unlike
 * the catalogue, a remediation is a claim about what *this person* got wrong.
 * Falling back to seeded rows would present somebody else's mistakes as theirs,
 * which is the failure `getErrorJournal` documents at length.
 */
export async function getRemediationTasks(
  userId?: string | null,
  status: RemediationStatus = "open"
): Promise<RemediationTask[]> {
  if (!canUseDatabase() || !userId) {
    return [];
  }

  const rows = await withUserContext(userId, (tx) =>
    tx
      .select()
      .from(remediationTasksTable)
      .where(eq(remediationTasksTable.status, status))
      .orderBy(asc(remediationTasksTable.dueAt))
  );

  return rows.map(toRemediationTask).filter((task): task is RemediationTask => task !== null);
}

/** Closes a task. Returns false when it does not exist or is already closed. */
export async function closeRemediationTask(
  userId: string,
  taskId: string,
  status: Exclude<RemediationStatus, "open"> = "done"
): Promise<boolean> {
  if (!canUseDatabase()) {
    return false;
  }

  assertUserId(userId, "closeRemediationTask");

  const updated = await withUserContext(userId, (tx) =>
    tx
      .update(remediationTasksTable)
      .set({ status, completedAt: new Date().toISOString() })
      .where(and(eq(remediationTasksTable.id, taskId), eq(remediationTasksTable.status, "open")))
      .returning({ id: remediationTasksTable.id })
  );

  return updated.length > 0;
}

// --- The bridge from PR-03 -------------------------------------------------

export interface AttemptReviewResult {
  rating: ReviewRating;
  intervalDays: number;
  dueAt: string;
  remediation: RemediationDraft | null;
  persisted: boolean;
}

/**
 * Schedules an exercise for review after it has been graded, and opens a
 * remediation task when the mark failed.
 *
 * Called from `submitAttempt`, which is the single path an answer takes, so
 * every graded submission feeds retention without the API having to remember to
 * ask. The item is enqueued whatever the mark — an exercise answered well today
 * is exactly the one worth seeing again in a week — and only the failure branch
 * creates work.
 */
export async function enqueueAttemptReview(input: {
  userId: string | null | undefined;
  exercise: Exercise;
  score: number;
  microLesson: string;
  nextAction: string;
  reviewedAt?: Date;
}): Promise<AttemptReviewResult> {
  const plan = planAttemptReview({
    exerciseId: input.exercise.id,
    competencyId: input.exercise.competencyIds[0] ?? null,
    score: input.score,
    microLesson: input.microLesson,
    nextAction: input.nextAction,
    reviewedAt: input.reviewedAt
  });

  if (!canUseDatabase() || !input.userId) {
    return { ...plan, persisted: false };
  }

  await withUserContext(input.userId, async (tx) => {
    const competencyId = input.exercise.competencyIds[0] ?? null;
    const next = {
      competencyId,
      dueAt: plan.dueAt,
      intervalDays: plan.intervalDays,
      lastRating: plan.rating,
      lastReviewedAt: (input.reviewedAt ?? new Date()).toISOString(),
      source: "attempt" as const
    };

    // No `review_attempts` row: this was an exercise submission, not a review.
    // The attempt is already recorded in `attempts` by `recordAttempt`, and
    // duplicating it here would double-count the learner's history.
    const [row] = await tx
      .insert(reviewQueueTable)
      .values({
        userId: input.userId as string,
        itemType: "exercise",
        itemRef: input.exercise.id,
        ...next
      })
      .onConflictDoUpdate({
        target: [reviewQueueTable.userId, reviewQueueTable.itemType, reviewQueueTable.itemRef],
        set: next
      })
      .returning({ id: reviewQueueTable.id });

    if (plan.remediation) {
      await openRemediationTask(tx, input.userId as string, plan.remediation, {
        queueItemId: row?.id ?? null,
        reviewAttemptId: null
      });
    }
  });

  return { ...plan, persisted: true };
}
