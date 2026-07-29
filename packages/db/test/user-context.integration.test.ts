import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql as raw } from "drizzle-orm";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles } from "../src/schema";

/**
 * Isolation through the *application's own* pool.
 *
 * `rls.integration.test.ts` proves the policies using a dedicated `max: 1`
 * client. That cannot catch the failure mode this file targets: `createDb()` now
 * shares a pool across callers, so `SET LOCAL app.current_user_id` and the
 * statements that depend on it must provably run on the same connection. If they
 * did not, RLS would evaluate against the wrong identity and hand back another
 * learner's rows — a leak that looks like valid data rather than an error.
 */

const DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.warn(
    "[user-context.integration] RLS_TEST_DATABASE_URL is not set — pooled isolation is NOT verified in this run."
  );
}

/** The driver returns rows array-like; drizzle wraps them. Normalise both. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }

  return ((result as { rows?: unknown[] } | null)?.rows ?? []) as Record<string, unknown>[];
}

describeWithDb("withUserContext over a shared pool", () => {
  let sql: Sql;
  let alice: string;
  let bob: string;
  let withUserContext: (typeof import("../src/user-context"))["withUserContext"];

  beforeAll(async () => {
    // `createDb()` reads these at call time.
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    withUserContext = (await import("../src/user-context")).withUserContext;

    sql = postgres(DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await sql.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    await sql`
      insert into exercises (id, domain, topic, level, statement, expected_answer)
      values ('ex-pool', 'compta-generale', 'Pool', 1, 'statement', 'answer')
      on conflict (id) do nothing`;

    const [aliceRow] = await sql`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-pool@example.test', 'alice-pool@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await sql`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-pool@example.test', 'bob-pool@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;
  }, 120_000);

  afterAll(async () => {
    if (!sql) {
      return;
    }

    await sql`delete from app_users where email_normalized in ('alice-pool@example.test', 'bob-pool@example.test')`;
    await sql`delete from exercises where id = 'ex-pool'`;
    await sql.end();
  });

  it("binds the requested user, not whoever used the connection last", async () => {
    for (const userId of [alice, bob, alice, bob]) {
      const bound = await withUserContext(userId, async (tx) => {
        const result = await tx.execute(raw`select app_current_user_id() as id`);
        return (rowsOf(result)[0]?.id as string | null) ?? null;
      });

      expect(bound).toBe(userId);
    }
  });

  it("keeps concurrent contexts isolated", async () => {
    await withUserContext(alice, async (tx) => {
      await tx.execute(
        raw`insert into attempts (id, user_id, exercise_id, user_answer, score)
            values ('attempt-pool-alice', ${alice}::uuid, 'ex-pool', 'answer', 12)
            on conflict (id) do update set user_id = ${alice}::uuid`
      );
    });

    const countAttempts = (userId: string | null) =>
      withUserContext(userId, async (tx) => rowsOf(await tx.execute(raw`select id from attempts`)).length);

    // Concurrency is the point: these transactions hold different connections
    // from the shared pool at the same time.
    const [aliceRows, bobRows, anonymousRows] = await Promise.all([
      countAttempts(alice),
      countAttempts(bob),
      countAttempts(null)
    ]);

    expect(aliceRows).toBeGreaterThan(0);
    expect(bobRows).toBe(0);
    expect(anonymousRows).toBe(0);

    await sql`delete from attempts where id = 'attempt-pool-alice'`;
  });

  it("stays correct under repeated interleaving", async () => {
    // Hammering the pool is what would surface a connection handed back while
    // still carrying a previous caller's identity.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
        const userId = index % 2 === 0 ? alice : bob;

        return withUserContext(userId, async (tx) => {
          const result = await tx.execute(raw`select app_current_user_id() as id`);
          return { expected: userId, actual: (rowsOf(result)[0]?.id as string | null) ?? null };
        });
      })
    );

    for (const { expected, actual } of results) {
      expect(actual).toBe(expected);
    }
  });
});
