import { getEnv, type Env } from "@/lib/env";
import { AVAILABLE, unavailable, type AvailabilityState } from "@/lib/availability";

/**
 * Feature availability, derived from validated environment configuration.
 *
 * Rule for this codebase: an action must be either functional or visibly
 * disabled. A feature that is off carries a message the UI can show, so a
 * disabled control always explains itself instead of failing after the click.
 *
 * That message is now the *public* one. It says what the visitor can and cannot
 * do; it never names the variable that decided it. The operator's version lives
 * in `availability-diagnostics.ts`, behind `server-only`. Before PR-20 the two
 * were the same string, and the operator's version is what /revisions printed
 * under every card in production.
 */
export type FeatureState = AvailabilityState;

export interface FeatureSet {
  /** Account-based sessions in front of the private workspace. */
  auth: FeatureState;
  /** Reads and writes go to PostgreSQL instead of the seeded fallback. */
  database: FeatureState;
  /** Any state-changing route (attempts, exams, revisions, business cases). */
  writes: FeatureState;
  /** Local document upload. */
  uploads: FeatureState;
  /** Source-pack manifest import. */
  sourcePackImport: FeatureState;
  /** Free-form tutor answers from an LLM provider. */
  aiTutor: FeatureState;
  /** Attempts, corrections and revisions survive a restart. */
  persistence: FeatureState;
  /** Private review area for AI-generated content drafts. */
  contentReview: FeatureState;
  /**
   * Stripe checkout, webhook-driven entitlements and the premium gate.
   *
   * When this is off, premium modules are *open*, not locked. A private
   * local-first install is the default case and its owner is not a customer;
   * shipping a paywall that engages before anyone configured a price would lock
   * people out of their own lab. The gate exists only where billing exists.
   */
  billing: FeatureState;
}

export type FeatureKey = keyof FeatureSet;

export const FEATURE_KEYS: readonly FeatureKey[] = [
  "auth",
  "database",
  "writes",
  "uploads",
  "sourcePackImport",
  "aiTutor",
  "persistence",
  "billing"
];

/**
 * La notice unique du mode découverte. Une page pertinente l'affiche une fois,
 * via `<PublicDemoNotice />` ; aucune carte ne la répète.
 */
export const PUBLIC_DEMO_TITLE = "Mode découverte";
export const PUBLIC_DEMO_MESSAGE =
  "Vous pouvez consulter les contenus et tester les exercices. Vos réponses, vos révisions et votre progression ne sont pas enregistrées.";

const NO_PERSISTENCE_MESSAGE =
  "Les résultats de cette session restent affichés jusqu'à la fermeture de l'onglet, puis disparaissent.";

export function isPublicDemo(env: Env): boolean {
  return env.FINANCE_HUB_PUBLIC_DEMO || (env.VERCEL_ENV === "production" && !env.LEARNING_HUB_AUTH_ENABLED);
}

export function isDatabaseActive(env: Env): boolean {
  return env.FINANCE_HUB_USE_DATABASE && Boolean(env.DATABASE_URL);
}

/**
 * Billing needs all four: the flag, a Stripe key, a webhook secret to verify
 * deliveries with, and somewhere to store what a payment unlocked. `parseEnv`
 * already refuses the flag without the first three, so in practice this only
 * re-checks the database — but it is the predicate every gate reads, and it
 * should not be able to answer "on" for a configuration that cannot record a
 * grant.
 */
export function isBillingActive(env: Env): boolean {
  return (
    env.FINANCE_HUB_BILLING_ENABLED &&
    Boolean(env.STRIPE_SECRET_KEY) &&
    Boolean(env.STRIPE_WEBHOOK_SECRET) &&
    isDatabaseActive(env) &&
    env.LEARNING_HUB_AUTH_ENABLED
  );
}

/** Pure resolver, exported for tests. */
export function resolveFeatures(env: Env): FeatureSet {
  const publicDemo = isPublicDemo(env);
  const databaseActive = isDatabaseActive(env);
  const authEnabled = env.LEARNING_HUB_AUTH_ENABLED;

  // Proposer « Créer mon espace » n'a de sens que si l'inscription existe. Sans
  // comptes, l'action est absente plutôt que morte.
  const demoWrites = unavailable(
    "public-demo",
    PUBLIC_DEMO_MESSAGE,
    authEnabled ? { label: "Créer mon espace", href: "/signup" } : undefined
  );

  return {
    auth: authEnabled
      ? AVAILABLE
      : unavailable(
          "account-required",
          "Cet espace fonctionne sans compte : les contenus sont partagés et aucun profil personnel n'est créé."
        ),
    database: databaseActive
      ? AVAILABLE
      : unavailable("persistence-unavailable", NO_PERSISTENCE_MESSAGE),
    writes: publicDemo ? demoWrites : AVAILABLE,
    uploads: publicDemo
      ? unavailable("public-demo", "L'import de documents n'est pas ouvert en mode découverte.")
      : AVAILABLE,
    sourcePackImport: publicDemo
      ? unavailable("public-demo", "L'import de packs de sources n'est pas ouvert en mode découverte.")
      : AVAILABLE,
    aiTutor:
      env.AI_PROVIDER === "none"
        ? unavailable(
            "ai-disabled",
            "Le tuteur conversationnel n'est pas activé ici : les réponses proviennent du corpus documentaire local."
          )
        : AVAILABLE,
    persistence: databaseActive
      ? AVAILABLE
      : unavailable("persistence-unavailable", NO_PERSISTENCE_MESSAGE),
    contentReview: env.CONTENT_REVIEW_ENABLED
      ? AVAILABLE
      : unavailable(
          "feature-disabled",
          "L'espace de relecture des contenus n'est pas ouvert sur cette instance."
        ),
    billing: isBillingActive(env)
      ? AVAILABLE
      : unavailable(
          "billing-disabled",
          "Aucun paiement n'est activé sur cette instance : tous les modules restent ouverts."
        )
  };
}

export function getFeatures(): FeatureSet {
  return resolveFeatures(getEnv());
}
