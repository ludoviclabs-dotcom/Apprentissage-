import { cookies } from "next/headers";
import { AuthUnavailableError, createUserSession, emailSchema, findUserByEmail } from "@finance/db";
import { z } from "zod";
import { getFeatures } from "@/lib/features";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, issueSession, sessionCookieOptions } from "@/lib/auth/session";

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
});

/**
 * A valid scrypt record for a password nobody has. Verifying against it when the
 * email is unknown keeps the response time comparable to a real miss, so the
 * endpoint does not become an account-enumeration oracle.
 */
let decoyHashPromise: Promise<string> | undefined;

function getDecoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword("decoy password for constant time comparisons");
  return decoyHashPromise;
}

const INVALID_CREDENTIALS = "Adresse e-mail ou mot de passe incorrect.";

export async function POST(request: Request) {
  const features = getFeatures();

  if (!features.auth.enabled) {
    return Response.json({ error: "Comptes désactivés", details: features.auth.publicMessage }, { status: 501 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = loginSchema.safeParse(payload);

  if (!body.success) {
    // Same message as a wrong password: a malformed address must not be
    // distinguishable from an unregistered one.
    return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  try {
    const account = await findUserByEmail(body.data.email);
    const passwordMatches = await verifyPassword(
      body.data.password,
      account?.passwordHash ?? (await getDecoyHash())
    );

    if (!account || !passwordMatches) {
      return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const session = issueSession();

    await createUserSession({
      userId: account.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    });

    const store = await cookies();
    store.set(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt, new URL(request.url).protocol === "https:")
    );

    return Response.json({ user: { id: account.id, email: account.email } });
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      return Response.json({ error: "Comptes indisponibles", details: error.message }, { status: 503 });
    }

    return Response.json({ error: "Connexion impossible" }, { status: 500 });
  }
}
