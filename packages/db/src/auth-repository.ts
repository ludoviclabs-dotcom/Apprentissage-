import { and, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { canUseDatabase, createDb } from "./client";
import { appUsersTable, profilesTable, userSessionsTable } from "./drizzle-schema";
import { withUserContext } from "./user-context";

/**
 * Identity persistence. Deliberately free of any password or token handling:
 * hashing lives in `apps/web/lib/auth`, and this module only ever sees digests.
 */

export const emailSchema = z
  .string()
  .min(3)
  .max(320)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()), {
    message: "Adresse e-mail invalide"
  });

/** Uniqueness is enforced on this form, so casing and padding cannot duplicate an account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  locale: string;
}

export class AuthUnavailableError extends Error {
  constructor() {
    super(
      "Authentication requires database mode. Set FINANCE_HUB_USE_DATABASE=true and DATABASE_URL."
    );
    this.name = "AuthUnavailableError";
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}.`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

/** Postgres unique-violation. Relied upon so registration stays race-free. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === UNIQUE_VIOLATION;
}

export function assertAuthAvailable(): void {
  if (!canUseDatabase()) {
    throw new AuthUnavailableError();
  }
}

export async function createUserAccount(input: {
  email: string;
  passwordHash: string;
  displayName?: string;
}): Promise<UserAccount> {
  assertAuthAvailable();

  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const db = createDb();

  let inserted: { id: string; email: string; passwordHash: string; createdAt: string };

  try {
    const rows = await db
      .insert(appUsersTable)
      .values({ email, emailNormalized, passwordHash: input.passwordHash })
      .returning({
        id: appUsersTable.id,
        email: appUsersTable.email,
        passwordHash: appUsersTable.passwordHash,
        createdAt: appUsersTable.createdAt
      });

    inserted = rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailAlreadyRegisteredError(email);
    }

    throw error;
  }

  // `profiles` is under RLS, so the insert only passes with the new user bound
  // as the current user — the same path the application uses at runtime.
  await withUserContext(inserted.id, async (tx) => {
    await tx
      .insert(profilesTable)
      .values({ userId: inserted.id, displayName: input.displayName?.trim() || email.split("@")[0] })
      .onConflictDoNothing();
  });

  return inserted;
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  assertAuthAvailable();

  const rows = await createDb()
    .select({
      id: appUsersTable.id,
      email: appUsersTable.email,
      passwordHash: appUsersTable.passwordHash,
      createdAt: appUsersTable.createdAt
    })
    .from(appUsersTable)
    .where(eq(appUsersTable.emailNormalized, normalizeEmail(email)))
    .limit(1);

  return rows[0] ?? null;
}

export interface ResolvedSession {
  userId: string;
  email: string;
  sessionId: string;
  expiresAt: string;
}

/**
 * Looks up a live session by token digest. Expired rows are filtered in SQL so a
 * stale cookie can never resolve, even if cleanup has not run.
 */
export async function findSessionByTokenHash(tokenHash: string): Promise<ResolvedSession | null> {
  assertAuthAvailable();

  const rows = await createDb()
    .select({
      userId: appUsersTable.id,
      email: appUsersTable.email,
      sessionId: userSessionsTable.id,
      expiresAt: userSessionsTable.expiresAt
    })
    .from(userSessionsTable)
    .innerJoin(appUsersTable, eq(appUsersTable.id, userSessionsTable.userId))
    .where(and(eq(userSessionsTable.tokenHash, tokenHash), sql`${userSessionsTable.expiresAt} > now()`))
    .limit(1);

  return rows[0] ?? null;
}

export async function createUserSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  assertAuthAvailable();

  await createDb().insert(userSessionsTable).values({
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt.toISOString()
  });
}

export async function extendUserSession(sessionId: string, expiresAt: Date): Promise<void> {
  assertAuthAvailable();

  await createDb()
    .update(userSessionsTable)
    .set({ expiresAt: expiresAt.toISOString(), lastSeenAt: new Date().toISOString() })
    .where(eq(userSessionsTable.id, sessionId));
}

export async function deleteUserSession(tokenHash: string): Promise<void> {
  assertAuthAvailable();

  await createDb().delete(userSessionsTable).where(eq(userSessionsTable.tokenHash, tokenHash));
}

/** Used when a password changes: every other device must be signed out. */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  assertAuthAvailable();

  await createDb().delete(userSessionsTable).where(eq(userSessionsTable.userId, userId));
}

export async function deleteExpiredSessions(): Promise<void> {
  assertAuthAvailable();

  await createDb().delete(userSessionsTable).where(lte(userSessionsTable.expiresAt, sql`now()`));
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  assertAuthAvailable();

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        userId: profilesTable.userId,
        displayName: profilesTable.displayName,
        locale: profilesTable.locale
      })
      .from(profilesTable)
      .limit(1);

    return rows[0] ?? null;
  });
}

export async function updateUserProfile(
  userId: string,
  patch: { displayName?: string; locale?: string }
): Promise<void> {
  assertAuthAvailable();

  await withUserContext(userId, async (tx) => {
    await tx
      .update(profilesTable)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(profilesTable.userId, userId));
  });
}
