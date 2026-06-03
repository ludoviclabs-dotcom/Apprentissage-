import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./drizzle-schema";

export type FinanceDb = ReturnType<typeof createDb>;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false
  });

  return drizzle(client, { schema });
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
