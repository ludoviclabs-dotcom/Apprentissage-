import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Exercise } from "@finance/domain";
import { migrationFiles } from "../src/schema";

/**
 * The persisted half of active review, against a real PostgreSQL.
 *
 * The unit tests prove the ladder; this proves the parts a pure function cannot:
 * that a schedule is private to its owner, that reviewing the same item twice
 * moves one row instead of adding a second, that failing it twice leaves exactly
 * one open remediation, and that the flashcard overlay written by PR-02 stays in
 * step with the queue.
 *
 * Skips loudly without a database, and CI fails on the warning: an unverified
 * isolation claim must never read as a passing one.
 */

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    "[review-queue.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — review isolation is NOT verified in this run."
  );
}

/**
 * Fixture content, inserted here and removed afterwards, as the sibling
 * integration suites do with `ex-rls` and `ex-pool`.
 *
 * The first version of this file leaned on the seeded catalogue instead, which
 * failed for two reasons worth writing down. `flashcard_states.flashcard_id`
 * carries a foreign key to `flashcards`, so per-user state cannot be recorded
 * for a card the database does not hold — and `getFlashcards` falls back to the
 * in-memory seed when the table is empty, so the content *looked* present right
 * up to the insert. `getExercises` has no such fallback and returned nothing,
 * so an enqueued exercise was dropped on read for want of content to render.
 * The CI database is migrated but never seeded; a suite must bring its own rows.
 */
const CARD = "fc-review-fixture-a";
const OTHER_CARD = "fc-review-fixture-b";
const CONCURRENT_CARD = "fc-review-fixture-concurrent";
const EXERCISE_ID = "ex-review-fixture";

const FIXTURE_CARDS = [
  {
    id: CARD,
    front: "Qu'est-ce qu'une obligation actuelle ?",
    back: "Un evenement passe cree une responsabilite presente envers un tiers."
  },
  {
    id: OTHER_CARD,
    front: "Que signifie sortie probable de ressources ?",
    back: "Il est suffisamment probable que l'entreprise devra payer."
  },
  {
    id: CONCURRENT_CARD,
    front: "Quand une provision est-elle comptabilisee ?",
    back: "Quand une obligation presente, une sortie probable et une estimation fiable existent."
  }
];

const FIXTURE_EXERCISE: Exercise = {
  id: EXERCISE_ID,
  domainId: "compta-generale",
  type: "short-answer",
  title: "Fixture",
  level: 1,
  estimatedMinutes: 10,
  statement: "Enonce de fixture.",
  expectedAnswer: "Reponse de fixture.",
  rubric: [{ label: "Critere", points: 20 }],
  competencyIds: ["cg-provisions"],
  sourceChunkIds: []
};

describeWithDb("review queue persistence", () => {
  let admin: Sql;
  let alice: string;
  let bob: string;
  let db: typeof import("../src/review-repository");

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    db = await import("../src/review-repository");
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    // Due in the past, so every fixture card is in today's session from the
    // start and the assertions never depend on when the suite runs.
    for (const card of FIXTURE_CARDS) {
      await admin`
        insert into flashcards (id, module_id, concept_id, domain, type, front, back, explanation,
                                competency_ids, status, due_at, interval_days)
        values (${card.id}, 'module-fixture', 'concept-fixture', 'compta-generale', 'concept',
                ${card.front}, ${card.back}, 'Explication de fixture.',
                array['cg-provisions'], 'due', '2026-01-01T08:00:00Z', 1)
        on conflict (id) do update set back = excluded.back`;
    }

    await admin`
      insert into exercises (id, domain, type, topic, level, estimated_minutes, statement, expected_answer,
                             rubric_json, competency_ids)
      values (${EXERCISE_ID}, 'compta-generale', 'short-answer', 'Fixture', 1, 10,
              ${FIXTURE_EXERCISE.statement}, ${FIXTURE_EXERCISE.expectedAnswer},
              ${JSON.stringify(FIXTURE_EXERCISE.rubric)}::jsonb, array['cg-provisions'])
      on conflict (id) do update set statement = excluded.statement`;

    const [aliceRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-review@example.test', 'alice-review@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-review@example.test', 'bob-review@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;
  }, 180_000);

  afterAll(async () => {
    if (!admin) {
      return;
    }

    await admin`
      delete from app_users
      where email_normalized in ('alice-review@example.test', 'bob-review@example.test')`;
    // Cascades clear review_queue, review_attempts and remediation_tasks with the
    // accounts; the catalogue rows are this suite's own and go with it.
    await admin`delete from flashcards where id in (${CARD}, ${OTHER_CARD})`;
    await admin`delete from exercises where id = ${EXERCISE_ID}`;
    await admin.end();
  });

  it("stores one learner's schedule where only they can read it", async () => {
    const result = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: CARD,
      rating: "correct",
      revealed: true
    });

    expect(result?.persisted).toBe(true);
    expect(result?.outcome.intervalDays).toBe(7);

    const aliceEntry = (await db.getReviewQueue(alice)).entries.find(
      (entry) => entry.itemRef === CARD
    );
    const bobEntry = (await db.getReviewQueue(bob)).entries.find((entry) => entry.itemRef === CARD);

    // Alice's card left the due window; Bob still sees the catalogue default.
    expect(aliceEntry, "a card due in 7 days is not in today's session").toBeUndefined();
    expect(bobEntry, "bob must still be shown the card he has never reviewed").toBeDefined();
    expect(bobEntry?.reviewCount).toBe(0);
    expect(bobEntry?.lastRating).toBeNull();
  });

  it("accepts retention evidence only after a corrected exercise attempt", async () => {
    const catalogueOnly = await db.recordReviewOutcome(bob, {
      itemType: "exercise",
      itemRef: EXERCISE_ID,
      rating: "mastered",
      revealed: true
    });

    expect(catalogueOnly?.masteryEligible).toBe(false);

    await db.enqueueAttemptReview({
      userId: bob,
      exercise: FIXTURE_EXERCISE,
      score: 20,
      microLesson: "Rien à reprendre.",
      nextAction: "Revoir plus tard."
    });

    const correctedAttemptReview = await db.recordReviewOutcome(bob, {
      itemType: "exercise",
      itemRef: EXERCISE_ID,
      rating: "mastered",
      revealed: true
    });

    expect(correctedAttemptReview?.masteryEligible).toBe(true);
    expect(correctedAttemptReview?.reviewAttemptId).toBeTruthy();
  });

  it("moves the existing row on a second review instead of enqueueing a duplicate", async () => {
    await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: CARD,
      rating: "partial",
      revealed: true
    });

    const rows = await admin`
      select interval_days, review_count, lapse_count, last_rating
      from review_queue
      where user_id = ${alice} and item_type = 'flashcard' and item_ref = ${CARD}`;

    expect(rows, "the (user, type, ref) uniqueness is what prevents a second entry").toHaveLength(1);
    expect(rows[0].interval_days).toBe(3);
    expect(rows[0].review_count).toBe(2);
    expect(rows[0].last_rating).toBe("partial");
    expect(rows[0].lapse_count).toBe(0);
  });

  it("appends to the log rather than overwriting it, and records the reveal", async () => {
    const attempts = await admin`
      select rating, revealed, interval_days
      from review_attempts
      where user_id = ${alice} and item_ref = ${CARD}
      order by reviewed_at`;

    expect(attempts).toHaveLength(2);
    expect(attempts.map((row) => row.rating)).toEqual(["correct", "partial"]);
    expect(attempts.every((row) => row.revealed === true)).toBe(true);
  });

  it("serializes concurrent first reviews so the queue counters match the append-only log", async () => {
    const reviewedAt = new Date("2026-03-03T08:00:00.000Z");

    await Promise.all([
      db.recordReviewOutcome(alice, {
        itemType: "flashcard",
        itemRef: CONCURRENT_CARD,
        rating: "correct",
        revealed: true,
        reviewedAt
      }),
      db.recordReviewOutcome(alice, {
        itemType: "flashcard",
        itemRef: CONCURRENT_CARD,
        rating: "correct",
        revealed: true,
        reviewedAt
      })
    ]);

    const [queue] = await admin`
      select review_count, lapse_count
      from review_queue
      where user_id = ${alice} and item_type = 'flashcard' and item_ref = ${CONCURRENT_CARD}`;
    const attempts = await admin`
      select id
      from review_attempts
      where user_id = ${alice} and item_type = 'flashcard' and item_ref = ${CONCURRENT_CARD}`;

    expect(queue.review_count).toBe(2);
    expect(queue.lapse_count).toBe(0);
    expect(attempts).toHaveLength(2);
  });

  it("keeps the flashcard overlay in step with the queue", async () => {
    const [state] = await admin`
      select status, due_at, interval_days
      from flashcard_states
      where user_id = ${alice} and flashcard_id = ${CARD}`;
    const [queued] = await admin`
      select due_at, interval_days
      from review_queue
      where user_id = ${alice} and item_type = 'flashcard' and item_ref = ${CARD}`;

    expect(state.status).toBe("learning");
    expect(state.interval_days).toBe(queued.interval_days);
    expect(new Date(state.due_at).toISOString()).toBe(new Date(queued.due_at).toISOString());
  });

  it("opens exactly one remediation however many times the same item is failed", async () => {
    // Explicit, distinct review times: the two retest dates must be far enough
    // apart to tell one from the other, which back-to-back calls in the same
    // millisecond would not guarantee.
    const first = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: OTHER_CARD,
      rating: "forgotten",
      revealed: true,
      reviewedAt: new Date("2026-03-01T08:00:00.000Z")
    });
    const second = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: OTHER_CARD,
      rating: "forgotten",
      revealed: true,
      reviewedAt: new Date("2026-03-02T08:00:00.000Z")
    });

    expect(first?.remediationId).toBeTruthy();
    expect(second?.remediationId, "the second failure joins the open task").toBe(
      first?.remediationId
    );

    const open = await admin`
      select id, due_at from remediation_tasks
      where user_id = ${alice} and item_ref = ${OTHER_CARD} and status = 'open'`;

    expect(open).toHaveLength(1);

    // Joining the open task must still move its date. The second failure pushed
    // the item's own retest to a new J+1, and a task left on the previous date
    // would no longer fall on the day the item comes back — the one promise
    // remediation makes.
    expect(new Date(open[0].due_at).toISOString()).toBe(second?.outcome.nextDueAt);
    expect(new Date(open[0].due_at).toISOString()).not.toBe(first?.outcome.nextDueAt);

    const tasks = await db.getRemediationTasks(alice);
    expect(tasks.map((task) => task.itemRef)).toContain(OTHER_CARD);
    expect(tasks.every((task) => task.status === "open")).toBe(true);
  });

  it("allows a fresh task once the previous one is closed", async () => {
    const [task] = await db.getRemediationTasks(alice);

    expect(await db.closeRemediationTask(alice, task.id)).toBe(true);
    // Already closed: nothing left to close.
    expect(await db.closeRemediationTask(alice, task.id)).toBe(false);

    const reopened = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: task.itemRef,
      rating: "forgotten",
      revealed: true
    });

    expect(reopened?.remediationId).not.toBe(task.id);
  });

  it("keeps remediation private to the learner who earned it", async () => {
    expect(await db.getRemediationTasks(bob)).toHaveLength(0);
  });

  it("enqueues a graded exercise and only opens work for a failing mark", async () => {
    const passed = await db.enqueueAttemptReview({
      userId: bob,
      exercise: FIXTURE_EXERCISE,
      score: 17,
      microLesson: "m",
      nextAction: "n"
    });

    expect(passed.persisted).toBe(true);
    expect(passed.intervalDays).toBe(7);
    expect(await db.getRemediationTasks(bob)).toHaveLength(0);

    const failed = await db.enqueueAttemptReview({
      userId: bob,
      exercise: FIXTURE_EXERCISE,
      score: 4,
      microLesson: "Reprendre les trois conditions.",
      nextAction: "Refaire l'exercice."
    });

    expect(failed.intervalDays).toBe(1);

    const rows = await admin`
      select interval_days, source from review_queue
      where user_id = ${bob} and item_type = 'exercise' and item_ref = ${EXERCISE_ID}`;

    expect(rows, "a re-attempt moves the same row").toHaveLength(1);
    expect(rows[0].interval_days).toBe(1);
    expect(rows[0].source).toBe("attempt");

    const tasks = await db.getRemediationTasks(bob);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].reason).toBe("failed-attempt");
    expect(tasks[0].exerciseId).toBe(EXERCISE_ID);
  });

  it("surfaces the enqueued exercise in the owner's queue and nobody else's", async () => {
    // Due in a day: not in today's session, but scheduled.
    const bobQueue = await db.getReviewQueue(bob);
    const aliceQueue = await db.getReviewQueue(alice);

    const inBob = bobQueue.totalCount > aliceQueue.totalCount;
    expect(inBob, "bob has an exercise scheduled that alice does not").toBe(true);

    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const bobTomorrow = await db.getReviewQueue(bob, tomorrow, 100);
    const aliceTomorrow = await db.getReviewQueue(alice, tomorrow, 100);

    expect(bobTomorrow.entries.some((entry) => entry.itemRef === EXERCISE_ID)).toBe(true);
    expect(aliceTomorrow.entries.some((entry) => entry.itemRef === EXERCISE_ID)).toBe(false);
  });
});
