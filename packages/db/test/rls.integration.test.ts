import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles, userOwnedTables } from "../src/schema";

/**
 * Proves that row level security isolates users.
 *
 * Requires a real PostgreSQL. Skipped locally when `RLS_TEST_DATABASE_URL` is
 * absent; CI provides a `pgvector/pgvector:pg16` service container. Skipping is
 * explicit rather than silent — a green run with no database would otherwise read
 * as "isolation proven".
 */

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    "[rls.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — isolation is NOT verified in this run."
  );
}

describeWithDb("row level security", () => {
  let sql: Sql;
  let admin: Sql;
  let alice: string;
  let bob: string;

  /** Runs a callback with `app.current_user_id` bound, exactly as the app does. */
  async function asUser<T>(userId: string | null, run: (tx: Sql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${userId ?? ""}, true)`;
      return run(tx as unknown as Sql);
    }) as Promise<T>;
  }

  beforeAll(async () => {
    sql = postgres(APP_DATABASE_URL!, { max: 1 });
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    // Global catalogue rows the owned tables reference by foreign key.
    await admin`
      insert into competencies (id, domain, name, level_min, level_max, status, strength)
      values ('cp-rls', 'compta-generale', 'RLS fixture', 1, 4, 'in-progress', 50)
      on conflict (id) do nothing`;
    await admin`
      insert into exercises (id, domain, topic, level, statement, expected_answer)
      values ('ex-rls', 'compta-generale', 'RLS', 1, 'statement', 'answer')
      on conflict (id) do nothing`;
    await admin`
      insert into exam_sessions (id, title, exercise_ids, duration_minutes, status)
      values ('exam-rls', 'RLS exam', array['ex-rls'], 30, 'draft')
      on conflict (id) do nothing`;

    const [aliceRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-rls@example.test', 'alice-rls@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-rls@example.test', 'bob-rls@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;

    // Each user writes one attempt through their own context.
    for (const [userId, id] of [
      [alice, "attempt-alice"],
      [bob, "attempt-bob"]
    ] as const) {
      await asUser(userId, async (tx) => {
        await tx`
          insert into attempts (id, user_id, exercise_id, user_answer, score)
          values (${id}, ${userId}, 'ex-rls', 'answer', 12)
          on conflict (id) do update set user_id = ${userId}`;
      });
    }
  }, 120_000);

  afterAll(async () => {
    if (!sql || !admin) {
      return;
    }

    await admin`delete from app_users where email_normalized in ('alice-rls@example.test', 'bob-rls@example.test')`;
    await admin`delete from exam_sessions where id = 'exam-rls'`;
    await admin`delete from exercises where id = 'ex-rls'`;
    await admin`delete from competencies where id = 'cp-rls'`;
    await sql.end();
    await admin.end();
  });

  it("enables AND forces row level security on every owned table", async () => {
    // Without FORCE, the table owner — the role this application connects as —
    // bypasses every policy and the isolation below would be an illusion.
    const rows = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname = any(${sql.array([...userOwnedTables])})`;

    expect(rows.length).toBe(userOwnedTables.length);

    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} has RLS disabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} does not FORCE RLS`).toBe(true);
    }
  });

  it("installs SELECT, INSERT, UPDATE and DELETE ownership policies on every owned table", async () => {
    const rows = await sql<{ tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }[]>`
      select tablename, policyname, cmd, qual, with_check
      from pg_policies
      where schemaname = current_schema()
        and tablename = any(${sql.array([...userOwnedTables])})`;

    for (const table of userOwnedTables) {
      const policies = rows.filter((row) => row.tablename === table);

      expect(policies.map((row) => row.cmd).sort(), `${table} policies`).toEqual([
        "DELETE",
        "INSERT",
        "SELECT",
        "UPDATE"
      ]);
      expect(policies.every((row) => row.policyname.startsWith(`${table}_`))).toBe(true);
      expect(policies.every((row) => row.qual?.includes("app_current_user_id") ?? row.with_check?.includes("app_current_user_id"))).toBe(true);
      expect(
        policies
          .filter((row) => row.cmd === "INSERT" || row.cmd === "UPDATE")
          .every((row) => row.with_check?.includes("app_current_user_id"))
      ).toBe(true);
    }
  });

  it("shows each user only their own attempts", async () => {
    const aliceRows = await asUser(alice, (tx) => tx`select id, user_id from attempts`);
    const bobRows = await asUser(bob, (tx) => tx`select id, user_id from attempts`);

    expect(aliceRows.map((row) => row.id)).toEqual(["attempt-alice"]);
    expect(bobRows.map((row) => row.id)).toEqual(["attempt-bob"]);
  });

  it("returns nothing when no user is bound", async () => {
    const rows = await asUser(null, (tx) => tx`select id from attempts`);

    expect(rows).toHaveLength(0);
  });

  it("returns nothing when the bound id is malformed rather than erroring open", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', 'not-a-uuid', true)`;
      return tx`select id from attempts`;
    });

    expect(rows).toHaveLength(0);
  });

  it("cannot read another user's row even when asked for by primary key", async () => {
    const rows = await asUser(alice, (tx) => tx`select id from attempts where id = 'attempt-bob'`);

    expect(rows).toHaveLength(0);
  });

  it("refuses an insert that assigns the row to somebody else", async () => {
    await expect(
      asUser(alice, async (tx) => {
        await tx`
          insert into attempts (id, user_id, exercise_id, user_answer, score)
          values ('attempt-forged', ${bob}, 'ex-rls', 'forged', 20)`;
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it("silently matches no rows when updating another user's data", async () => {
    // UPDATE is filtered by USING, so it affects zero rows rather than raising.
    await asUser(alice, async (tx) => {
      const result = await tx`update attempts set score = 0 where id = 'attempt-bob'`;
      expect(result.count).toBe(0);
    });

    const [bobRow] = await asUser(bob, (tx) => tx`select score from attempts where id = 'attempt-bob'`);
    expect(bobRow.score).toBe(12);
  });

  it("refuses to reassign one's own row to another user", async () => {
    await expect(
      asUser(alice, async (tx) => {
        await tx`update attempts set user_id = ${bob} where id = 'attempt-alice'`;
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot delete another user's data", async () => {
    await asUser(alice, async (tx) => {
      const result = await tx`delete from attempts where id = 'attempt-bob'`;
      expect(result.count).toBe(0);
    });

    const rows = await asUser(bob, (tx) => tx`select id from attempts where id = 'attempt-bob'`);
    expect(rows).toHaveLength(1);
  });

  it("isolates per-user progress that used to live on the shared catalogue", async () => {
    await asUser(alice, async (tx) => {
      await tx`
        insert into competency_progress (user_id, competency_id, strength, status)
        values (${alice}, 'cp-rls', 90, 'acquired')
        on conflict (user_id, competency_id) do update set strength = 90`;
    });
    await asUser(bob, async (tx) => {
      await tx`
        insert into competency_progress (user_id, competency_id, strength, status)
        values (${bob}, 'cp-rls', 20, 'fragile')
        on conflict (user_id, competency_id) do update set strength = 20`;
    });

    const aliceProgress = await asUser(alice, (tx) => tx`select strength from competency_progress`);
    const bobProgress = await asUser(bob, (tx) => tx`select strength from competency_progress`);

    expect(aliceProgress.map((row) => row.strength)).toEqual([90]);
    expect(bobProgress.map((row) => row.strength)).toEqual([20]);
  });

  it("isolates exam runs and allows only one live run per exam", async () => {
    await asUser(alice, async (tx) => {
      await tx`
        insert into exam_runs (user_id, exam_session_id, status)
        values (${alice}, 'exam-rls', 'in-progress')`;
    });

    await expect(
      asUser(alice, async (tx) => {
        await tx`
          insert into exam_runs (user_id, exam_session_id, status)
          values (${alice}, 'exam-rls', 'in-progress')`;
      })
    ).rejects.toThrow(/duplicate key|unique/i);

    // Bob starting the same exam is not a duplicate.
    await asUser(bob, async (tx) => {
      await tx`
        insert into exam_runs (user_id, exam_session_id, status)
        values (${bob}, 'exam-rls', 'in-progress')`;
    });

    const aliceRuns = await asUser(alice, (tx) => tx`select id from exam_runs`);
    expect(aliceRuns).toHaveLength(1);
  });

  it("keeps the pedagogical catalogue readable without a user context", async () => {
    // Global content must stay public: the seeded demo depends on it.
    const rows = await asUser(null, (tx) => tx`select id from exercises where id = 'ex-rls'`);

    expect(rows).toHaveLength(1);
  });

  it("keeps profiles private per user", async () => {
    for (const userId of [alice, bob]) {
      await asUser(userId, async (tx) => {
        await tx`
          insert into profiles (user_id, display_name) values (${userId}, ${`name-${userId}`})
          on conflict (user_id) do nothing`;
      });
    }

    const aliceProfiles = await asUser(alice, (tx) => tx`select user_id from profiles`);

    expect(aliceProfiles).toHaveLength(1);
    expect(aliceProfiles[0].user_id).toBe(alice);
  });
});
