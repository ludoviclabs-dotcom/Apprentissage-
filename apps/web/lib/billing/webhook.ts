import "server-only";
import Stripe from "stripe";
import {
  isHandledBillingEvent,
  mapBillingEvent,
  type BillingIntent,
  type BillingWebhookEvent,
  type CheckoutSessionSnapshot,
  type InvoiceSnapshot,
  type SubscriptionSnapshot
} from "@finance/domain";
import type { ApplyBillingIntentResult, BillingEventOutcome } from "@finance/db";

/**
 * The verified webhook: signature, then idempotency, then the pure mapper, then
 * the rows.
 *
 * WHY THIS IS A FUNCTION AND NOT THE ROUTE. The route is four lines of plumbing
 * around {@link handleStripeWebhook}, and everything worth testing is here: the
 * signature check, the flattening of Stripe's payloads, the ordering of the
 * ledger claim against the write. `apps/web/test/stripe-webhook.test.ts` drives
 * it with payloads signed by `Stripe.webhooks.generateTestHeaderString`, so the
 * verification under test is the real one rather than a stub around it.
 *
 * WHY THE STORE IS INJECTED. The same tests then run the whole handler against
 * an in-memory store and assert on the entitlements that come out. Reaching for
 * PostgreSQL to answer "does a cancellation revoke access" would make the answer
 * depend on a container being up.
 */

export interface BillingStore {
  /** False when this event id was already claimed: a Stripe redelivery. */
  claimEvent(stripeEventId: string, type: string): Promise<boolean>;
  settleEvent(stripeEventId: string, outcome: BillingEventOutcome, detail: string): Promise<void>;
  releaseEvent(stripeEventId: string): Promise<void>;
  applyIntent(intent: BillingIntent): Promise<ApplyBillingIntentResult>;
}

export interface WebhookDependencies {
  /** The `whsec_…` signing secret for this endpoint. */
  webhookSecret: string;
  store: BillingStore;
  /** Price id → plan key, resolved against the server-only environment. */
  resolvePlanKey: (priceId: string | null) => string | null;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

export interface WebhookRequest {
  /** The exact bytes Stripe signed. Any reserialisation invalidates them. */
  rawBody: string;
  signature: string | null;
}

// --- Flattening Stripe's payloads -------------------------------------------
//
// Every field Stripe has moved between API versions is read here and nowhere
// else. `stripe.ts` pins the version these accessors were written against.

/** Expandable fields arrive as an id or as the object; only the id is wanted. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return null;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function metadataUserId(metadata: Stripe.Metadata | null | undefined): string | null {
  const value = metadata?.userId;

  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataPlanKey(metadata: Stripe.Metadata | null | undefined): string | null {
  const value = metadata?.planKey;

  return typeof value === "string" && value.length > 0 ? value : null;
}

function toCheckoutSnapshot(session: Stripe.Checkout.Session): CheckoutSessionSnapshot {
  return {
    sessionId: session.id,
    mode: session.mode,
    // `payment_status` is null on a session that was never meant to charge.
    paymentStatus: session.payment_status ?? "unpaid",
    // `client_reference_id` is Stripe's documented slot for an internal id, and
    // is set at creation. `metadata.userId` is the same value, kept as a
    // fallback so a session created by hand in the dashboard can still be
    // attributed.
    userId: session.client_reference_id ?? metadataUserId(session.metadata),
    planKey: metadataPlanKey(session.metadata),
    stripeCustomerId: idOf(session.customer),
    stripeSubscriptionId: idOf(session.subscription)
  };
}

function toSubscriptionSnapshot(
  subscription: Stripe.Subscription,
  resolvePlanKey: (priceId: string | null) => string | null
): SubscriptionSnapshot {
  const item = subscription.items?.data?.[0] ?? null;
  const priceId = item?.price?.id ?? null;

  // The billing period moved onto the items in API version 2025-03-31. Taking
  // the furthest end across items is the conservative reading for the rare
  // multi-item subscription: access lasts as long as something on it is paid
  // for, rather than expiring when the shortest line does.
  const periodEnd = (subscription.items?.data ?? []).reduce<number | null>((latest, entry) => {
    const end = entry.current_period_end;

    return typeof end === "number" && (latest === null || end > latest) ? end : latest;
  }, null);

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: idOf(subscription.customer),
    status: subscription.status,
    // Set through `subscription_data.metadata` when the session is created, so
    // a subscription event can be attributed without waiting for the checkout
    // event — Stripe orders neither relative to the other.
    userId: metadataUserId(subscription.metadata),
    planKey: metadataPlanKey(subscription.metadata) ?? resolvePlanKey(priceId),
    priceId,
    currentPeriodEnd: toIso(periodEnd),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true
  };
}

function toInvoiceSnapshot(
  invoice: Stripe.Invoice,
  resolvePlanKey: (priceId: string | null) => string | null
): InvoiceSnapshot {
  // An invoice reaches its subscription through `parent.subscription_details`
  // since the 2025-03-31 API version; the old top-level `subscription` field is
  // gone. `metadata` there is a snapshot of the subscription's own metadata at
  // finalisation, which is where the checkout put `userId`.
  const details = invoice.parent?.subscription_details ?? null;
  const line = invoice.lines?.data?.[0] ?? null;
  const priceId = idOf(line?.pricing?.price_details?.price);

  return {
    invoiceId: invoice.id,
    stripeCustomerId: idOf(invoice.customer),
    stripeSubscriptionId: idOf(details?.subscription),
    userId: metadataUserId(details?.metadata),
    planKey: metadataPlanKey(details?.metadata) ?? resolvePlanKey(priceId),
    periodEnd: toIso(line?.period?.end),
    // There is no `paid` boolean on the invoice in this API version; `status`
    // is the field that says the money arrived.
    paid: invoice.status === "paid"
  };
}

/**
 * Stripe event → the normalised shape the pure mapper consumes, or null for an
 * event type this endpoint does not act on.
 */
export function toBillingWebhookEvent(
  event: Stripe.Event,
  resolvePlanKey: (priceId: string | null) => string | null
): BillingWebhookEvent | null {
  if (!isHandledBillingEvent(event.type)) {
    return null;
  }

  switch (event.type) {
    case "checkout.session.completed":
      return {
        id: event.id,
        type: event.type,
        session: toCheckoutSnapshot(event.data.object)
      };
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return {
        id: event.id,
        type: event.type,
        subscription: toSubscriptionSnapshot(event.data.object, resolvePlanKey)
      };
    case "invoice.paid":
      return {
        id: event.id,
        type: event.type,
        invoice: toInvoiceSnapshot(event.data.object, resolvePlanKey)
      };
    default:
      return null;
  }
}

// --- The handler ------------------------------------------------------------

/**
 * WHAT EACH STATUS CODE MEANS TO STRIPE. Stripe retries any non-2xx for up to
 * three days, so the code is a decision about whether redelivery could help:
 *
 *  - 400: the signature did not verify, or the body is not an event. Retrying
 *    the same bytes will fail identically, but a 400 is also the only honest
 *    answer to a request that did not come from Stripe.
 *  - 200 with `ignored`/`duplicate`/`unresolved`: understood, nothing to do.
 *    An unresolvable customer is included on purpose — a subscription created
 *    outside this deployment has no learner to grant, and no number of retries
 *    will conjure one. It is recorded in `billing_events` so it is visible.
 *  - 500: the write failed. The claim is released first so the retry is not
 *    dismissed as a duplicate of an attempt that changed nothing.
 */
export async function handleStripeWebhook(
  request: WebhookRequest,
  deps: WebhookDependencies
): Promise<WebhookResult> {
  if (!request.signature) {
    return { status: 400, body: { error: "Signature Stripe absente" } };
  }

  let event: Stripe.Event;

  try {
    event = Stripe.webhooks.constructEvent(request.rawBody, request.signature, deps.webhookSecret);
  } catch (error) {
    // Deliberately terse: the caller of a failed verification is not entitled to
    // know why it failed. The reason is logged by the route instead.
    return {
      status: 400,
      body: {
        error: "Signature Stripe invalide",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      }
    };
  }

  const normalised = toBillingWebhookEvent(event, deps.resolvePlanKey);

  if (!normalised) {
    // An event type this endpoint is not subscribed to. Acknowledged without a
    // ledger row: recording every unhandled delivery would turn the ledger into
    // a log of Stripe's catalogue rather than of decisions taken.
    return { status: 200, body: { received: true, ignored: "unhandled-event-type", type: event.type } };
  }

  const claimed = await deps.store.claimEvent(event.id, event.type);

  if (!claimed) {
    return { status: 200, body: { received: true, duplicate: true, type: event.type } };
  }

  const intent = mapBillingEvent(normalised);

  let result: ApplyBillingIntentResult;

  try {
    result = await deps.store.applyIntent(intent);
  } catch (error) {
    // Give the id back before answering, or Stripe's retry — the one mechanism
    // that can still fix this — would be swallowed as a duplicate.
    await deps.store.releaseEvent(event.id);

    return {
      status: 500,
      body: {
        error: "Traitement impossible",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      }
    };
  }

  await deps.store.settleEvent(event.id, result.outcome, intent.reason);

  return {
    status: 200,
    body: {
      received: true,
      type: event.type,
      outcome: result.outcome,
      reason: intent.reason,
      features: result.features
    }
  };
}
