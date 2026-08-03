import { getStripeCustomerId, linkStripeCustomer } from "@finance/db";
import { BILLING_PLANS, isBillingPlanKey } from "@finance/domain";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getConfiguredPlan } from "@/lib/billing/plans";
import { getStripeClient } from "@/lib/billing/stripe";
import { getEnv, resolveAppUrl } from "@/lib/env";
import { getFeatures } from "@/lib/features";

/**
 * Creates a Stripe Checkout Session, server-side.
 *
 * WHAT THE CLIENT MAY SAY: a plan key, and nothing else. The price id, the mode,
 * the currency and the return URLs are all decided here. A body that could name
 * a price could name a cheaper one, which is why Stripe's own guidance is to
 * keep price ids on the server — `lib/billing/plans.ts` imports `server-only`
 * so that stays true by construction rather than by review.
 *
 * WHAT TRAVELS WITH THE SESSION, and why each piece:
 *
 *  - `client_reference_id`: Stripe's documented slot for an internal id. It
 *    comes back on `checkout.session.completed` and is how that event is
 *    attributed to a learner.
 *  - `subscription_data.metadata.userId`: the same id, stamped on the
 *    *subscription*. This is the one that matters most. Stripe guarantees no
 *    ordering between `checkout.session.completed` and
 *    `customer.subscription.created`, so a subscription event that could only be
 *    attributed through the session would be unattributable half the time.
 *  - `planKey` on both: so the webhook knows what was bought without having to
 *    reverse a price id whose configuration may since have changed.
 *
 * A reused Stripe customer keeps one learner to one customer, so the billing
 * portal, invoices and renewals all land on the same record.
 */

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.string().min(1).refine(isBillingPlanKey, { message: "plan inconnu" })
});

export async function POST(request: Request) {
  const features = getFeatures();

  if (!features.billing.enabled) {
    return Response.json(
      { error: "Paiement indisponible", details: features.billing.reason },
      { status: 501 }
    );
  }

  const caller = await requireCurrentUser();

  if (caller.response) {
    return caller.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = checkoutSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Plan invalide", details: body.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const configured = getConfiguredPlan(body.data.plan);

  if (!configured) {
    // The plan exists in the catalogue but this deployment has no price for it.
    // Saying so beats a Stripe error about a missing price the caller cannot see.
    return Response.json(
      {
        error: "Plan non configuré",
        details: `Aucun prix Stripe pour ce plan : renseigne ${BILLING_PLANS[body.data.plan].priceEnvVar}.`
      },
      { status: 409 }
    );
  }

  const appUrl = resolveAppUrl(getEnv());
  const stripe = getStripeClient();

  try {
    const existingCustomerId = await getStripeCustomerId(caller.user.id);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: configured.priceId, quantity: 1 }],
      client_reference_id: caller.user.id,
      metadata: { userId: caller.user.id, planKey: configured.plan.key },
      subscription_data: {
        metadata: { userId: caller.user.id, planKey: configured.plan.key }
      },
      // Reuse the customer when we have one; otherwise let Stripe create it and
      // prefill the address so the learner does not retype it.
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: caller.user.email }),
      // `{CHECKOUT_SESSION_ID}` is substituted by Stripe. The success page uses
      // it to *display* the state it reads from our own database — it is never
      // treated as proof of payment.
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      allow_promotion_codes: true
    });

    if (typeof session.customer === "string" && !existingCustomerId) {
      // Stripe usually creates the customer when the session *completes*, so
      // this is normally null here and the webhook does the linking. When a
      // customer does come back early, recording it now means a learner who
      // abandons and returns reuses it instead of accumulating one per attempt.
      await linkStripeCustomer(caller.user.id, session.customer);
    }

    if (!session.url) {
      return Response.json(
        { error: "Session Stripe sans URL de redirection" },
        { status: 502 }
      );
    }

    return Response.json({ url: session.url, sessionId: session.id }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: "Création de session impossible",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      },
      { status: 502 }
    );
  }
}
