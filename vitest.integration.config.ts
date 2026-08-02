import { defineConfig } from "vitest/config";

/**
 * The suites that need a real PostgreSQL, run one file at a time.
 *
 * WHY THIS CONFIG EXISTS. Every `*.integration.test.ts` replays the whole of
 * `migrationFiles` in its `beforeAll`, against one shared database. Vitest runs
 * test files in parallel by default, so those replays overlapped and two things
 * went wrong:
 *
 * 1. Concurrent DDL on the same catalog rows. Adding a fifth suite was enough to
 *    turn this from latent into reproducible: the `rls` job failed with
 *    `PostgresError: tuple concurrently updated`, and another suite logged
 *    NOTICEs about tables a different suite had just created.
 * 2. A worse, quieter hazard. Migrations 0002, 0003 and 0007 each `DROP POLICY
 *    IF EXISTS` before recreating it, so a suite replaying them opens a window
 *    where a table momentarily has no row level security — while another suite
 *    is querying it to assert exactly that isolation holds. A cross-user leak
 *    test that passes because it ran outside the window, or fails because it ran
 *    inside one, is worthless either way.
 *
 * Serialising whole files closes both: no suite runs its assertions while
 * another is rewriting the schema underneath it. An advisory lock around the
 * replay alone would fix (1) and leave (2).
 *
 * The `include` glob replaces the hand-maintained file list the CI job used to
 * carry, so a new integration suite is picked up rather than silently skipped.
 * These files are also matched by the root `vitest.config.ts`, where they cost
 * nothing: with no database they skip before `beforeAll` runs, so no DDL is
 * issued and there is no race to lose.
 */
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    fileParallelism: false
  }
});
