import "server-only";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { isBillingActive } from "@/lib/features";

/**
 * The Stripe client, and the only place the secret key is read.
 *
 * PINNED API VERSION. `stripe-node`'s types describe exactly one API version, so
 * leaving the version to the account's dashboard setting means the types and the
 * payloads can drift apart silently — the field a handler reads is simply
 * `undefined` in production. Pinning here makes an upgrade a deliberate change
 * to one line, next to a package bump.
 *
 * This matters concretely for this integration: since 2025-03 a subscription's
 * `current_period_end` lives on its *items*, not on the subscription, and an
 * invoice reaches its subscription through `parent.subscription_details`. Both
 * are read in `webhook.ts`, and both moved.
 */
const STRIPE_API_VERSION = "2026-07-29.dahlia";

export class BillingNotConfiguredError extends Error {
  constructor() {
    super(
      "Stripe n'est pas configuré : FINANCE_HUB_BILLING_ENABLED=false ou clé manquante."
    );
    this.name = "BillingNotConfiguredError";
  }
}

let client: Stripe | undefined;

export function getStripeClient(): Stripe {
  const env = getEnv();

  if (!isBillingActive(env) || !env.STRIPE_SECRET_KEY) {
    throw new BillingNotConfiguredError();
  }

  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    // The default is 1. A checkout session is created in response to a click,
    // so a retry storm is not the failure mode to optimise for; a single retry
    // covers a dropped connection without making the learner wait twice over.
    maxNetworkRetries: 1,
    appInfo: { name: "finance-learning-hub" }
  });

  return client;
}

/** Test-only: drop the memoized client so a new key is picked up. */
export function resetStripeClient() {
  client = undefined;
}

export { STRIPE_API_VERSION };
