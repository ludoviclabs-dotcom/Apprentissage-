/**
 * What is sold, what it unlocks, and when an unlock is still valid.
 *
 * Everything in this file is pure and free of Stripe types on purpose. The
 * Stripe SDK lives in `apps/web` only; the rules that decide whether somebody
 * may open a premium module have to be readable, and testable, without a
 * network client in scope.
 *
 * PRICE IDS ARE NOT HERE. A plan knows the *name* of the environment variable
 * that carries its price, never the price itself, so nothing in this package —
 * which is imported by client components through `@finance/domain` — can leak a
 * price id into the browser bundle. Resolution happens server-side in
 * `apps/web/lib/billing/plans.ts`.
 */

/**
 * The named things a payment can unlock. Short, and meant to stay short: a
 * feature here is something a route can refuse, not a marketing bullet.
 */
export const ENTITLEMENT_FEATURES = ["excel-finance-lab", "completion-certificate"] as const;

export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[number];

export const BILLING_PLAN_KEYS = ["founder-annual", "pro-monthly"] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

export interface BillingPlan {
  key: BillingPlanKey;
  label: string;
  /** Shown on the pricing panel. French, like the rest of the UI. */
  description: string;
  cadence: "annuel" | "mensuel";
  features: EntitlementFeature[];
  /** Name of the server-only variable holding the Stripe price id. */
  priceEnvVar: string;
  /** A plan the deployment may leave unconfigured without failing boot. */
  optional: boolean;
  /**
   * What the offer page prints, e.g. `"180 € / an"`.
   *
   * INDICATIVE, AND SAID TO BE. The authority on what is charged is the Stripe
   * price behind {@link priceEnvVar}, which the learner sees on the hosted
   * checkout page before entering a card. Reading the real amount would mean a
   * Stripe round trip on a page that must render for signed-out visitors and
   * with billing switched off, so the label is content and the checkout is
   * truth — and the page says which is which.
   */
  priceLabel: string;
  /** Three or four bullets for the offer card. Marketing copy, not features. */
  highlights: string[];
}

/**
 * Both plans unlock the same thing. That is deliberate for a first paid beta:
 * the choice a buyer makes is a billing cadence, not a feature matrix, and a
 * tiered matrix is the sort of B2B scaffolding this PR is meant to avoid.
 */
const PREMIUM_FEATURES: EntitlementFeature[] = ["excel-finance-lab", "completion-certificate"];

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlan> = {
  "founder-annual": {
    key: "founder-annual",
    label: "Fondateur — annuel",
    description: "Accès complet au lab Excel et aux attestations, facturé une fois par an.",
    cadence: "annuel",
    features: PREMIUM_FEATURES,
    priceEnvVar: "STRIPE_PRICE_FOUNDER_ANNUAL",
    optional: false,
    priceLabel: "180 € / an",
    highlights: [
      "Les quatre niveaux du lab Excel, moteur de formules compris",
      "Attestation de réussite vérifiable pour chaque parcours terminé",
      "Tarif fondateur conservé aux renouvellements",
      "Résiliable à tout moment depuis votre compte"
    ]
  },
  "pro-monthly": {
    key: "pro-monthly",
    label: "Pro — mensuel",
    description: "Mêmes accès, facturés au mois, résiliables à la fin de la période.",
    cadence: "mensuel",
    features: PREMIUM_FEATURES,
    priceEnvVar: "STRIPE_PRICE_PRO_MONTHLY",
    optional: true,
    priceLabel: "19 € / mois",
    highlights: [
      "Les mêmes accès que l'offre annuelle",
      "Engagement au mois, sans reconduction imposée",
      "Résiliable à tout moment depuis votre compte"
    ]
  }
};

/** What the free tier gives, printed next to the paid plans. */
export const FREE_TIER_HIGHLIGHTS: string[] = [
  "Le parcours complet de comptabilité générale, ses quatre niveaux et ses deux cas pratiques",
  "Corrections structurées et file de révision active",
  "Les deux premiers niveaux du lab Excel en démonstration"
];

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return (BILLING_PLAN_KEYS as readonly string[]).includes(value);
}

export function isEntitlementFeature(value: string): value is EntitlementFeature {
  return (ENTITLEMENT_FEATURES as readonly string[]).includes(value);
}

export function planFeatures(planKey: string | null): EntitlementFeature[] {
  if (!planKey || !isBillingPlanKey(planKey)) {
    return [];
  }

  return [...BILLING_PLANS[planKey].features];
}

// --- Subscription status ----------------------------------------------------

/** Mirrors `Stripe.Subscription.Status`. Kept as data so a status this code has
 * never seen is stored verbatim rather than coerced into a familiar one. */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "incomplete_expired",
  "canceled"
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The two statuses that grant access, and only those.
 *
 * `past_due` is excluded on purpose. Stripe keeps a subscription `past_due`
 * while it retries a failed payment, which can run for days; treating that as
 * paid would mean the product's answer to "the card was declined" is to hand
 * over the content anyway. `unpaid`, `paused` and the `incomplete` family are
 * excluded for the same reason — none of them describes money that arrived.
 *
 * A payment that recovers emits `customer.subscription.updated` with `active`,
 * so the access comes straight back without anyone intervening.
 */
const ENTITLING_STATUSES: readonly string[] = ["active", "trialing"];

export function isEntitlingStatus(status: string): boolean {
  return ENTITLING_STATUSES.includes(status);
}

/**
 * What a status means *to the learner*, as opposed to what it means to the gate.
 *
 * The gate only ever needs one bit, and {@link isEntitlingStatus} is that bit.
 * But "access is closed" is not a message: somebody whose card was declined
 * needs to update it, somebody who cancelled needs to resubscribe, and somebody
 * whose 3-D Secure step was abandoned needs to finish paying. Collapsing all of
 * them into "abonnement inactif" turns a fixable problem into a dead end, and
 * every one of these states is reachable in production.
 *
 * `selfServiceable` says whether the customer portal can actually fix it. It is
 * false for `incomplete` — an unconfirmed first payment is finished at
 * checkout, not in the portal — and for the terminal states, where the answer
 * is a new subscription rather than a repair.
 */
export type SubscriptionAccessKind =
  | "entitling"
  | "payment-retry"
  | "payment-failed"
  | "awaiting-confirmation"
  | "setup-abandoned"
  | "paused"
  | "ended"
  | "unknown";

export interface SubscriptionStatusFacts {
  status: string;
  kind: SubscriptionAccessKind;
  entitling: boolean;
  /** French, shown next to the subscription on the account page. */
  learnerMessage: string;
  /** True when the Stripe customer portal is the right place to fix it. */
  selfServiceable: boolean;
}

const STATUS_FACTS: Record<SubscriptionStatus, Omit<SubscriptionStatusFacts, "status">> = {
  active: {
    kind: "entitling",
    entitling: true,
    learnerMessage: "Abonnement actif.",
    selfServiceable: true
  },
  trialing: {
    kind: "entitling",
    entitling: true,
    learnerMessage: "Période d'essai en cours : l'accès est ouvert.",
    selfServiceable: true
  },
  past_due: {
    kind: "payment-retry",
    entitling: false,
    learnerMessage:
      "Le dernier paiement a échoué et Stripe le represente. L'accès est suspendu en attendant : mettez à jour votre moyen de paiement pour le rouvrir.",
    selfServiceable: true
  },
  unpaid: {
    kind: "payment-failed",
    entitling: false,
    learnerMessage:
      "Les relances de paiement ont toutes échoué et l'abonnement n'est plus honoré. Mettez à jour votre moyen de paiement ou reprenez un abonnement.",
    selfServiceable: true
  },
  incomplete: {
    kind: "awaiting-confirmation",
    entitling: false,
    learnerMessage:
      "Le premier paiement n'a pas été confirmé — il manque souvent la validation bancaire. Reprenez le paiement pour ouvrir l'accès.",
    selfServiceable: false
  },
  incomplete_expired: {
    kind: "setup-abandoned",
    entitling: false,
    learnerMessage:
      "Le premier paiement n'a jamais été confirmé et la session a expiré. Aucun montant n'a été débité.",
    selfServiceable: false
  },
  paused: {
    kind: "paused",
    entitling: false,
    learnerMessage: "Abonnement en pause : l'accès est suspendu jusqu'à sa reprise.",
    selfServiceable: true
  },
  canceled: {
    kind: "ended",
    entitling: false,
    learnerMessage: "Abonnement résilié. L'accès reste ouvert jusqu'à la fin de la période payée.",
    selfServiceable: false
  }
};

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Facts about a status, including one Stripe has never sent.
 *
 * An unrecognised status resolves to `unknown` and grants nothing. Stripe adds
 * statuses; guessing that a new one is safe is how a gate opens by accident.
 */
export function classifySubscriptionStatus(status: string): SubscriptionStatusFacts {
  if (!isSubscriptionStatus(status)) {
    return {
      status,
      kind: "unknown",
      entitling: false,
      learnerMessage:
        "État d'abonnement non reconnu par cette version de l'application. L'accès reste fermé par précaution.",
      selfServiceable: true
    };
  }

  return { status, ...STATUS_FACTS[status] };
}

/**
 * How long an entitlement outlives the period Stripe paid for.
 *
 * Renewal is asynchronous: the invoice is paid, then `customer.subscription
 * .updated` carries the new period end. If the webhook is delayed — a redeploy,
 * a retry, an endpoint that was briefly down — a learner who has paid would be
 * locked out at the exact second the old period ends. One day of slack is short
 * enough that a genuinely cancelled subscription still lapses on its own, and
 * long enough that no honest renewal ever hits a closed door.
 */
export const ENTITLEMENT_GRACE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** Period end plus the grace window, or null when Stripe supplied no end. */
export function entitlementExpiry(currentPeriodEnd: string | null): string | null {
  if (!currentPeriodEnd) {
    return null;
  }

  const end = Date.parse(currentPeriodEnd);

  if (Number.isNaN(end)) {
    return null;
  }

  return new Date(end + ENTITLEMENT_GRACE_HOURS * HOUR_MS).toISOString();
}

// --- The stored entitlement -------------------------------------------------

export const ENTITLEMENT_STATUSES = ["active", "revoked"] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const ENTITLEMENT_SOURCES = ["subscription", "manual"] as const;

export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

export interface EntitlementRecord {
  feature: EntitlementFeature;
  status: EntitlementStatus;
  source: EntitlementSource;
  planKey: string | null;
  stripeSubscriptionId: string | null;
  grantedAt: string;
  /** Absent means "until revoked": a provisional grant awaiting a period end. */
  expiresAt: string | null;
  revokedAt: string | null;
}

/**
 * The single predicate behind `hasEntitlement`. A row is not enough — it must be
 * active *and* unexpired, so a subscription whose cancellation webhook never
 * arrived still lapses once its paid period plus grace has run out.
 */
export function isEntitlementActive(record: EntitlementRecord, now: Date = new Date()): boolean {
  if (record.status !== "active") {
    return false;
  }

  if (!record.expiresAt) {
    return true;
  }

  const expiry = Date.parse(record.expiresAt);

  // An unparseable date must not read as "never expires".
  return Number.isNaN(expiry) ? false : expiry > now.getTime();
}
