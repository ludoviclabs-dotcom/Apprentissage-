import {
  entitlementExpiry,
  isEntitlingStatus,
  planFeatures,
  type EntitlementFeature
} from "./billing";

/**
 * Stripe event → what to write. Pure, and the only place that decides whether a
 * payment grants or removes access.
 *
 * WHY A NORMALISED SNAPSHOT INSTEAD OF `Stripe.Event`. The route verifies the
 * signature and flattens the event into the shapes below before calling
 * {@link mapBillingEvent}. Three reasons, in order of how much they matter:
 *
 *  1. The activation rule becomes testable without a Stripe client, a network,
 *     or a fixture that has to satisfy the whole `Stripe.Subscription` type.
 *  2. Stripe moves fields between API versions — `current_period_end` lives on
 *     the subscription *items* since 2025-03, and an invoice reaches its
 *     subscription through `parent.subscription_details`. Confining that to one
 *     adapter means an API upgrade touches one file, not the grant logic.
 *  3. `@finance/domain` is imported by client components. Keeping Stripe types
 *     out of it keeps the SDK out of the browser bundle.
 *
 * The mapper never reads a price id: the adapter has already resolved the price
 * to a plan key against the server-only environment, because prices are
 * configuration and plans are product.
 */

export const HANDLED_BILLING_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid"
] as const;

export type HandledBillingEventType = (typeof HANDLED_BILLING_EVENTS)[number];

export function isHandledBillingEvent(type: string): type is HandledBillingEventType {
  return (HANDLED_BILLING_EVENTS as readonly string[]).includes(type);
}

// --- Normalised event payloads ---------------------------------------------

export interface CheckoutSessionSnapshot {
  sessionId: string;
  /** `subscription` or `payment`. Only subscriptions are sold here. */
  mode: string;
  /** `paid`, `unpaid`, or `no_payment_required` for a fully discounted trial. */
  paymentStatus: string;
  /** From `client_reference_id`, falling back to `metadata.userId`. */
  userId: string | null;
  /** From `metadata.planKey`. */
  planKey: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface SubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  /** Raw Stripe status, stored as received. */
  status: string;
  /** From `metadata.userId`, set through `subscription_data` at checkout. */
  userId: string | null;
  planKey: string | null;
  priceId: string | null;
  /** ISO, from the subscription item's `current_period_end`. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface InvoiceSnapshot {
  invoiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  userId: string | null;
  planKey: string | null;
  /** ISO end of the period this invoice paid for, when the line carries one. */
  periodEnd: string | null;
  paid: boolean;
}

/**
 * `createdAt` is Stripe's `event.created`, not the moment of delivery.
 *
 * It is carried because Stripe retries a failed delivery for up to three days,
 * so a *stale* event can arrive after a newer one — the retry of an `active`
 * update landing after the `past_due` that superseded it. Without a timestamp
 * to compare, applying the older event would reopen paid access on a
 * subscription that had already failed or been cancelled.
 */
export type BillingWebhookEvent =
  | {
      id: string;
      createdAt: string;
      type: "checkout.session.completed";
      session: CheckoutSessionSnapshot;
    }
  | {
      id: string;
      createdAt: string;
      type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted";
      subscription: SubscriptionSnapshot;
    }
  | { id: string; createdAt: string; type: "invoice.paid"; invoice: InvoiceSnapshot };

// --- The decision -----------------------------------------------------------

/** Machine-readable justification, stored on the event ledger and logged. */
export type BillingIntentReason =
  | "checkout-paid"
  | "checkout-not-paid"
  | "checkout-not-subscription"
  | "subscription-entitling"
  | "subscription-not-entitling"
  | "subscription-deleted"
  | "invoice-paid"
  | "invoice-not-paid"
  | "invoice-without-subscription"
  | "invoice-without-period"
  | "unknown-plan";

/** What the subscription row should say after this event. */
export interface SubscriptionDraft {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  status: string;
  /**
   * True when `status` is a placeholder rather than something Stripe reported.
   * Only the checkout session sets it: that event knows a subscription exists
   * but not what state it is in, and it can arrive *after* the subscription
   * event that does know. The repository treats a provisional status as "do not
   * overwrite what is already recorded", so a late checkout cannot turn a live
   * `active` row back into `incomplete` until the next subscription event —
   * which, on an annual plan, is a year away.
   */
  statusIsProvisional: boolean;
  planKey: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingIntent {
  /** `none` is a decision too: the event was understood and changes nothing. */
  effect: "grant" | "revoke" | "none";
  reason: BillingIntentReason;
  /** Stripe's `event.created`, so a stale redelivery can be recognised. */
  occurredAt: string;
  /**
   * Who this is about. At least one of the two must be set for a `grant` or a
   * `revoke`; the repository resolves a customer id to a user through
   * `billing_customers` when `userId` is absent.
   */
  userId: string | null;
  stripeCustomerId: string | null;
  /**
   * The subscription this intent concerns — which is not the same thing as
   * {@link subscription}, the row to write.
   *
   * An invoice names its subscription but must not rewrite that row, since an
   * invoice does not know the subscription's status. The id still has to travel:
   * it is what links the granted entitlement to a subscription, and a later
   * cancellation revokes by exactly that id. Dropping it here would leave an
   * `invoice.paid` that arrived before any subscription event holding an
   * unlinked entitlement that no revocation could reach.
   */
  stripeSubscriptionId: string | null;
  /** Written whether the effect is a grant or a revocation, so the local
   * subscription row tracks Stripe even while access is off. */
  subscription: SubscriptionDraft | null;
  /** Granted features. Always empty on `revoke`: a revocation removes every
   * entitlement tied to the subscription, including ones granted under a plan
   * whose price has since been retired. */
  features: EntitlementFeature[];
  /** Null means "until revoked" — a provisional grant with no period end yet. */
  expiresAt: string | null;
}

function nothing(reason: BillingIntentReason, event: BillingWebhookEvent): BillingIntent {
  return {
    effect: "none",
    reason,
    occurredAt: event.createdAt,
    userId: eventUserId(event),
    stripeCustomerId: eventCustomerId(event),
    stripeSubscriptionId: eventSubscriptionId(event),
    subscription: null,
    features: [],
    expiresAt: null
  };
}

function eventUserId(event: BillingWebhookEvent): string | null {
  switch (event.type) {
    case "checkout.session.completed":
      return event.session.userId;
    case "invoice.paid":
      return event.invoice.userId;
    default:
      return event.subscription.userId;
  }
}

function eventCustomerId(event: BillingWebhookEvent): string | null {
  switch (event.type) {
    case "checkout.session.completed":
      return event.session.stripeCustomerId;
    case "invoice.paid":
      return event.invoice.stripeCustomerId;
    default:
      return event.subscription.stripeCustomerId;
  }
}

function eventSubscriptionId(event: BillingWebhookEvent): string | null {
  switch (event.type) {
    case "checkout.session.completed":
      return event.session.stripeSubscriptionId;
    case "invoice.paid":
      return event.invoice.stripeSubscriptionId;
    default:
      return event.subscription.stripeSubscriptionId;
  }
}

function toDraft(subscription: SubscriptionSnapshot): SubscriptionDraft {
  return {
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripeCustomerId: subscription.stripeCustomerId,
    status: subscription.status,
    statusIsProvisional: false,
    planKey: subscription.planKey,
    priceId: subscription.priceId,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
  };
}

/**
 * THE ACTIVATION RULE, in one function.
 *
 * `checkout.session.completed` grants immediately when the session says the
 * money arrived, but with no expiry: the session does not carry a billing
 * period, so the grant is provisional and the subscription event that follows
 * replaces it with a dated one. The alternative — waiting for the subscription
 * event before opening anything — leaves a paying learner staring at a paywall
 * for as long as Stripe takes to deliver a second event, and Stripe guarantees
 * no ordering between the two.
 *
 * Everything after that is derived from the subscription's own status, which is
 * the only field that keeps telling the truth over time. A grant made here can
 * always be taken back by `customer.subscription.updated`, and always lapses on
 * its own once `expiresAt` passes.
 *
 * Note what is absent: the success page. Nothing a browser sends can reach this
 * function — it is only ever called with an event whose Stripe signature has
 * already been verified.
 */
export function mapBillingEvent(event: BillingWebhookEvent): BillingIntent {
  switch (event.type) {
    case "checkout.session.completed": {
      const { session } = event;

      if (session.mode !== "subscription") {
        return nothing("checkout-not-subscription", event);
      }

      // `no_payment_required` is a fully discounted or trialing session: Stripe
      // considers it settled, and the subscription that follows carries the
      // trial status which decides the rest.
      if (session.paymentStatus !== "paid" && session.paymentStatus !== "no_payment_required") {
        return nothing("checkout-not-paid", event);
      }

      const features = planFeatures(session.planKey);

      if (features.length === 0) {
        return nothing("unknown-plan", event);
      }

      return {
        effect: "grant",
        reason: "checkout-paid",
        occurredAt: event.createdAt,
        userId: session.userId,
        stripeCustomerId: session.stripeCustomerId,
        stripeSubscriptionId: session.stripeSubscriptionId,
        subscription: session.stripeSubscriptionId
          ? {
              stripeSubscriptionId: session.stripeSubscriptionId,
              stripeCustomerId: session.stripeCustomerId,
              // The session does not report the subscription's status.
              // `incomplete` is Stripe's own word for "created, not yet
              // confirmed" and is the right thing to record when this is the
              // first news of the subscription — but it is flagged provisional
              // so it can never *replace* a status Stripe actually reported.
              status: "incomplete",
              statusIsProvisional: true,
              planKey: session.planKey,
              priceId: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false
            }
          : null,
        features,
        expiresAt: null
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const { subscription } = event;
      const draft = toDraft(subscription);

      if (!isEntitlingStatus(subscription.status)) {
        return {
          effect: "revoke",
          reason: "subscription-not-entitling",
          occurredAt: event.createdAt,
          userId: subscription.userId,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          subscription: draft,
          features: [],
          expiresAt: null
        };
      }

      const features = planFeatures(subscription.planKey);

      if (features.length === 0) {
        // An active subscription on a price this deployment does not recognise.
        // Storing the row and granting nothing is the honest outcome: the
        // operator can see the subscription and fix the price mapping, and no
        // access was handed out on a guess.
        return { ...nothing("unknown-plan", event), subscription: draft };
      }

      return {
        effect: "grant",
        reason: "subscription-entitling",
        occurredAt: event.createdAt,
        userId: subscription.userId,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        subscription: draft,
        features,
        expiresAt: entitlementExpiry(subscription.currentPeriodEnd)
      };
    }

    case "customer.subscription.deleted": {
      const { subscription } = event;

      return {
        effect: "revoke",
        reason: "subscription-deleted",
        occurredAt: event.createdAt,
        userId: subscription.userId,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        // Forced to `canceled`: the deleted event is the end of the
        // subscription whatever status the payload happens to carry.
        subscription: { ...toDraft(subscription), status: "canceled" },
        features: [],
        expiresAt: null
      };
    }

    case "invoice.paid": {
      const { invoice } = event;

      if (!invoice.paid) {
        return nothing("invoice-not-paid", event);
      }

      if (!invoice.stripeSubscriptionId) {
        // A one-off invoice. Nothing about it says anything about access.
        return nothing("invoice-without-subscription", event);
      }

      const features = planFeatures(invoice.planKey);

      if (features.length === 0) {
        return nothing("unknown-plan", event);
      }

      // An invoice whose line carries no period cannot date the access it paid
      // for, and a grant with no expiry would *replace* the dated one the
      // subscription event set with an open-ended one. Refusing here keeps this
      // event strictly additive to what the subscription already decided.
      if (!invoice.periodEnd) {
        return nothing("invoice-without-period", event);
      }

      // A renewal. `customer.subscription.updated` normally carries the same
      // news with a status attached, so this is the belt to that pair of braces:
      // it moves the expiry forward from a signal that is, by definition, money
      // that arrived. It deliberately does not touch the subscription row —
      // an invoice does not know the subscription's current status.
      return {
        effect: "grant",
        reason: "invoice-paid",
        occurredAt: event.createdAt,
        userId: invoice.userId,
        stripeCustomerId: invoice.stripeCustomerId,
        // Carried even though `subscription` stays null: the entitlement must
        // be linked to the subscription, or a later cancellation — which
        // revokes by subscription id — would not reach it.
        stripeSubscriptionId: invoice.stripeSubscriptionId,
        subscription: null,
        features,
        expiresAt: entitlementExpiry(invoice.periodEnd)
      };
    }
  }
}
