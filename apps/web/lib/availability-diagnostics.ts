import "server-only";

import { getEnv, type Env } from "@/lib/env";
import { isBillingActive, isDatabaseActive, isPublicDemo, type FeatureKey } from "@/lib/features";

/**
 * Le versant exploitation du contrat d'indisponibilité.
 *
 * C'est ici que vivent les noms de variables : ce qu'un opérateur doit changer
 * pour rallumer une capacité. Rien de ce module ne doit atteindre un navigateur.
 *
 * `import "server-only"` est l'application de cette règle, pas un commentaire à
 * son sujet : un Client Component qui importerait ce fichier — directement ou
 * par transitivité — échoue à la compilation. C'est la garantie que le
 * diagnostic ne peut pas être « passé en prop puis masqué en CSS », qui est
 * exactement la forme qu'avait la fuite avant PR-20.
 *
 * Les consommateurs légitimes sont les route handlers d'administration et de
 * santé, et eux seuls.
 */

export interface AvailabilityDiagnostic {
  feature: FeatureKey;
  enabled: boolean;
  /** Ce qu'il faut configurer. Vide quand la capacité est active. */
  adminDiagnostic: string | null;
}

export function resolveDiagnostics(env: Env): Record<FeatureKey, string | null> {
  const publicDemo = isPublicDemo(env);
  const databaseActive = isDatabaseActive(env);

  const demoDiagnostic =
    "FINANCE_HUB_PUBLIC_DEMO=true (ou VERCEL_ENV=production sans LEARNING_HUB_AUTH_ENABLED) : les écritures sont refusées.";
  const noDatabaseDiagnostic =
    "FINANCE_HUB_USE_DATABASE=true et DATABASE_URL sont requis pour persister.";

  return {
    auth: env.LEARNING_HUB_AUTH_ENABLED
      ? null
      : "LEARNING_HUB_AUTH_ENABLED=false : les données restent partagées et non attribuées.",
    database: databaseActive ? null : noDatabaseDiagnostic,
    writes: publicDemo ? demoDiagnostic : null,
    uploads: publicDemo ? demoDiagnostic : null,
    sourcePackImport: publicDemo ? demoDiagnostic : null,
    aiTutor:
      env.AI_PROVIDER === "none"
        ? "AI_PROVIDER=none : aucun modèle configuré, les réponses viennent du corpus seedé."
        : null,
    persistence: databaseActive ? null : noDatabaseDiagnostic,
    billing: isBillingActive(env)
      ? null
      : "FINANCE_HUB_BILLING_ENABLED=false ou configuration Stripe incomplète (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, prix)."
  };
}

export function getDiagnostics(): Record<FeatureKey, string | null> {
  return resolveDiagnostics(getEnv());
}

/** Le diagnostic d'une capacité, pour un message d'erreur d'API. */
export function diagnosticFor(feature: FeatureKey): string | null {
  return getDiagnostics()[feature];
}
