import "server-only";
import { BILLING_PLANS, BILLING_PLAN_KEYS, type BillingPlan, type BillingPlanKey } from "@finance/domain";
import { getEnv, type Env } from "@/lib/env";

/**
 * Where a plan meets its Stripe price. Server-only, and that import on line one
 * is the enforcement: a client component that reaches for this file fails the
 * build instead of shipping a price id to the browser.
 *
 * Why price ids must not reach a client at all: a Checkout Session is created
 * from a price, so a browser that can name the price can name a *different*
 * price. Stripe's own guidance is to keep the id server-side and let the client
 * send nothing but a plan key it cannot forge into a discount.
 */

export interface ConfiguredPlan {
  plan: BillingPlan;
  priceId: string;
}

/** Reverse map, used by the webhook adapter to name the plan behind a price. */
export function resolvePlanKeyForPrice(priceId: string | null, env: Env = getEnv()): BillingPlanKey | null {
  if (!priceId) {
    return null;
  }

  for (const key of BILLING_PLAN_KEYS) {
    if (priceIdFor(key, env) === priceId) {
      return key;
    }
  }

  return null;
}

function priceIdFor(key: BillingPlanKey, env: Env): string | undefined {
  switch (key) {
    case "founder-annual":
      return env.STRIPE_PRICE_FOUNDER_ANNUAL;
    case "pro-monthly":
      return env.STRIPE_PRICE_PRO_MONTHLY;
  }
}

/**
 * The plans this deployment can actually sell.
 *
 * A plan whose price id is unset is omitted rather than rendered as a button
 * that would fail on click — the same rule the rest of the app follows for
 * features that are off.
 */
export function getConfiguredPlans(env: Env = getEnv()): ConfiguredPlan[] {
  const configured: ConfiguredPlan[] = [];

  for (const key of BILLING_PLAN_KEYS) {
    const priceId = priceIdFor(key, env);

    if (priceId) {
      configured.push({ plan: BILLING_PLANS[key], priceId });
    }
  }

  return configured;
}

export function getConfiguredPlan(key: BillingPlanKey, env: Env = getEnv()): ConfiguredPlan | null {
  const priceId = priceIdFor(key, env);

  return priceId ? { plan: BILLING_PLANS[key], priceId } : null;
}

/**
 * What the pricing page may know. Deliberately a projection: it carries no price
 * id, so the panel can be rendered by a client component without one leaking.
 */
export interface PublicPlan {
  key: BillingPlanKey;
  label: string;
  description: string;
  cadence: BillingPlan["cadence"];
  /** Display copy. Never a Stripe price id — see `BillingPlan.priceLabel`. */
  priceLabel: string;
  highlights: string[];
}

export function toPublicPlans(configured: ConfiguredPlan[]): PublicPlan[] {
  return configured.map(({ plan }) => ({
    key: plan.key,
    label: plan.label,
    description: plan.description,
    cadence: plan.cadence,
    priceLabel: plan.priceLabel,
    highlights: [...plan.highlights]
  }));
}

/**
 * The offer as the *public* page shows it: every plan the product sells, not
 * only the ones this deployment has wired to a Stripe price.
 *
 * The two lists differ on purpose. `getConfiguredPlans` answers "what can be
 * bought right now" and drives the buttons; this answers "what is on sale",
 * so a visitor is never shown a blank page because an operator has not
 * finished the setup — they see the offer, and the button says why it is not
 * available.
 */
export function catalogPlans(): PublicPlan[] {
  return BILLING_PLAN_KEYS.map((key) => {
    const plan = BILLING_PLANS[key];

    return {
      key: plan.key,
      label: plan.label,
      description: plan.description,
      cadence: plan.cadence,
      priceLabel: plan.priceLabel,
      highlights: [...plan.highlights]
    };
  });
}
