import { sql } from "drizzle-orm";
import { createDb, type FinanceDb } from "./client";

/**
 * Runs a callback with `app.current_user_id` bound for the duration of a single
 * transaction, which is what the row level security policies in
 * `migrations/0002_auth_ownership_rls.sql` read through `app_current_user_id()`.
 *
 * Why a transaction: `SET LOCAL` is scoped to one. Every statement in this
 * codebase used to run in autocommit mode, so there was no scope for the setting
 * to live in — a `SET` would either leak to the next caller sharing the
 * connection or vanish immediately.
 *
 * Passing `null` runs with no user bound. Policies then compare against NULL,
 * which matches nothing, so the default outcome is "deny" rather than "see
 * everything".
 */
export async function withUserContext<T>(
  userId: string | null,
  run: (db: FinanceDb) => Promise<T>,
  db: FinanceDb = createDb()
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., is_local = true) is the function form of SET LOCAL, and
    // unlike SET it accepts a bind parameter instead of string interpolation.
    await tx.execute(sql`select set_config('app.current_user_id', ${userId ?? ""}, true)`);

    return run(tx as unknown as FinanceDb);
  });
}

/**
 * Thrown when a user-scoped operation is reached without an authenticated user.
 * Surfacing this is deliberate: the alternative — running the query anyway and
 * letting RLS return zero rows — is indistinguishable from "you have no data"
 * and hides the bug.
 */
export class MissingUserContextError extends Error {
  constructor(operation: string) {
    super(`${operation} requires an authenticated user.`);
    this.name = "MissingUserContextError";
  }
}

export function assertUserId(userId: string | null | undefined, operation: string): string {
  if (!userId) {
    throw new MissingUserContextError(operation);
  }

  return userId;
}

/**
 * Distinguishes the three outcomes a user-scoped read can have. The previous
 * code collapsed them: any failure — and any empty result — returned seeded
 * demonstration content, so a brand-new account would have been shown the seed
 * corpus as if it were its own history, and an RLS `permission denied` would
 * have looked like success.
 */
export type UserDataResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "unavailable"; reason: string };

export async function readUserData<T>(
  operation: string,
  run: () => Promise<T[]>
): Promise<UserDataResult<T[]>> {
  try {
    const rows = await run();

    return rows.length === 0 ? { status: "empty" } : { status: "ok", data: rows };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? `${operation}: ${error.message}` : `${operation}: unknown error`
    };
  }
}
