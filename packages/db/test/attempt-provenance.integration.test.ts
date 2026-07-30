import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles } from "../src/schema";

/**
 * A stored attempt is evidence, not merely a display cache. Its decimal score,
 * evaluator family and pinned version must all survive persistence so a mark can
 * be interpreted after content moves to a newer version.
 */

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    "[attempt-provenance.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — persistence provenance is NOT verified in this run."
  );
}

const EXERCISE_ID = "ex-attempt-provenance";
const VERSION_ID = "ex-attempt-provenance-v1";
const EMAIL = "attempt-provenance@example.test";

describeWithDb("attempt evaluation provenance", () => {
  let admin: Sql;
  let userId: string;
  let submitAttempt: (typeof import("../src/submit-attempt"))["submitAttempt"];

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";
    submitAttempt = (await import("../src/submit-attempt")).submitAttempt;
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    await admin`
      insert into exercises (id, domain, type, topic, level, estimated_minutes, statement, expected_answer)
      values (${EXERCISE_ID}, 'compta-generale', 'qcm', 'Provenance', 1, 5, 'Choisir les réponses.', 'a, b et c')
      on conflict (id) do nothing`;
    await admin`
      insert into exercise_versions (id, exercise_id, version, evaluation_type, spec_json, is_active)
      values (
        ${VERSION_ID}, ${EXERCISE_ID}, 1, 'multiple_choice',
        ${JSON.stringify({
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
            { id: "c", label: "C" },
            { id: "d", label: "D" }
          ],
          correctOptionIds: ["a", "b", "c"],
          allowPartialCredit: true
        })}::jsonb,
        true
      )
      on conflict (id) do nothing`;
    const [user] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values (${EMAIL}, ${EMAIL}, 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    userId = user.id;
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;

    await admin`delete from app_users where email_normalized = ${EMAIL}`;
    await admin`delete from exercises where id = ${EXERCISE_ID}`;
    await admin.end();
  });

  it("persists the decimal score, evaluator family and exact version", async () => {
    const graded = await submitAttempt({
      userId,
      exerciseId: EXERCISE_ID,
      payload: { kind: "choice", selectedOptionIds: ["a", "b"] }
    });

    expect(graded?.correction.score).toBeCloseTo(13.33, 2);
    expect(graded?.evaluationType).toBe("multiple_choice");
    expect(graded?.exerciseVersionId).toBe(VERSION_ID);

    const [attempt] = await admin`
      select score, evaluation_type, exercise_version_id
      from attempts
      where user_id = ${userId} and exercise_id = ${EXERCISE_ID}
      order by created_at desc
      limit 1`;
    const [correction] = await admin`
      select score from corrections
      where id = ${graded?.correction.id ?? "missing"}`;

    expect(Number(attempt.score)).toBeCloseTo(13.33, 2);
    expect(Number(correction.score)).toBeCloseTo(13.33, 2);
    expect(attempt.evaluation_type).toBe("multiple_choice");
    expect(attempt.exercise_version_id).toBe(VERSION_ID);
  });
});
