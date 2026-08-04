import { getStripeCustomerId } from "@finance/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getEnv, resolveAppUrl } from "@/lib/env";
import { getFeatures } from "@/lib/features";
import { getStripeClient } from "@/lib/billing/stripe";

/**
 * A session on Stripe's hosted customer portal.
 *
 * ADR-007 deferred this and named the cost: cancelling or changing a card meant
 * going through the Stripe dashboard, which a learner has no access to — so the
 * checkout route's own refusal told them to "résilie-le depuis Stripe", advice
 * they could not follow. This route is the answer.
 *
 * IT GRANTS NOTHING. The portal lets Stripe change a subscription; the *effect*
 * of that change reaches this application the same way every other one does,
 * through a signed `customer.subscription.updated` webhook. Nothing here writes
 * an entitlement, and the returning browser is not believed either.
 *
 * The portal is opened for the caller's own Stripe customer, read from
 * `billing_customers`. There is no customer id in the request body on purpose:
 * accepting one would let anybody open the billing portal of any customer whose
 * id they could guess or read from a leaked receipt.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const features = getFeatures();

  if (!features.billing.enabled) {
    return Response.json(
      { error: "Gestion de l'abonnement indisponible", details: features.billing.publicMessage },
      { status: 501 }
    );
  }

  const caller = await requireCurrentUser();

  if (caller.response) {
    return caller.response;
  }

  const customerId = await getStripeCustomerId(caller.user.id);

  if (!customerId) {
    // Never subscribed, so there is nothing to manage. A 409 with a usable
    // sentence beats sending them to a portal that would refuse them.
    return Response.json(
      {
        error: "Aucun abonnement à gérer",
        details: "Aucun paiement n'a encore été enregistré pour ce compte."
      },
      { status: 409 }
    );
  }

  try {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${resolveAppUrl(getEnv())}/account`
    });

    if (!session.url) {
      return Response.json({ error: "Portail Stripe sans URL de redirection" }, { status: 502 });
    }

    return Response.json({ url: session.url }, { status: 201 });
  } catch (error) {
    // The message is not forwarded: a Stripe error can name a customer id.
    console.error("[stripe-portal]", error);

    return Response.json({ error: "Ouverture du portail impossible" }, { status: 502 });
  }
}
