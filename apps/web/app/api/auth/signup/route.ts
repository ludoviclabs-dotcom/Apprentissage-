import { cookies } from "next/headers";
import {
  AuthUnavailableError,
  EmailAlreadyRegisteredError,
  createUserAccount,
  createUserSession,
  emailSchema
} from "@finance/db";
import { z } from "zod";
import { getFeatures } from "@/lib/features";
import { MIN_PASSWORD_LENGTH, WeakPasswordError, hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, issueSession, sessionCookieOptions } from "@/lib/auth/session";

const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH),
  displayName: z.string().trim().max(80).optional()
});

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

  const body = signupSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Inscription invalide", details: body.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(body.data.password);
    const account = await createUserAccount({
      email: body.data.email,
      passwordHash,
      displayName: body.data.displayName
    });

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

    return Response.json({ user: { id: account.id, email: account.email } }, { status: 201 });
  } catch (error) {
    if (error instanceof WeakPasswordError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof EmailAlreadyRegisteredError) {
      return Response.json({ error: "Un compte existe déjà pour cette adresse." }, { status: 409 });
    }

    if (error instanceof AuthUnavailableError) {
      return Response.json({ error: "Comptes indisponibles", details: error.message }, { status: 503 });
    }

    return Response.json({ error: "Inscription impossible" }, { status: 500 });
  }
}
