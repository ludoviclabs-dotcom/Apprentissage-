import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exercises } from "@finance/domain";
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

/** A card from the seeded catalogue; `getFlashcards` supplies it with no rows. */
const CARD = "fc-obligation-definition";
const OTHER_CARD = "fc-sortie-probable-definition";

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
    const first = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: OTHER_CARD,
      rating: "forgotten",
      revealed: true
    });
    const second = await db.recordReviewOutcome(alice, {
      itemType: "flashcard",
      itemRef: OTHER_CARD,
      rating: "forgotten",
      revealed: true
    });

    expect(first?.remediationId).toBeTruthy();
    expect(second?.remediationId, "the second failure joins the open task").toBe(
      first?.remediationId
    );

    const open = await admin`
      select id from remediation_tasks
      where user_id = ${alice} and item_ref = ${OTHER_CARD} and status = 'open'`;

    expect(open).toHaveLength(1);

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
    const exercise = exercises[0];

    const passed = await db.enqueueAttemptReview({
      userId: bob,
      exercise,
      score: 17,
      microLesson: "m",
      nextAction: "n"
    });

    expect(passed.persisted).toBe(true);
    expect(passed.intervalDays).toBe(7);
    expect(await db.getRemediationTasks(bob)).toHaveLength(0);

    const failed = await db.enqueueAttemptReview({
      userId: bob,
      exercise,
      score: 4,
      microLesson: "Reprendre les trois conditions.",
      nextAction: "Refaire l'exercice."
    });

    expect(failed.intervalDays).toBe(1);

    const rows = await admin`
      select interval_days, source from review_queue
      where user_id = ${bob} and item_type = 'exercise' and item_ref = ${exercise.id}`;

    expect(rows, "a re-attempt moves the same row").toHaveLength(1);
    expect(rows[0].interval_days).toBe(1);
    expect(rows[0].source).toBe("attempt");

    const tasks = await db.getRemediationTasks(bob);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].reason).toBe("failed-attempt");
    expect(tasks[0].exerciseId).toBe(exercise.id);
  });

  it("surfaces the enqueued exercise in the owner's queue and nobody else's", async () => {
    const exercise = exercises[0];

    // Due in a day: not in today's session, but scheduled.
    const bobQueue = await db.getReviewQueue(bob);
    const aliceQueue = await db.getReviewQueue(alice);

    const inBob = bobQueue.totalCount > aliceQueue.totalCount;
    expect(inBob, "bob has an exercise scheduled that alice does not").toBe(true);

    const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const bobTomorrow = await db.getReviewQueue(bob, tomorrow, 100);
    const aliceTomorrow = await db.getReviewQueue(alice, tomorrow, 100);

    expect(bobTomorrow.entries.some((entry) => entry.itemRef === exercise.id)).toBe(true);
    expect(aliceTomorrow.entries.some((entry) => entry.itemRef === exercise.id)).toBe(false);
  });
});
