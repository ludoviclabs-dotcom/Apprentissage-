import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles } from "../src/schema";

/**
 * Reproduces a migrated-but-unseeded deployment.
 *
 * Content added to `@finance/domain` — like the comptabilité générale v1
 * module of PR-05 — ships no migration of its own: `exercises` is a table, not
 * a schema, and its rows come from `pnpm db:seed`. An operator who applies the
 * code but does not re-run the seed ends up exactly here: the exercise resolves
 * fine for a read (`getExerciseById` falls back to the in-memory catalogue), but
 * no row for it exists in the `exercises` table.
 *
 * Before `isExercisePersisted`, submitting that exercise reached `recordAttempt`,
 * whose insert into `attempts` carries a foreign key to `exercises` — and inside
 * the single transaction PR-04 introduced for atomicity, that violation aborted
 * the review schedule and remediation for the same submission too, surfacing as
 * a raw database error instead of the correction the learner had already been
 * shown. This proves the degraded path instead: graded, reviewed, no crash.
 *
 * Writing this suite also caught a second gap in the same neighbourhood before
 * `getActiveExerciseVersion` learned the same lesson: with the database active,
 * a missing `exercise_versions` row fell back to `legacy_rubric` instead of the
 * authored specification, so the very first run of this file graded 1300 as
 * 0/20 rather than 20/20. Both fixes landed together.
 *
 * Skips loudly without a database, and CI fails on the warning: an unverified
 * claim must never read as a passing one.
 */

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    "[unseeded-exercise.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — the unseeded-deployment path is NOT verified in this run."
  );
}

/** A real exercise from `@finance/domain` that this suite never inserts into `exercises`. */
const UNSEEDED_EXERCISE_ID = "ex-cgv1-tva-a-decaisser";

describeWithDb("submitting an exercise the database has not been seeded with", () => {
  let admin: Sql;
  let userId: string;
  let submitAttempt: (typeof import("../src/submit-attempt"))["submitAttempt"];
  let isExercisePersisted: (typeof import("../src/repository"))["isExercisePersisted"];

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    ({ submitAttempt } = await import("../src/submit-attempt"));
    ({ isExercisePersisted } = await import("../src/repository"));
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    const [row] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('unseeded-exercise@example.test', 'unseeded-exercise@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    userId = row.id;

    // The point of the suite: this id, real in @finance/domain, has no row here.
    await admin`delete from exercises where id = ${UNSEEDED_EXERCISE_ID}`;
  }, 180_000);

  afterAll(async () => {
    if (!admin) {
      return;
    }

    await admin`delete from attempts where user_id = ${userId}`;
    await admin`delete from app_users where email_normalized = 'unseeded-exercise@example.test'`;
    await admin.end();
  });

  it("confirms the exercise is genuinely absent from the catalogue table", async () => {
    expect(await isExercisePersisted(UNSEEDED_EXERCISE_ID)).toBe(false);
  });

  it("still grades, schedules a review and reports progress — no foreign key violation", async () => {
    const graded = await submitAttempt({
      userId,
      exerciseId: UNSEEDED_EXERCISE_ID,
      payload: { kind: "numeric", value: 1300 }
    });

    expect(graded).not.toBeNull();
    expect(graded?.correction.score).toBe(20);
    // The review schedule carries no foreign key to `exercises`, so it is
    // unaffected by the attempt itself being skipped.
    expect(graded?.review?.persisted).toBe(true);
    expect(graded?.review?.intervalDays).toBe(14);
    // Not thrown, and not silently swallowed either: the caller can tell.
    expect(graded?.progress).toBeDefined();
  });

  it("skips the attempt row rather than inserting against a foreign key that would reject it", async () => {
    const rows = await admin`
      select id from attempts where user_id = ${userId} and exercise_id = ${UNSEEDED_EXERCISE_ID}`;

    expect(rows).toHaveLength(0);
  });

  it("still writes the review schedule row, which carries no foreign key to exercises", async () => {
    // Checked directly against the table, not through `getReviewQueue`: that
    // read additionally resolves content via `getExercises()`, which — like
    // `getFlashcards()` — only merges the database with the in-memory catalogue
    // when the table is empty, not per missing id. Whether an unseeded item
    // surfaces in the general queue *listing* is that function's pre-existing
    // limitation, not one either review finding raised or this fix touches;
    // what this suite is actually proving is that the write itself, unlike
    // `attempts`, has nothing stopping it from succeeding.
    const rows = await admin`
      select interval_days from review_queue
      where user_id = ${userId} and item_type = 'exercise' and item_ref = ${UNSEEDED_EXERCISE_ID}`;

    expect(rows).toHaveLength(1);
    expect(rows[0].interval_days).toBe(14);
  });
});
