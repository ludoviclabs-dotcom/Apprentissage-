import { cookies } from "next/headers";
import { deleteUserSession } from "@finance/db";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session";

/**
 * Signing out deletes the session row, not just the cookie: a token that leaked
 * before logout must stop working, which a cookie-only clear would not achieve.
 *
 * Always answers 204, even when there was no session or the database is down —
 * the user's intent is satisfied either way once the cookie is gone.
 */
export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    try {
      await deleteUserSession(hashSessionToken(token));
    } catch {
      // Best effort. The cookie is cleared below regardless, and the row expires.
    }
  }

  store.delete(SESSION_COOKIE_NAME);

  return new Response(null, { status: 204 });
}
