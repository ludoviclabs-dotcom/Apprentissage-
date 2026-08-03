import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import type { BillingIntent } from "@finance/domain";
import type { ApplyBillingIntentResult, BillingEventOutcome } from "@finance/db";
import { handleStripeWebhook, toBillingWebhookEvent, type BillingStore } from "@/lib/billing/webhook";

/**
 * The webhook endpoint, driven by signed fixtures.
 *
 * THE SIGNATURE CHECK UNDER TEST IS THE REAL ONE. Every request here is signed
 * with `Stripe.webhooks.generateTestHeaderString`, the SDK's own counterpart to
 * the verification the handler runs, so "an unsigned body is refused" is a fact
 * about the shipped code rather than about a stub. Nothing in this file reaches
 * the network: `constructEvent` is pure HMAC over the bytes.
 *
 * THE FIXTURES ARE WHOLE STRIPE EVENTS, not the flattened shapes the domain
 * mapper consumes. That is the point — the flattening is where an API version
 * change bites, and `apps/web/test/fixtures/stripe/*.json` are shaped like the
 * payloads the pinned version actually delivers, down to `current_period_end`
 * living on the subscription's items and an invoice reaching its subscription
 * through `parent.subscription_details`.
 */

const SECRET = "whsec_test_secret_for_unit_tests";
const USER = "11111111-1111-4111-8111-111111111111";
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/stripe");

function fixture(name: string): string {
  // Read as text, not parsed and re-stringified: Stripe signs bytes, and a
  // round trip through JSON.parse would be a different payload than the one the
  // signature covers.
  return readFileSync(resolve(fixturesDir, `${name}.json`), "utf8");
}

function sign(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

/** Maps the fixtures' price ids the way the configured environment would. */
function resolvePlanKey(priceId: string | null): string | null {
  return priceId === "price_founder_annual_test" ? "founder-annual" : null;
}

interface RecordedEvent {
  outcome: BillingEventOutcome;
  detail: string;
}

/**
 * A spy over the persistence boundary.
 *
 * It records intents rather than reimplementing the SQL upsert: what belongs to
 * this suite is which intent each signed payload produces and in what order the
 * ledger is touched. The row-level behaviour of the upsert — the coalesce that
 * stops an undated grant overwriting a dated one — is asserted against a real
 * PostgreSQL in `packages/db/test/billing-entitlements.integration.test.ts`.
 */
class FakeStore implements BillingStore {
  readonly claimed = new Map<string, RecordedEvent>();
  readonly intents: BillingIntent[] = [];
  readonly released: string[] = [];
  failNextApply = false;
  /** Which user id `applyIntent` claims to have resolved. */
  resolveTo: string | null = USER;

  async claimEvent(stripeEventId: string, type: string): Promise<boolean> {
    if (this.claimed.has(stripeEventId)) {
      return false;
    }

    this.claimed.set(stripeEventId, { outcome: "received", detail: type });

    return true;
  }

  async settleEvent(
    stripeEventId: string,
    outcome: BillingEventOutcome,
    detail: string
  ): Promise<void> {
    this.claimed.set(stripeEventId, { outcome, detail });
  }

  async releaseEvent(stripeEventId: string): Promise<void> {
    this.claimed.delete(stripeEventId);
    this.released.push(stripeEventId);
  }

  async applyIntent(intent: BillingIntent): Promise<ApplyBillingIntentResult> {
    if (this.failNextApply) {
      this.failNextApply = false;
      throw new Error("écriture impossible");
    }

    this.intents.push(intent);

    if (intent.effect === "none") {
      return { outcome: "ignored", userId: intent.userId, features: [] };
    }

    const userId = intent.userId ?? this.resolveTo;

    if (!userId) {
      return { outcome: "unresolved", userId: null, features: [] };
    }

    return {
      outcome: intent.effect === "grant" ? "granted" : "revoked",
      userId,
      features: intent.features
    };
  }
}

let store: FakeStore;

function deps(overrides: Partial<{ webhookSecret: string }> = {}) {
  return { webhookSecret: SECRET, store, resolvePlanKey, ...overrides };
}

async function deliver(name: string, options: { secret?: string; timestamp?: number } = {}) {
  const payload = fixture(name);

  return handleStripeWebhook(
    { rawBody: payload, signature: sign(payload, options.secret ?? SECRET, options.timestamp) },
    deps()
  );
}

beforeEach(() => {
  store = new FakeStore();
});

describe("signature verification", () => {
  it("refuses a request with no signature header", async () => {
    const result = await handleStripeWebhook(
      { rawBody: fixture("checkout-session-completed"), signature: null },
      deps()
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Signature Stripe absente" });
    expect(store.claimed.size).toBe(0);
    expect(store.intents).toHaveLength(0);
  });

  it("refuses a signature made with a different secret", async () => {
    const payload = fixture("checkout-session-completed");
    const result = await handleStripeWebhook(
      { rawBody: payload, signature: sign(payload, "whsec_someone_elses_secret") },
      deps()
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Signature Stripe invalide" });
    expect(store.intents).toHaveLength(0);
  });

  it("refuses a body altered after signing", async () => {
    // The exact attack the signature exists to stop: a real event whose user id
    // has been swapped for somebody else's.
    const payload = fixture("checkout-session-completed");
    const signature = sign(payload);
    const tampered = payload.replace(USER, "22222222-2222-4222-8222-222222222222");

    expect(tampered).not.toBe(payload);

    const result = await handleStripeWebhook({ rawBody: tampered, signature }, deps());

    expect(result.status).toBe(400);
    expect(store.intents).toHaveLength(0);
  });

  it("refuses a replay outside the timestamp tolerance", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 60 * 60;
    const result = await deliver("checkout-session-completed", { timestamp: staleTimestamp });

    expect(result.status).toBe(400);
  });

  it("accepts a correctly signed body", async () => {
    const result = await deliver("checkout-session-completed");

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ received: true, outcome: "granted" });
  });
});

describe("checkout.session.completed", () => {
  it("attributes the session and grants the plan provisionally", async () => {
    await deliver("checkout-session-completed");

    expect(store.intents).toHaveLength(1);
    expect(store.intents[0]).toMatchObject({
      effect: "grant",
      reason: "checkout-paid",
      userId: USER,
      stripeCustomerId: "cus_TESTFOUNDER",
      features: ["excel-finance-lab", "completion-certificate"],
      expiresAt: null
    });
  });

  it("grants nothing when the session was not paid", async () => {
    const result = await deliver("checkout-session-unpaid");

    expect(result.status).toBe(200);
    expect(store.intents[0]).toMatchObject({ effect: "none", reason: "checkout-not-paid" });
  });
});

describe("customer.subscription.*", () => {
  it("reads the period end from the subscription item and dates the grant", async () => {
    await deliver("customer-subscription-created");

    expect(store.intents[0]).toMatchObject({
      effect: "grant",
      reason: "subscription-entitling",
      userId: USER,
      // 2027-07-27 period end plus the 24-hour grace window.
      expiresAt: "2027-07-28T00:00:00.000Z",
      subscription: {
        stripeSubscriptionId: "sub_TESTFOUNDER",
        status: "active",
        planKey: "founder-annual",
        priceId: "price_founder_annual_test",
        currentPeriodEnd: "2027-07-27T00:00:00.000Z"
      }
    });
  });

  it("carries Stripe's event.created, not the delivery time", async () => {
    // The fixture's `created` is 1785110401. Without this the repository could
    // not tell a three-day-old retry from a fresh event.
    await deliver("customer-subscription-created");

    expect(store.intents[0]?.occurredAt).toBe(new Date(1785110401 * 1000).toISOString());
  });

  it("revokes when the subscription falls past due", async () => {
    const result = await deliver("customer-subscription-updated-past-due");

    expect(result.body).toMatchObject({ outcome: "revoked" });
    expect(store.intents[0]).toMatchObject({
      effect: "revoke",
      reason: "subscription-not-entitling",
      subscription: { status: "past_due" }
    });
  });

  it("revokes on deletion", async () => {
    const result = await deliver("customer-subscription-deleted");

    expect(result.body).toMatchObject({ outcome: "revoked", reason: "subscription-deleted" });
    expect(store.intents[0]?.subscription?.status).toBe("canceled");
  });

  it("stores but does not grant a subscription on a price this deployment never sold", async () => {
    // A subscription created straight from the Stripe dashboard: no metadata,
    // and a price the environment cannot map to a plan.
    const result = await deliver("subscription-created-unknown-price");

    expect(result.status).toBe(200);
    expect(store.intents[0]).toMatchObject({
      effect: "none",
      reason: "unknown-plan",
      userId: null,
      stripeCustomerId: "cus_TESTDASHBOARD",
      features: []
    });
  });
});

describe("invoice.paid", () => {
  it("moves the expiry forward without touching the subscription row", async () => {
    await deliver("invoice-paid");

    expect(store.intents[0]).toMatchObject({
      effect: "grant",
      reason: "invoice-paid",
      userId: USER,
      // The renewal period ends 2028-07-26, plus the grace window.
      expiresAt: "2028-07-27T00:00:00.000Z",
      subscription: null
    });
  });

  it("keeps the subscription id on the intent without writing the subscription row", async () => {
    await deliver("invoice-paid");

    // An invoice.paid that lands before any subscription event would otherwise
    // create an entitlement with no subscription id — one that a later
    // cancellation, which revokes by subscription id, could never close.
    expect(store.intents[0]?.stripeSubscriptionId).toBe("sub_TESTFOUNDER");
    expect(store.intents[0]?.subscription).toBeNull();
  });

  it("resolves the subscription through parent.subscription_details", async () => {
    const event = JSON.parse(fixture("invoice-paid")) as Stripe.Event;
    const normalised = toBillingWebhookEvent(event, resolvePlanKey);

    expect(normalised).toMatchObject({
      type: "invoice.paid",
      invoice: { stripeSubscriptionId: "sub_TESTFOUNDER", paid: true }
    });
  });
});

describe("delivery semantics", () => {
  it("acknowledges an event type it does not act on, without a ledger row", async () => {
    const result = await deliver("payment-intent-succeeded");

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ignored: "unhandled-event-type" });
    expect(store.claimed.size).toBe(0);
    expect(store.intents).toHaveLength(0);
  });

  it("applies a redelivered event exactly once", async () => {
    // Stripe delivers at least once. Applying a grant twice would resurrect
    // access a later event had revoked.
    await deliver("customer-subscription-created");
    const second = await deliver("customer-subscription-created");

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true });
    expect(store.intents).toHaveLength(1);
  });

  it("records the decision on the ledger", async () => {
    await deliver("customer-subscription-updated-past-due");

    expect(store.claimed.get("evt_test_subscription_past_due")).toEqual({
      outcome: "revoked",
      detail: "subscription-not-entitling"
    });
  });

  it("releases the claim and answers 500 when the write fails", async () => {
    // Without the release, Stripe's retry — the only thing that can still fix
    // this — would be dismissed as a duplicate and the grant lost for good.
    store.failNextApply = true;

    const result = await deliver("customer-subscription-created");

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Traitement impossible" });
    expect(store.released).toEqual(["evt_test_subscription_created"]);
    expect(store.claimed.size).toBe(0);

    const retry = await deliver("customer-subscription-created");

    expect(retry.status).toBe(200);
    expect(store.intents).toHaveLength(1);
  });

  it("acknowledges an event whose customer maps to no learner", async () => {
    store.resolveTo = null;

    const result = await deliver("subscription-created-unknown-price");

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ outcome: "ignored" });
  });
});
