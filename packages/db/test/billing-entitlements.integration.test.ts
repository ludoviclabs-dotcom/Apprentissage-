import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BillingIntent, LevelSnapshot, ModuleLevelDefinition } from "@finance/domain";
import { migrationFiles } from "../src/schema";

/**
 * What `applyBillingIntent` actually writes, against a real PostgreSQL.
 *
 * The unit suites cover the decision — which event grants, which revokes, and
 * with what expiry. Three things can only be proven here, and each one is a way
 * a learner could end up with access nobody paid for, or lose access they did:
 *
 *  1. The upsert's COALESCE. Stripe orders nothing, so the provisional grant
 *     made at checkout (no expiry, meaning "until revoked") can land *after* the
 *     dated grant from the subscription event. If it overwrote the date with
 *     NULL, that entitlement would never lapse again.
 *  2. Revocation by subscription rather than by feature. A plan retired from
 *     `BILLING_PLANS` still has live entitlements pointing at it; a revocation
 *     that could only name features it still recognises would leave them open.
 *  3. Row level security on `entitlements`, `subscriptions` and `certificates` —
 *     one learner's paid access must be invisible to another's session.
 *
 * Requires a real PostgreSQL, and is skipped, loudly, without one.
 */

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    // The wording matters: the CI job greps for "is NOT verified" and fails the
    // build on a match, so a skipped suite can never pass for a green one.
    "[billing-entitlements.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — entitlement persistence is NOT verified in this run."
  );
}

const PERIOD_END = "2027-07-27T00:00:00.000Z";
const PERIOD_END_PLUS_GRACE = "2027-07-28T00:00:00.000Z";
const LATER_PERIOD_END_PLUS_GRACE = "2028-07-27T00:00:00.000Z";

describeWithDb("billing entitlements", () => {
  let admin: Sql;
  let alice: string;
  let bob: string;
  let billing: typeof import("../src/billing-repository");

  function subscriptionIntent(
    userId: string,
    overrides: Partial<BillingIntent> & { subscriptionId?: string } = {}
  ): BillingIntent {
    const { subscriptionId = "sub_alice", ...rest } = overrides;

    return {
      effect: "grant",
      reason: "subscription-entitling",
      userId,
      stripeCustomerId: `cus_${userId.slice(0, 8)}`,
      subscription: {
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: `cus_${userId.slice(0, 8)}`,
        status: "active",
        statusIsProvisional: false,
        planKey: "founder-annual",
        priceId: "price_founder_annual_test",
        currentPeriodEnd: PERIOD_END,
        cancelAtPeriodEnd: false
      },
      features: ["excel-finance-lab", "completion-certificate"],
      expiresAt: PERIOD_END_PLUS_GRACE,
      ...rest
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    billing = await import("../src/billing-repository");
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    const [aliceRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-billing@example.test', 'alice-billing@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-billing@example.test', 'bob-billing@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;
  }, 180_000);

  afterAll(async () => {
    if (!admin) {
      return;
    }

    await admin`delete from app_users where email_normalized in ('alice-billing@example.test', 'bob-billing@example.test')`;
    await admin.end();
  });

  it("grants the plan's features and dates them from the billing period", async () => {
    const result = await billing.applyBillingIntent(subscriptionIntent(alice));

    expect(result.outcome).toBe("granted");
    expect(await billing.hasEntitlement(alice, "excel-finance-lab")).toBe(true);

    const records = await billing.getEntitlements(alice);
    const lab = records.find((record) => record.feature === "excel-finance-lab");

    // Also asserts the boundary normalises PostgreSQL's timestamp format to ISO:
    // `isEntitlementActive` compares this string against the clock.
    expect(lab?.expiresAt).toBe(PERIOD_END_PLUS_GRACE);
  });

  it("lapses on its own once the paid period plus grace has passed", async () => {
    // Nothing revoked this. Time did.
    expect(
      await billing.hasEntitlement(alice, "excel-finance-lab", new Date("2027-07-29T00:00:00.000Z"))
    ).toBe(false);
  });

  it("does not let a late checkout event undo what the subscription event said", async () => {
    // The out-of-order case, exactly as Stripe can deliver it: the checkout
    // event arrives after the subscription event. Its grant carries no expiry
    // and a placeholder status, and neither may replace what is recorded.
    await billing.applyBillingIntent({
      effect: "grant",
      reason: "checkout-paid",
      userId: alice,
      stripeCustomerId: `cus_${alice.slice(0, 8)}`,
      subscription: {
        stripeSubscriptionId: "sub_alice",
        stripeCustomerId: `cus_${alice.slice(0, 8)}`,
        status: "incomplete",
        statusIsProvisional: true,
        planKey: "founder-annual",
        priceId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false
      },
      features: ["excel-finance-lab"],
      expiresAt: null
    });

    const lab = (await billing.getEntitlements(alice)).find(
      (record) => record.feature === "excel-finance-lab"
    );
    const [subscription] = await billing.getSubscriptions(alice);

    // A dated expiry survives an undated grant…
    expect(lab?.expiresAt).toBe(PERIOD_END_PLUS_GRACE);
    // …and so do the fields the session simply did not know.
    expect(subscription).toMatchObject({
      status: "active",
      currentPeriodEnd: PERIOD_END
    });
  });

  it("moves the expiry forward on a renewal", async () => {
    await billing.applyBillingIntent(
      subscriptionIntent(alice, { reason: "invoice-paid", expiresAt: LATER_PERIOD_END_PLUS_GRACE })
    );

    const lab = (await billing.getEntitlements(alice)).find(
      (record) => record.feature === "excel-finance-lab"
    );

    expect(lab?.expiresAt).toBe(LATER_PERIOD_END_PLUS_GRACE);
  });

  it("revokes every feature tied to the subscription, including forgotten plans", async () => {
    // A feature granted under a plan the code no longer knows about. Revocation
    // works from the subscription id, so it closes anyway.
    await admin`
      update entitlements
         set plan_key = 'retired-lifetime'
       where user_id = ${alice} and feature = 'completion-certificate'`;

    const result = await billing.applyBillingIntent({
      effect: "revoke",
      reason: "subscription-deleted",
      userId: alice,
      stripeCustomerId: `cus_${alice.slice(0, 8)}`,
      subscription: {
        stripeSubscriptionId: "sub_alice",
        stripeCustomerId: `cus_${alice.slice(0, 8)}`,
        status: "canceled",
        statusIsProvisional: false,
        planKey: "founder-annual",
        priceId: "price_founder_annual_test",
        currentPeriodEnd: PERIOD_END,
        cancelAtPeriodEnd: false
      },
      features: [],
      expiresAt: null
    });

    expect(result.outcome).toBe("revoked");
    expect(result.features.sort()).toEqual(["completion-certificate", "excel-finance-lab"]);
    expect(await billing.hasEntitlement(alice, "excel-finance-lab")).toBe(false);
    expect(await billing.hasEntitlement(alice, "completion-certificate")).toBe(false);
  });

  it("leaves a manual grant untouched when Stripe revokes", async () => {
    await admin`
      insert into entitlements (user_id, feature, status, source)
      values (${alice}, 'excel-finance-lab', 'active', 'manual')
      on conflict (user_id, feature)
        do update set status = 'active', source = 'manual', revoked_at = null,
                      stripe_subscription_id = null, expires_at = null`;

    await billing.applyBillingIntent({
      effect: "revoke",
      reason: "subscription-deleted",
      userId: alice,
      stripeCustomerId: `cus_${alice.slice(0, 8)}`,
      subscription: null,
      features: [],
      expiresAt: null
    });

    expect(await billing.hasEntitlement(alice, "excel-finance-lab")).toBe(true);
  });

  it("resolves a Stripe customer to its learner, and nobody to an unknown one", async () => {
    await billing.linkStripeCustomer(bob, "cus_bob_only");

    expect(await billing.findUserByStripeCustomer("cus_bob_only")).toBe(bob);
    expect(await billing.findUserByStripeCustomer("cus_never_seen")).toBeNull();
  });

  it("keeps one learner's entitlements invisible to another", async () => {
    await billing.applyBillingIntent(
      subscriptionIntent(bob, { subscriptionId: "sub_bob" })
    );

    const bobRecords = await billing.getEntitlements(bob);
    const aliceRecords = await billing.getEntitlements(alice);

    expect(bobRecords.map((record) => record.stripeSubscriptionId)).toContain("sub_bob");
    expect(aliceRecords.map((record) => record.stripeSubscriptionId)).not.toContain("sub_bob");
  });

  it("refuses an attestation while the track is unfinished, and issues exactly one after", async () => {
    const levels: ModuleLevelDefinition[] = [
      {
        id: "level-fixture-1",
        trackId: "track-fixture",
        moduleId: "module-fixture",
        domainId: "compta-generale",
        level: 1,
        title: "Fixture",
        objective: "Fixture",
        competencyIds: ["cg-cutoff"],
        criticalCompetencyIds: ["cg-cutoff"],
        estimatedMinutes: 60
      }
    ];

    function snapshot(status: LevelSnapshot["status"], score: number): LevelSnapshot {
      return {
        levelId: "level-fixture-1",
        rulesVersion: "curriculum-2026-07",
        status,
        score,
        components: { direct: score, retention: score, caseStudy: score, explanation: score },
        missingKinds: [],
        finalDiagnosticCompleted: true,
        blockers: []
      };
    }

    const input = {
      userId: bob,
      holderEmail: "bob-billing@example.test",
      trackId: "track-fixture",
      trackLabel: "Parcours fixture",
      curriculumVersionId: "curriculum-2026-07",
      levels
    };

    const tooEarly = await billing.issueCertificate({
      ...input,
      snapshots: [snapshot("in-progress", 40)]
    });

    expect(tooEarly.status).toBe("refused");
    expect(tooEarly.status === "refused" && tooEarly.eligibility.blockers).toContain(
      "levels-incomplete"
    );

    const first = await billing.issueCertificate({ ...input, snapshots: [snapshot("acquired", 88)] });

    expect(first.status).toBe("issued");
    expect(first.status !== "refused" && first.certificate.serial).toMatch(/^FLH-\d{4}-[0-9A-F]{10}$/);
    expect(first.status !== "refused" && first.certificate.averageScore).toBe(88);

    // Asking again returns the same document rather than minting a second
    // serial for the same work.
    const second = await billing.issueCertificate({ ...input, snapshots: [snapshot("acquired", 88)] });

    expect(second.status).toBe("existing");
    expect(second.status !== "refused" && second.certificate.serial).toBe(
      first.status !== "refused" ? first.certificate.serial : ""
    );
  });

  it("keeps an issued attestation valid after the subscription is revoked", async () => {
    // The rule the certificate turns on: it records work done, it is not an
    // access right. Bob's entitlements were granted above and are revoked here.
    await billing.applyBillingIntent({
      effect: "revoke",
      reason: "subscription-deleted",
      userId: bob,
      stripeCustomerId: null,
      subscription: null,
      features: [],
      expiresAt: null
    });

    expect(await billing.hasEntitlement(bob, "completion-certificate")).toBe(false);
    expect(await billing.getCertificateForTrack(bob, "track-fixture")).not.toBeNull();
  });

  it("claims a webhook event once and releases it on demand", async () => {
    expect(await billing.claimBillingEvent("evt_integration_1", "invoice.paid")).toBe(true);
    expect(await billing.claimBillingEvent("evt_integration_1", "invoice.paid")).toBe(false);

    await billing.settleBillingEvent("evt_integration_1", "granted", "invoice-paid");
    await billing.releaseBillingEvent("evt_integration_1");

    expect(await billing.claimBillingEvent("evt_integration_1", "invoice.paid")).toBe(true);
    await billing.releaseBillingEvent("evt_integration_1");
  });
});
