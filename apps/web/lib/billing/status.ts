import "server-only";
import {
  getCertificates,
  getEntitlements,
  getSubscriptions,
  type SubscriptionSummary
} from "@finance/db";
import {
  ENTITLEMENT_FEATURES,
  isEntitlementActive,
  type CertificateRecord,
  type EntitlementFeature,
  type EntitlementRecord
} from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getConfiguredPlans, toPublicPlans, type PublicPlan } from "@/lib/billing/plans";
import { getFeatures } from "@/lib/features";

/**
 * Everything the billing pages render, read from the database in one place.
 *
 * The success page is the reason this exists in this shape. It must be able to
 * say "your access is open" or "we have not heard from Stripe yet" — and both of
 * those are statements about *our* rows, written by the verified webhook. The
 * page never inspects the `session_id` in its own URL to decide anything.
 */

export interface BillingStatus {
  /** False in the default local-first install: nothing is gated. */
  billingEnabled: boolean;
  /** Present only when billing is off, and quoting the reason. */
  disabledReason?: string;
  signedIn: boolean;
  plans: PublicPlan[];
  entitlements: Array<{ feature: EntitlementFeature; active: boolean; expiresAt: string | null }>;
  activeFeatures: EntitlementFeature[];
  subscriptions: SubscriptionSummary[];
  certificates: CertificateRecord[];
}

function projectEntitlements(records: EntitlementRecord[], now: Date) {
  const byFeature = new Map(records.map((record) => [record.feature, record]));

  // Every known feature is listed, including ones nobody granted, so the account
  // page shows what is *not* unlocked instead of an empty panel that reads the
  // same as "billing is broken".
  return ENTITLEMENT_FEATURES.map((feature) => {
    const record = byFeature.get(feature);

    return {
      feature,
      active: record ? isEntitlementActive(record, now) : false,
      expiresAt: record?.expiresAt ?? null
    };
  });
}

export async function getBillingStatus(now: Date = new Date()): Promise<BillingStatus> {
  const features = getFeatures();
  const plans = features.billing.enabled ? toPublicPlans(getConfiguredPlans()) : [];

  if (!features.billing.enabled) {
    return {
      billingEnabled: false,
      disabledReason: features.billing.publicMessage,
      signedIn: false,
      plans,
      entitlements: [],
      activeFeatures: [...ENTITLEMENT_FEATURES],
      subscriptions: [],
      certificates: []
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      billingEnabled: true,
      signedIn: false,
      plans,
      entitlements: projectEntitlements([], now),
      activeFeatures: [],
      subscriptions: [],
      certificates: []
    };
  }

  const [records, subscriptions, certificates] = await Promise.all([
    getEntitlements(user.id),
    getSubscriptions(user.id),
    getCertificates(user.id)
  ]);

  const entitlements = projectEntitlements(records, now);

  return {
    billingEnabled: true,
    signedIn: true,
    plans,
    entitlements,
    activeFeatures: entitlements.filter((item) => item.active).map((item) => item.feature),
    subscriptions,
    certificates
  };
}

/** French, for the subscription line on the account and billing pages. */
export function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "actif";
    case "trialing":
      return "période d'essai";
    case "past_due":
      return "paiement en retard";
    case "unpaid":
      return "impayé";
    case "paused":
      return "en pause";
    case "canceled":
      return "résilié";
    case "incomplete":
      return "en attente de confirmation";
    case "incomplete_expired":
      return "abandonné";
    default:
      // A status this build has never seen is shown verbatim rather than
      // flattened into a familiar one that would misdescribe it.
      return status;
  }
}

export function entitlementFeatureLabel(feature: EntitlementFeature): string {
  switch (feature) {
    case "excel-finance-lab":
      return "Excel Finance Lab";
    case "completion-certificate":
      return "Attestation de complétion";
  }
}
