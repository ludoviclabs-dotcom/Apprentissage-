import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  ENTITLEMENT_GRACE_HOURS,
  entitlementExpiry,
  getRequiredEntitlement,
  isEntitlementActive,
  isEntitlingStatus,
  mapBillingEvent,
  planFeatures,
  SUBSCRIPTION_STATUSES,
  type BillingWebhookEvent,
  type EntitlementRecord,
  type SubscriptionSnapshot
} from "../src/index";

/**
 * The activation and revocation rules, tested where they live.
 *
 * `mapBillingEvent` is the whole decision: everything downstream of it writes
 * rows. Testing it here rather than through the route means each rule is stated
 * once — "past_due does not grant", "a checkout grant carries no expiry" — and a
 * change to one of them fails a test whose name says which rule broke.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const PERIOD_END = "2027-07-27T00:00:00.000Z";
const PERIOD_END_PLUS_GRACE = "2027-07-28T00:00:00.000Z";

function subscription(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    stripeSubscriptionId: "sub_1",
    stripeCustomerId: "cus_1",
    status: "active",
    userId: USER,
    planKey: "founder-annual",
    priceId: "price_1",
    currentPeriodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    ...overrides
  };
}

function subscriptionEvent(
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  overrides: Partial<SubscriptionSnapshot> = {}
): BillingWebhookEvent {
  return { id: `evt_${type}`, type, subscription: subscription(overrides) };
}

describe("plans", () => {
  it("names an environment variable for each price, never a price", () => {
    for (const plan of Object.values(BILLING_PLANS)) {
      expect(plan.priceEnvVar).toMatch(/^STRIPE_PRICE_[A-Z_]+$/);
      expect(JSON.stringify(plan)).not.toMatch(/price_/);
    }
  });

  it("grants nothing for an unknown or absent plan key", () => {
    expect(planFeatures(null)).toEqual([]);
    expect(planFeatures("enterprise-unlimited")).toEqual([]);
  });
});

describe("entitling statuses", () => {
  it("grants on active and trialing only", () => {
    const entitling = SUBSCRIPTION_STATUSES.filter(isEntitlingStatus);

    expect(entitling).toEqual(["active", "trialing"]);
  });

  it("does not grant while Stripe is retrying a failed payment", () => {
    // The rule that matters commercially: `past_due` is a card that was
    // declined, not a subscription that is paid up.
    expect(isEntitlingStatus("past_due")).toBe(false);
    expect(isEntitlingStatus("unpaid")).toBe(false);
  });
});

describe("expiry", () => {
  it("adds the grace window to the period end", () => {
    expect(entitlementExpiry(PERIOD_END)).toBe(PERIOD_END_PLUS_GRACE);
    expect(ENTITLEMENT_GRACE_HOURS).toBe(24);
  });

  it("returns null for a missing or unparseable period end", () => {
    expect(entitlementExpiry(null)).toBeNull();
    expect(entitlementExpiry("not-a-date")).toBeNull();
  });
});

describe("isEntitlementActive", () => {
  const base: EntitlementRecord = {
    feature: "excel-finance-lab",
    status: "active",
    source: "subscription",
    planKey: "founder-annual",
    stripeSubscriptionId: "sub_1",
    grantedAt: "2026-07-27T00:00:00.000Z",
    expiresAt: PERIOD_END_PLUS_GRACE,
    revokedAt: null
  };

  it("is true inside the paid period", () => {
    expect(isEntitlementActive(base, new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("lapses on its own once the period plus grace has passed", () => {
    // The self-healing property: even if `customer.subscription.deleted` never
    // arrived, access ends when the paid-for time does.
    expect(isEntitlementActive(base, new Date("2027-07-29T00:00:00.000Z"))).toBe(false);
  });

  it("is false once revoked, whatever the expiry says", () => {
    expect(
      isEntitlementActive(
        { ...base, status: "revoked", revokedAt: "2026-08-01T00:00:00.000Z" },
        new Date("2027-01-01T00:00:00.000Z")
      )
    ).toBe(false);
  });

  it("treats an undated grant as open and an unparseable one as closed", () => {
    expect(isEntitlementActive({ ...base, expiresAt: null }, new Date("2099-01-01T00:00:00.000Z"))).toBe(
      true
    );
    expect(isEntitlementActive({ ...base, expiresAt: "soon" }, new Date())).toBe(false);
  });
});

describe("mapBillingEvent — checkout.session.completed", () => {
  const paidSession: BillingWebhookEvent = {
    id: "evt_1",
    type: "checkout.session.completed",
    session: {
      sessionId: "cs_1",
      mode: "subscription",
      paymentStatus: "paid",
      userId: USER,
      planKey: "founder-annual",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1"
    }
  };

  it("grants the plan's features with no expiry yet", () => {
    const intent = mapBillingEvent(paidSession);

    expect(intent.effect).toBe("grant");
    expect(intent.reason).toBe("checkout-paid");
    expect(intent.features).toEqual(["excel-finance-lab", "completion-certificate"]);
    // Provisional: the session carries no billing period, and the subscription
    // event that follows replaces this with a dated grant.
    expect(intent.expiresAt).toBeNull();
    expect(intent.userId).toBe(USER);
  });

  it("records the subscription as provisionally incomplete rather than guessing active", () => {
    // The flag is what stops a late checkout event from re-describing a
    // subscription Stripe already reported as active.
    expect(mapBillingEvent(paidSession).subscription).toMatchObject({
      stripeSubscriptionId: "sub_1",
      status: "incomplete",
      statusIsProvisional: true,
      planKey: "founder-annual"
    });
  });

  it("grants nothing when the session was not paid", () => {
    const intent = mapBillingEvent({
      ...paidSession,
      session: { ...paidSession.session, paymentStatus: "unpaid" }
    });

    expect(intent.effect).toBe("none");
    expect(intent.reason).toBe("checkout-not-paid");
  });

  it("accepts a fully discounted session as settled", () => {
    const intent = mapBillingEvent({
      ...paidSession,
      session: { ...paidSession.session, paymentStatus: "no_payment_required" }
    });

    expect(intent.effect).toBe("grant");
  });

  it("ignores a one-off payment session", () => {
    const intent = mapBillingEvent({
      ...paidSession,
      session: { ...paidSession.session, mode: "payment" }
    });

    expect(intent.effect).toBe("none");
    expect(intent.reason).toBe("checkout-not-subscription");
  });

  it("grants nothing for a plan key it does not recognise", () => {
    const intent = mapBillingEvent({
      ...paidSession,
      session: { ...paidSession.session, planKey: "legacy-lifetime" }
    });

    expect(intent.effect).toBe("none");
    expect(intent.reason).toBe("unknown-plan");
    expect(intent.features).toEqual([]);
  });
});

describe("mapBillingEvent — customer.subscription.*", () => {
  it("grants with a dated expiry when the subscription is active", () => {
    const intent = mapBillingEvent(subscriptionEvent("customer.subscription.created"));

    expect(intent.effect).toBe("grant");
    expect(intent.reason).toBe("subscription-entitling");
    expect(intent.expiresAt).toBe(PERIOD_END_PLUS_GRACE);
    expect(intent.subscription).toMatchObject({
      status: "active",
      statusIsProvisional: false,
      currentPeriodEnd: PERIOD_END
    });
  });

  it("grants on a trial", () => {
    expect(
      mapBillingEvent(subscriptionEvent("customer.subscription.updated", { status: "trialing" })).effect
    ).toBe("grant");
  });

  it("revokes when the payment fails", () => {
    const intent = mapBillingEvent(
      subscriptionEvent("customer.subscription.updated", { status: "past_due" })
    );

    expect(intent.effect).toBe("revoke");
    expect(intent.reason).toBe("subscription-not-entitling");
    // The row still tracks Stripe even though access is closed.
    expect(intent.subscription).toMatchObject({ status: "past_due" });
  });

  it("revokes on deletion and forces the stored status to canceled", () => {
    const intent = mapBillingEvent(
      // Stripe's `deleted` payload can still carry a stale status; the event
      // itself is the end of the subscription.
      subscriptionEvent("customer.subscription.deleted", { status: "active" })
    );

    expect(intent.effect).toBe("revoke");
    expect(intent.reason).toBe("subscription-deleted");
    expect(intent.subscription?.status).toBe("canceled");
  });

  it("stores an active subscription on an unrecognised price without granting", () => {
    const intent = mapBillingEvent(
      subscriptionEvent("customer.subscription.created", { planKey: null, priceId: "price_unknown" })
    );

    expect(intent.effect).toBe("none");
    expect(intent.reason).toBe("unknown-plan");
    expect(intent.features).toEqual([]);
    // Visible to an operator, so a mis-mapped price can be diagnosed.
    expect(intent.subscription).toMatchObject({ priceId: "price_unknown" });
  });

  it("keeps the customer id so an unattributed event can still be resolved", () => {
    const intent = mapBillingEvent(
      subscriptionEvent("customer.subscription.updated", { userId: null })
    );

    expect(intent.userId).toBeNull();
    expect(intent.stripeCustomerId).toBe("cus_1");
  });
});

describe("mapBillingEvent — invoice.paid", () => {
  const renewal: BillingWebhookEvent = {
    id: "evt_inv",
    type: "invoice.paid",
    invoice: {
      invoiceId: "in_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      userId: USER,
      planKey: "founder-annual",
      periodEnd: PERIOD_END,
      paid: true
    }
  };

  it("extends the expiry from a confirmed payment", () => {
    const intent = mapBillingEvent(renewal);

    expect(intent.effect).toBe("grant");
    expect(intent.reason).toBe("invoice-paid");
    expect(intent.expiresAt).toBe(PERIOD_END_PLUS_GRACE);
    // An invoice does not know the subscription's status, so it must not write
    // the subscription row.
    expect(intent.subscription).toBeNull();
  });

  it("ignores an unpaid invoice", () => {
    expect(mapBillingEvent({ ...renewal, invoice: { ...renewal.invoice, paid: false } }).reason).toBe(
      "invoice-not-paid"
    );
  });

  it("ignores an invoice unrelated to a subscription", () => {
    expect(
      mapBillingEvent({
        ...renewal,
        invoice: { ...renewal.invoice, stripeSubscriptionId: null }
      }).reason
    ).toBe("invoice-without-subscription");
  });

  it("refuses to grant when the invoice cannot date the period it paid for", () => {
    // Granting with a null expiry here would replace the subscription's dated
    // grant with an open-ended one.
    const intent = mapBillingEvent({
      ...renewal,
      invoice: { ...renewal.invoice, periodEnd: null }
    });

    expect(intent.effect).toBe("none");
    expect(intent.reason).toBe("invoice-without-period");
  });
});

describe("the premium gate is driven by the module registry", () => {
  it("requires the entitlement for a lab exercise", () => {
    expect(getRequiredEntitlement("ex-xl-chiffre-affaires")).toBe("excel-finance-lab");
  });

  it("leaves the accounting core free", () => {
    expect(getRequiredEntitlement("ex-cgv1-achat-marchandises")).toBeNull();
  });

  it("leaves an exercise outside every module free", () => {
    expect(getRequiredEntitlement("ex-does-not-exist")).toBeNull();
  });
});
