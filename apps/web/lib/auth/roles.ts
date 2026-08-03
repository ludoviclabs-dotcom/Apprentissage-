import { getEnv } from "@/lib/env";
import { isPublicDemo } from "@/lib/features";
import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Rôle du visiteur vis-à-vis de la navigation.
 *
 * Il n'existe pas de table de rôles : le schéma de progression ne bouge pas.
 * Le rôle est dérivé de la configuration runtime, avec une règle par mode :
 *
 * - démo publique : jamais d'administration, quel que soit le compte ;
 * - installation privée sans comptes : le propriétaire local administre son
 *   propre corpus (comportement historique — Documents et Source packs ont
 *   toujours été visibles dans ce mode) ;
 * - comptes activés : administrateur si l'e-mail figure dans
 *   `LEARNING_HUB_ADMIN_EMAILS`. Liste absente = tous les comptes de
 *   l'installation privée administrent, comme avant ce découpage.
 */
export type ViewerRole = "admin" | "learner" | "guest";

export interface ViewerRoleInput {
  publicDemo: boolean;
  authEnabled: boolean;
  userEmail: string | null;
  adminEmails: readonly string[];
}

/** Résolution pure, exportée pour les tests. */
export function resolveViewerRole(input: ViewerRoleInput): ViewerRole {
  if (input.publicDemo) {
    return input.userEmail ? "learner" : "guest";
  }

  if (!input.authEnabled) {
    return "admin";
  }

  if (!input.userEmail) {
    return "guest";
  }

  if (input.adminEmails.length === 0) {
    return "admin";
  }

  const email = input.userEmail.toLowerCase();

  return input.adminEmails.some((candidate) => candidate.toLowerCase() === email)
    ? "admin"
    : "learner";
}

/** L'espace Administration (Documents, Source packs) n'apparaît que pour lui. */
export function canManageSources(role: ViewerRole): boolean {
  return role === "admin";
}

/** `LEARNING_HUB_ADMIN_EMAILS="a@x.fr, b@x.fr"` → `["a@x.fr", "b@x.fr"]`. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Le layout a déjà résolu la session ; pas de second aller-retour ici. */
export function getViewerRole(user: CurrentUser | null): ViewerRole {
  const env = getEnv();

  return resolveViewerRole({
    publicDemo: isPublicDemo(env),
    authEnabled: env.LEARNING_HUB_AUTH_ENABLED,
    userEmail: user?.email ?? null,
    adminEmails: parseAdminEmails(env.LEARNING_HUB_ADMIN_EMAILS)
  });
}
