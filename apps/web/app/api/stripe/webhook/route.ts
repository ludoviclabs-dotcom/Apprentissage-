import {
  applyBillingIntent,
  claimBillingEvent,
  releaseBillingEvent,
  settleBillingEvent
} from "@finance/db";
import { resolvePlanKeyForPrice } from "@/lib/billing/plans";
import { handleStripeWebhook, type BillingStore } from "@/lib/billing/webhook";
import { getEnv } from "@/lib/env";
import { getFeatures } from "@/lib/features";

/**
 * The only route that may grant premium access.
 *
 * RAW BODY, NOT JSON. Stripe signs the exact bytes it sent. `request.text()`
 * hands them over untouched; `request.json()` would parse and discard them, and
 * re-serialising to verify would produce different bytes and fail every time.
 * `runtime = "nodejs"` is here for the same reason as the signature check
 * itself: the verification path in `stripe-node` used by `constructEvent` is the
 * Node one.
 *
 * ALWAYS DYNAMIC. A cached webhook endpoint would be a webhook endpoint that
 * silently stops working.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store: BillingStore = {
  claimEvent: claimBillingEvent,
  settleEvent: settleBillingEvent,
  releaseEvent: releaseBillingEvent,
  applyIntent: applyBillingIntent
};

export async function POST(request: Request) {
  const features = getFeatures();

  if (!features.billing.enabled) {
    // 503 rather than 404: the endpoint exists, it is switched off. Stripe will
    // retry, which is the behaviour wanted if billing was disabled by accident
    // — the events are not lost, they arrive once it is switched back on.
    return Response.json(
      { error: "Webhook Stripe désactivé", details: features.billing.reason },
      { status: 503 }
    );
  }

  const webhookSecret = getEnv().STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return Response.json({ error: "STRIPE_WEBHOOK_SECRET absent" }, { status: 503 });
  }

  const result = await handleStripeWebhook(
    {
      rawBody: await request.text(),
      signature: request.headers.get("stripe-signature")
    },
    {
      webhookSecret,
      store,
      resolvePlanKey: (priceId) => resolvePlanKeyForPrice(priceId)
    }
  );

  if (result.status >= 400) {
    // Server-side only. A rejected delivery has to be visible somewhere, and the
    // response body deliberately tells the caller very little.
    console.error("[stripe-webhook]", result.status, result.body);
  }

  return Response.json(result.body, { status: result.status });
}
