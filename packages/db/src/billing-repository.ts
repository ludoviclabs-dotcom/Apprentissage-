import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  evaluateCertificateEligibility,
  formatCertificateSerial,
  isEntitlementActive,
  isEntitlementFeature,
  type BillingIntent,
  type CertificateEligibility,
  type CertificateRecord,
  type EntitlementFeature,
  type EntitlementRecord,
  type EntitlementSource,
  type EntitlementStatus,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";
import { canUseDatabase, createDb } from "./client";
import {
  billingCustomersTable,
  billingEventsTable,
  certificatesTable,
  entitlementsTable,
  subscriptionsTable
} from "./drizzle-schema";
import { assertUserId, withUserContext } from "./user-context";

/**
 * Persistence for billing: who pays, what that opens, and what it earns.
 *
 * THE SHAPE OF EVERY WRITE HERE. A Stripe webhook arrives with no session and no
 * user context, so each entry point does the same two steps in the same order:
 * resolve the Stripe customer to an internal user id through `billing_customers`
 * — the one table that has no row level security, precisely because it is the
 * lookup that precedes having an identity — and then perform every subsequent
 * write inside `withUserContext(userId)`. Nothing in this file writes an owned
 * row outside a bound context, so the policies of migration 0009 still hold for
 * traffic that never presented a cookie.
 *
 * SEEDED MODE. With no database, billing is off: `hasEntitlement` is never
 * reached, because `apps/web/lib/billing/entitlements.ts` short-circuits when
 * the billing feature is disabled. The functions here throw rather than pretend,
 * so a misconfiguration surfaces as an error instead of as a silent free pass.
 */

export class BillingUnavailableError extends Error {
  constructor(operation: string) {
    super(`${operation} requires FINANCE_HUB_USE_DATABASE=true and DATABASE_URL.`);
    this.name = "BillingUnavailableError";
  }
}

function assertDatabase(operation: string): void {
  if (!canUseDatabase()) {
    throw new BillingUnavailableError(operation);
  }
}

// --- Reading entitlements ---------------------------------------------------

/**
 * The postgres-js driver hands timestamps back in PostgreSQL's own format
 * (`2027-07-28 00:00:00+00`), not as ISO. Normalising at the boundary is the
 * same rule `mastery-repository.ts` follows, and here it is load-bearing twice
 * over: `isEntitlementActive` compares an expiry against `Date.now()`, and the
 * billing pages format these strings for display. A representation that varies
 * with the driver would make both depend on it.
 */
function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function toOptionalIsoTimestamp(value: string | null): string | null {
  return value === null ? null : toIsoTimestamp(value);
}

function toEntitlementRecord(row: {
  feature: string;
  status: string;
  source: string;
  planKey: string | null;
  stripeSubscriptionId: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}): EntitlementRecord | null {
  // A feature name no longer known to the code gates nothing. Dropping it here
  // rather than casting keeps `EntitlementFeature` honest at the boundary.
  if (!isEntitlementFeature(row.feature)) {
    return null;
  }

  return {
    feature: row.feature,
    status: row.status as EntitlementStatus,
    source: row.source as EntitlementSource,
    planKey: row.planKey,
    stripeSubscriptionId: row.stripeSubscriptionId,
    grantedAt: toIsoTimestamp(row.grantedAt),
    expiresAt: toOptionalIsoTimestamp(row.expiresAt),
    revokedAt: toOptionalIsoTimestamp(row.revokedAt)
  };
}

export async function getEntitlements(userId: string): Promise<EntitlementRecord[]> {
  assertDatabase("getEntitlements");
  assertUserId(userId, "getEntitlements");

  const rows = await withUserContext(userId, (db) =>
    db
      .select({
        feature: entitlementsTable.feature,
        status: entitlementsTable.status,
        source: entitlementsTable.source,
        planKey: entitlementsTable.planKey,
        stripeSubscriptionId: entitlementsTable.stripeSubscriptionId,
        grantedAt: entitlementsTable.grantedAt,
        expiresAt: entitlementsTable.expiresAt,
        revokedAt: entitlementsTable.revokedAt
      })
      .from(entitlementsTable)
      .where(eq(entitlementsTable.userId, userId))
  );

  return rows
    .map(toEntitlementRecord)
    .filter((record): record is EntitlementRecord => record !== null);
}

/**
 * The gate. One row, active, and not expired.
 *
 * The expiry check is done here rather than in SQL so the rule lives in one
 * place — `isEntitlementActive` in `@finance/domain` — and is unit-testable
 * without a database. The row set is a single learner's handful of features, so
 * there is nothing to gain from filtering it server-side.
 */
export async function hasEntitlement(
  userId: string,
  feature: EntitlementFeature,
  now: Date = new Date()
): Promise<boolean> {
  const records = await getEntitlements(userId);
  const record = records.find((item) => item.feature === feature);

  return record ? isEntitlementActive(record, now) : false;
}

export interface SubscriptionSummary {
  stripeSubscriptionId: string;
  status: string;
  planKey: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
}

export async function getSubscriptions(userId: string): Promise<SubscriptionSummary[]> {
  assertDatabase("getSubscriptions");
  assertUserId(userId, "getSubscriptions");

  const rows = await withUserContext(userId, (db) =>
    db
      .select({
        stripeSubscriptionId: subscriptionsTable.stripeSubscriptionId,
        status: subscriptionsTable.status,
        planKey: subscriptionsTable.planKey,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptionsTable.cancelAtPeriodEnd,
        updatedAt: subscriptionsTable.updatedAt
      })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId))
      .orderBy(desc(subscriptionsTable.updatedAt))
  );

  return rows.map((row) => ({
    ...row,
    currentPeriodEnd: toOptionalIsoTimestamp(row.currentPeriodEnd),
    updatedAt: toIsoTimestamp(row.updatedAt)
  }));
}

// --- Stripe customer ↔ learner ----------------------------------------------

/**
 * Resolves a Stripe customer id to an internal user id.
 *
 * Runs outside `withUserContext` on purpose: this is the lookup that decides
 * *which* context the rest of the webhook will bind. `billing_customers` carries
 * no policy for exactly this reason (migration 0009 explains the trade-off),
 * and the selected column is a user id, never learner content.
 */
export async function findUserByStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  assertDatabase("findUserByStripeCustomer");

  const rows = await createDb()
    .select({ userId: billingCustomersTable.userId })
    .from(billingCustomersTable)
    .where(eq(billingCustomersTable.stripeCustomerId, stripeCustomerId))
    .limit(1);

  return rows[0]?.userId ?? null;
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  assertDatabase("getStripeCustomerId");
  assertUserId(userId, "getStripeCustomerId");

  const rows = await createDb()
    .select({ stripeCustomerId: billingCustomersTable.stripeCustomerId })
    .from(billingCustomersTable)
    .where(eq(billingCustomersTable.userId, userId))
    .limit(1);

  return rows[0]?.stripeCustomerId ?? null;
}

/**
 * Records the mapping, ignoring a repeat of one that already exists.
 *
 * Two `ON CONFLICT` targets are needed because the table has two unique keys and
 * a conflict on either means "already linked". A *disagreeing* pair — the same
 * user pointing at a different customer — is left to fail loudly rather than be
 * overwritten: silently re-pointing an account at another Stripe customer is how
 * one learner ends up paying for another's access.
 */
export async function linkStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  assertDatabase("linkStripeCustomer");
  assertUserId(userId, "linkStripeCustomer");

  await createDb()
    .insert(billingCustomersTable)
    .values({ userId, stripeCustomerId })
    .onConflictDoNothing();
}

// --- Webhook ledger ---------------------------------------------------------

export const BILLING_EVENT_OUTCOMES = [
  "received",
  "granted",
  "revoked",
  "ignored",
  "unresolved"
] as const;

export type BillingEventOutcome = (typeof BILLING_EVENT_OUTCOMES)[number];

/**
 * Claims an event id, returning false when it was already claimed.
 *
 * The claim happens before any work, so two concurrent deliveries of the same
 * event cannot both apply it. If the work then throws, the caller releases the
 * claim so Stripe's retry can try again — see {@link releaseBillingEvent}.
 */
export async function claimBillingEvent(stripeEventId: string, type: string): Promise<boolean> {
  assertDatabase("claimBillingEvent");

  const inserted = await createDb()
    .insert(billingEventsTable)
    .values({ stripeEventId, type, outcome: "received" })
    .onConflictDoNothing()
    .returning({ stripeEventId: billingEventsTable.stripeEventId });

  return inserted.length > 0;
}

export async function settleBillingEvent(
  stripeEventId: string,
  outcome: BillingEventOutcome,
  detail: string
): Promise<void> {
  assertDatabase("settleBillingEvent");

  await createDb()
    .update(billingEventsTable)
    .set({ outcome, detail, processedAt: sql`now()` })
    .where(eq(billingEventsTable.stripeEventId, stripeEventId));
}

/** Undoes a claim so a Stripe retry is not swallowed as a duplicate. */
export async function releaseBillingEvent(stripeEventId: string): Promise<void> {
  assertDatabase("releaseBillingEvent");

  await createDb().delete(billingEventsTable).where(eq(billingEventsTable.stripeEventId, stripeEventId));
}

// --- Applying an intent -----------------------------------------------------

export interface ApplyBillingIntentResult {
  outcome: BillingEventOutcome;
  userId: string | null;
  features: EntitlementFeature[];
}

/**
 * Turns a {@link BillingIntent} into rows. The whole activation/revocation path
 * for verified Stripe events runs through this one function.
 */
export async function applyBillingIntent(intent: BillingIntent): Promise<ApplyBillingIntentResult> {
  assertDatabase("applyBillingIntent");

  if (intent.effect === "none") {
    return { outcome: "ignored", userId: intent.userId, features: [] };
  }

  const userId =
    intent.userId ??
    (intent.stripeCustomerId ? await findUserByStripeCustomer(intent.stripeCustomerId) : null);

  if (!userId) {
    // A subscription this deployment never created — made in the Stripe
    // dashboard, or belonging to another environment sharing the account. There
    // is nobody to grant it to and retrying will not invent one, so it is
    // recorded and acknowledged rather than left to Stripe's retry schedule.
    return { outcome: "unresolved", userId: null, features: [] };
  }

  if (intent.stripeCustomerId) {
    await linkStripeCustomer(userId, intent.stripeCustomerId);
  }

  return withUserContext(userId, async (db) => {
    if (intent.subscription) {
      const draft = intent.subscription;

      await db
        .insert(subscriptionsTable)
        .values({
          userId,
          stripeSubscriptionId: draft.stripeSubscriptionId,
          stripeCustomerId: draft.stripeCustomerId,
          status: draft.status,
          planKey: draft.planKey,
          priceId: draft.priceId,
          currentPeriodEnd: draft.currentPeriodEnd,
          cancelAtPeriodEnd: draft.cancelAtPeriodEnd
        })
        .onConflictDoUpdate({
          target: subscriptionsTable.stripeSubscriptionId,
          set: {
            // `subscriptions.status` is NOT NULL, so this coalesce always keeps
            // the stored value — which is exactly what a provisional status
            // means: the checkout event may create the row, never re-describe
            // one Stripe has already described.
            status: draft.statusIsProvisional
              ? sql`coalesce(${subscriptionsTable.status}, ${draft.status})`
              : draft.status,
            stripeCustomerId: draft.stripeCustomerId,
            planKey: draft.planKey,
            // `checkout.session.completed` knows the plan but not the price, and
            // arrives in either order relative to the subscription event. COALESCE
            // keeps whichever value is known instead of blanking it.
            priceId: sql`coalesce(${draft.priceId}, ${subscriptionsTable.priceId})`,
            currentPeriodEnd: sql`coalesce(${draft.currentPeriodEnd}::timestamptz, ${subscriptionsTable.currentPeriodEnd})`,
            cancelAtPeriodEnd: draft.cancelAtPeriodEnd,
            updatedAt: sql`now()`
          }
        });
    }

    if (intent.effect === "revoke") {
      const revoked = await revokeEntitlements(db, userId, intent.subscription?.stripeSubscriptionId ?? null);

      return { outcome: "revoked" as const, userId, features: revoked };
    }

    for (const feature of intent.features) {
      await db
        .insert(entitlementsTable)
        .values({
          userId,
          feature,
          status: "active",
          source: "subscription",
          planKey: intent.subscription?.planKey ?? null,
          stripeSubscriptionId: intent.subscription?.stripeSubscriptionId ?? null,
          expiresAt: intent.expiresAt,
          revokedAt: null
        })
        .onConflictDoUpdate({
          target: [entitlementsTable.userId, entitlementsTable.feature],
          set: {
            status: "active",
            source: "subscription",
            planKey: sql`coalesce(${intent.subscription?.planKey ?? null}, ${entitlementsTable.planKey})`,
            stripeSubscriptionId: sql`coalesce(${
              intent.subscription?.stripeSubscriptionId ?? null
            }, ${entitlementsTable.stripeSubscriptionId})`,
            // A NULL expiry means "until revoked", which is what the provisional
            // grant made at checkout carries. Stripe does not order its events,
            // so that provisional grant can land *after* the dated one from the
            // subscription — and overwriting a real end date with "forever" is
            // the one way this table could hand out access nobody paid for.
            // A dated expiry always wins over an undated one; between two dates,
            // the newer event wins, so a downgrade still shortens access.
            expiresAt: sql`coalesce(${intent.expiresAt}::timestamptz, ${entitlementsTable.expiresAt})`,
            revokedAt: null,
            updatedAt: sql`now()`
          }
        });
    }

    return { outcome: "granted" as const, userId, features: intent.features };
  });
}

type BoundDb = Parameters<Parameters<typeof withUserContext<unknown>>[1]>[0];

/**
 * Revokes every entitlement tied to a subscription, or all of the learner's
 * subscription-sourced entitlements when the event named none.
 *
 * Revoking by subscription rather than by feature list is deliberate: the plan
 * that granted a feature may since have been retired from `BILLING_PLANS`, and a
 * revocation that could only name features it still recognises would leave the
 * forgotten ones active forever. Manual grants (`source = 'manual'`) are never
 * touched — they exist precisely because they do not depend on Stripe.
 */
async function revokeEntitlements(
  db: BoundDb,
  userId: string,
  stripeSubscriptionId: string | null
): Promise<EntitlementFeature[]> {
  const scope = stripeSubscriptionId
    ? and(
        eq(entitlementsTable.userId, userId),
        eq(entitlementsTable.source, "subscription"),
        eq(entitlementsTable.stripeSubscriptionId, stripeSubscriptionId)
      )
    : and(eq(entitlementsTable.userId, userId), eq(entitlementsTable.source, "subscription"));

  const revoked = await db
    .update(entitlementsTable)
    .set({ status: "revoked", revokedAt: sql`now()`, updatedAt: sql`now()` })
    .where(scope)
    .returning({ feature: entitlementsTable.feature });

  return revoked
    .map((row) => row.feature)
    .filter((feature): feature is EntitlementFeature => isEntitlementFeature(feature));
}

// --- Certificates -----------------------------------------------------------

export interface IssueCertificateInput {
  userId: string;
  holderEmail: string;
  trackId: string;
  trackLabel: string;
  curriculumVersionId: string;
  levels: ModuleLevelDefinition[];
  snapshots: LevelSnapshot[];
}

export type IssueCertificateResult =
  | { status: "issued" | "existing"; certificate: CertificateRecord }
  | { status: "refused"; eligibility: CertificateEligibility };

function toCertificateRecord(row: {
  serial: string;
  trackId: string;
  trackLabel: string;
  holderEmail: string;
  curriculumVersionId: string;
  levelCount: number;
  averageScore: number;
  issuedAt: string;
  revokedAt: string | null;
}): CertificateRecord {
  return {
    ...row,
    issuedAt: toIsoTimestamp(row.issuedAt),
    revokedAt: toOptionalIsoTimestamp(row.revokedAt)
  };
}

const CERTIFICATE_COLUMNS = {
  serial: certificatesTable.serial,
  trackId: certificatesTable.trackId,
  trackLabel: certificatesTable.trackLabel,
  holderEmail: certificatesTable.holderEmail,
  curriculumVersionId: certificatesTable.curriculumVersionId,
  levelCount: certificatesTable.levelCount,
  averageScore: certificatesTable.averageScore,
  issuedAt: certificatesTable.issuedAt,
  revokedAt: certificatesTable.revokedAt
};

/**
 * Issues the attestation for a finished track, once.
 *
 * Both conditions are re-checked here against stored rows — the completion from
 * the mastery snapshots, the entitlement from `entitlements` — because this is
 * the boundary a route calls, and a route's caller is a browser.
 */
export async function issueCertificate(input: IssueCertificateInput): Promise<IssueCertificateResult> {
  assertDatabase("issueCertificate");
  assertUserId(input.userId, "issueCertificate");

  const existing = await getCertificateForTrack(input.userId, input.trackId);

  if (existing) {
    return { status: "existing", certificate: existing };
  }

  const entitled = await hasEntitlement(input.userId, "completion-certificate");
  const eligibility = evaluateCertificateEligibility({
    levels: input.levels,
    snapshots: input.snapshots,
    entitled
  });

  if (!eligibility.eligible) {
    return { status: "refused", eligibility };
  }

  const serial = formatCertificateSerial(new Date().getUTCFullYear(), randomBytes(5).toString("hex"));

  const inserted = await withUserContext(input.userId, (db) =>
    db
      .insert(certificatesTable)
      .values({
        userId: input.userId,
        serial,
        trackId: input.trackId,
        trackLabel: input.trackLabel,
        holderEmail: input.holderEmail,
        curriculumVersionId: input.curriculumVersionId,
        levelCount: eligibility.totalLevels,
        averageScore: eligibility.averageScore
      })
      // The unique index on (user_id, track_id) is the real guard against a
      // double click racing itself; this turns the collision into "you already
      // have one" rather than a 500.
      .onConflictDoNothing()
      .returning(CERTIFICATE_COLUMNS)
  );

  if (inserted.length === 0) {
    const raced = await getCertificateForTrack(input.userId, input.trackId);

    return raced
      ? { status: "existing", certificate: raced }
      : { status: "refused", eligibility };
  }

  return { status: "issued", certificate: toCertificateRecord(inserted[0]!) };
}

export async function getCertificateForTrack(
  userId: string,
  trackId: string
): Promise<CertificateRecord | null> {
  assertDatabase("getCertificateForTrack");
  assertUserId(userId, "getCertificateForTrack");

  const rows = await withUserContext(userId, (db) =>
    db
      .select(CERTIFICATE_COLUMNS)
      .from(certificatesTable)
      .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.trackId, trackId)))
      .limit(1)
  );

  return rows[0] ? toCertificateRecord(rows[0]) : null;
}

export async function getCertificates(userId: string): Promise<CertificateRecord[]> {
  assertDatabase("getCertificates");
  assertUserId(userId, "getCertificates");

  const rows = await withUserContext(userId, (db) =>
    db
      .select(CERTIFICATE_COLUMNS)
      .from(certificatesTable)
      .where(eq(certificatesTable.userId, userId))
      .orderBy(desc(certificatesTable.issuedAt))
  );

  return rows.map(toCertificateRecord);
}

/**
 * Reads one attestation by serial, scoped to its owner.
 *
 * The `userId` argument is not redundant with row level security, it is the
 * reason the serial can stay short: a certificate is only ever displayed to the
 * account that holds it, so the serial identifies a document rather than
 * authenticating access to one.
 */
export async function getCertificateBySerial(
  userId: string,
  serial: string
): Promise<CertificateRecord | null> {
  assertDatabase("getCertificateBySerial");
  assertUserId(userId, "getCertificateBySerial");

  const rows = await withUserContext(userId, (db) =>
    db
      .select(CERTIFICATE_COLUMNS)
      .from(certificatesTable)
      .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.serial, serial)))
      .limit(1)
  );

  return rows[0] ? toCertificateRecord(rows[0]) : null;
}
