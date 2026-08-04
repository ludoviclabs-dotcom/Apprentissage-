import "server-only";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getViewerRole, type ViewerRole } from "@/lib/auth/roles";

/**
 * The first server-side administration gate in this codebase.
 *
 * Until now `getViewerRole` only *hid* the administration links: `navigation.ts`
 * says so in as many words — "les routes restent accessibles en accès direct
 * pour ne masquer aucune fonctionnalité" — and `/documents` and `/source-packs`
 * check nothing. Hiding is an acceptable answer for a page that merely lists
 * uploaded material. It is not an acceptable answer for revoking somebody
 * else's attestation, so this returns a refusal rather than a rendering hint.
 *
 * `resolveViewerRole` grants `admin` to everyone when accounts are disabled or
 * when no administrator list is configured — a private local-first install has
 * exactly one user, and locking them out of their own instance would be absurd.
 * That is deliberate, and it is why administration surfaces must still be
 * unreachable in the public demo, which `resolveViewerRole` handles by never
 * returning `admin` there.
 */
export interface AdminCaller {
  role: ViewerRole;
  /** The e-mail to record in an audit trail. Empty when accounts are off. */
  actor: string;
}

export async function resolveAdmin(): Promise<AdminCaller | null> {
  const user = await getCurrentUser();
  const role = getViewerRole(user);

  return role === "admin" ? { role, actor: user?.email ?? "installation-locale" } : null;
}

/** For route handlers: the caller, or a ready-to-return refusal. */
export async function requireAdmin(): Promise<
  { admin: AdminCaller; response?: never } | { admin?: never; response: Response }
> {
  const admin = await resolveAdmin();

  if (admin) {
    return { admin };
  }

  // 404 rather than 403: an administration endpoint that answers "forbidden"
  // confirms it exists, and there is nothing to gain from telling an anonymous
  // caller which internal routes are worth attacking.
  return {
    response: Response.json({ error: "Ressource introuvable" }, { status: 404 })
  };
}
