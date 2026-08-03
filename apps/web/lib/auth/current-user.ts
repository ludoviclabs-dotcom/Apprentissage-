import { cookies } from "next/headers";
import { findSessionByTokenHash, type ResolvedSession } from "@finance/db";
import { getFeatures } from "@/lib/features";
import { SESSION_COOKIE_NAME, hashSessionToken } from "@/lib/auth/session";

/**
 * Server-side resolution of the signed-in user.
 *
 * Returns null rather than throwing when authentication is not configured, so
 * the seeded public demo keeps working exactly as before: pages ask who the user
 * is, get null, and render the demo.
 */
export interface CurrentUser {
  id: string;
  email: string;
}

export async function getCurrentSession(): Promise<ResolvedSession | null> {
  if (!getFeatures().auth.enabled) {
    return null;
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  // A configured private runtime must not reinterpret a database outage as an
  // anonymous request. The error boundary and route handlers present a safe
  // unavailable state; only an absent or expired session resolves to `null`.
  return findSessionByTokenHash(hashSessionToken(token));
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getCurrentSession();

  return session ? { id: session.userId, email: session.email } : null;
}

/**
 * Resolves who a write should be attributed to.
 *
 * Four configurations, each with one correct answer:
 *
 * | database | accounts | signed in | outcome                                     |
 * |----------|----------|-----------|---------------------------------------------|
 * | off      | off      | -         | `userId: null` — seeded demo, nothing stored |
 * | on       | off      | -         | 409: rows would have no owner and RLS rejects them |
 * | on       | on       | no        | 401 |
 * | on       | on       | yes       | `userId` |
 *
 * The second row is the one worth being loud about: with a database but no
 * accounts, an insert into a protected table has no `user_id`, the policy's WITH
 * CHECK fails, and the user would see an opaque database error.
 */
export async function resolveWriteUser(): Promise<
  { userId: string | null; response?: never } | { userId?: never; response: Response }
> {
  const features = getFeatures();

  if (!features.persistence.enabled) {
    return { userId: null };
  }

  if (!features.auth.enabled) {
    return {
      response: Response.json(
        {
          error: "Comptes requis pour enregistrer",
          details:
            "La base est active mais LEARNING_HUB_AUTH_ENABLED=false : une écriture ne pourrait être rattachée à personne."
        },
        { status: 409 }
      )
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      response: Response.json(
        { error: "Session requise", details: "Connecte-toi pour enregistrer ta progression." },
        { status: 401 }
      )
    };
  }

  return { userId: user.id };
}

/**
 * Resolves the caller for a read that includes personal state.
 *
 * Catalogue reads remain public when accounts are disabled. Once accounts are
 * enabled, however, an API route must resolve the database-backed opaque
 * session before it loads user-scoped progress. This deliberately mirrors
 * {@link resolveWriteUser}: a mere cookie is never treated as an identity.
 */
export async function resolveReadUser(): Promise<
  { userId: string | null; response?: never } | { userId?: never; response: Response }
> {
  const features = getFeatures();

  if (!features.auth.enabled) {
    return { userId: null };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      response: Response.json(
        { error: "Session requise", details: "Connecte-toi pour consulter ta progression." },
        { status: 401 }
      )
    };
  }

  return { userId: user.id };
}

/**
 * For route handlers that must not proceed anonymously. Returns the user or a
 * ready-to-return 401 — never both, never neither.
 */
export async function requireCurrentUser(): Promise<
  { user: CurrentUser; response?: never } | { user?: never; response: Response }
> {
  const features = getFeatures();

  if (!features.auth.enabled) {
    return {
      response: Response.json(
        {
          error: "Authentification désactivée",
          details: features.auth.reason
        },
        { status: 501 }
      )
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      response: Response.json({ error: "Session requise", details: "Connecte-toi pour continuer." }, { status: 401 })
    };
  }

  return { user };
}
