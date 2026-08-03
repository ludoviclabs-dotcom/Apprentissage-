import { getEnv, type Env } from "@/lib/env";

/**
 * Feature availability, derived from validated environment configuration.
 *
 * Rule for this codebase: an action must be either functional or visibly
 * disabled. A feature that is off carries a `reason` the UI can show, so a
 * disabled control always explains itself instead of failing after the click.
 */
export interface FeatureState {
  enabled: boolean;
  /** Present only when `enabled` is false. Written for end users, in French. */
  reason?: string;
}

export interface FeatureSet {
  /** HTTP basic auth in front of the app. */
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

const ON: FeatureState = { enabled: true };

function off(reason: string): FeatureState {
  return { enabled: false, reason };
}

const PUBLIC_DEMO_REASON =
  "Indisponible en démo publique : active LEARNING_HUB_AUTH_ENABLED et une base privée.";
const NO_DATABASE_REASON =
  "Indisponible sans base de données : active FINANCE_HUB_USE_DATABASE=true et DATABASE_URL.";

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

  return {
    auth: env.LEARNING_HUB_AUTH_ENABLED
      ? ON
      : off(
          "Comptes désactivés : LEARNING_HUB_AUTH_ENABLED=false. Les données restent partagées et non attribuées."
        ),
    database: databaseActive ? ON : off(NO_DATABASE_REASON),
    writes: publicDemo ? off(PUBLIC_DEMO_REASON) : ON,
    uploads: publicDemo ? off(PUBLIC_DEMO_REASON) : ON,
    sourcePackImport: publicDemo ? off(PUBLIC_DEMO_REASON) : ON,
    aiTutor:
      env.AI_PROVIDER === "none"
        ? off("Tuteur IA désactivé : AI_PROVIDER=none. Les réponses restent issues du corpus seedé.")
        : ON,
    persistence: databaseActive ? ON : off(NO_DATABASE_REASON),
    billing: isBillingActive(env)
      ? ON
      : off(
          "Paiement désactivé : FINANCE_HUB_BILLING_ENABLED=false ou configuration Stripe incomplète. Tous les modules restent ouverts."
        )
  };
}

export function getFeatures(): FeatureSet {
  return resolveFeatures(getEnv());
}
