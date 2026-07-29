import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./drizzle-schema";

export type FinanceDb = ReturnType<typeof createDb>;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * One pool per connection string, reused.
 *
 * This used to construct a fresh `postgres()` pool on every call and never close
 * it. With one query per request that merely leaked slowly; PR-02 made it fatal,
 * because refreshing a track fans out to about eight repository calls and each
 * one opened its own connection. PostgreSQL reached `max_connections` and
 * unrelated requests — signing up, for one — began failing with a 500.
 *
 * `max` must be greater than one now that the pool is shared: `withUserContext`
 * runs inside a transaction, and concurrent transactions each need their own
 * connection or they would queue behind each other. Transaction scope is also why
 * pooling is safe here — `SET LOCAL app.current_user_id` cannot outlive the
 * transaction that set it, so no connection is ever handed back still carrying a
 * previous caller's identity.
 */
const pools = new Map<string, ReturnType<typeof drizzle<typeof schema>>>();

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const existing = pools.get(databaseUrl);

  if (existing) {
    return existing;
  }

  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false
  });
  const db = drizzle(client, { schema });

  pools.set(databaseUrl, db);

  return db;
}

export function canUseDatabase() {
  return process.env.FINANCE_HUB_USE_DATABASE === "true" && hasDatabaseUrl();
}

export async function checkDatabaseConnection(): Promise<{
  reachable: boolean;
  reason?: string;
}> {
  if (!canUseDatabase()) {
    return {
      reachable: false,
      reason: hasDatabaseUrl() ? "FINANCE_HUB_USE_DATABASE is not true" : "DATABASE_URL is not set"
    };
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    await client`select 1`;
    return { reachable: true };
  } catch (error) {
    return {
      reachable: false,
      reason: error instanceof Error ? error.message : "Unknown database connection error"
    };
  } finally {
    await client.end();
  }
}
