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
 * Content added to `@finance/domain` ships through `pnpm db:seed`, not through
 * a schema migration. A deployment that applies migrations but omits the seed
 * must fail closed: configured database mode cannot resolve the missing exercise
 * from the in-memory demo catalogue, grade it, or write a review for it.
 *
 * This is intentionally different from public-demo mode. The operator must run
 * the seed before turning on the database-backed runtime; returning a correction
 * for unpersisted content would conceal an incomplete deployment.
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

  it("fails closed instead of grading from the in-memory catalogue", async () => {
    const result = await submitAttempt({
      userId,
      exerciseId: UNSEEDED_EXERCISE_ID,
      payload: { kind: "numeric", value: 1300 }
    });

    expect(result).toBeNull();
  });

  it("skips the attempt row rather than inserting against a foreign key that would reject it", async () => {
    const rows = await admin`
      select id from attempts where user_id = ${userId} and exercise_id = ${UNSEEDED_EXERCISE_ID}`;

    expect(rows).toHaveLength(0);
  });

  it("does not write a review schedule for an exercise absent from the configured catalogue", async () => {
    const rows = await admin`
      select interval_days from review_queue
      where user_id = ${userId} and item_type = 'exercise' and item_ref = ${UNSEEDED_EXERCISE_ID}`;

    expect(rows).toHaveLength(0);
  });
});
