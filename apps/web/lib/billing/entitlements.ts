import "server-only";
import { hasEntitlement } from "@finance/db";
import type { EntitlementFeature } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";

/**
 * The one question every premium gate asks: may this request open this feature?
 *
 * THE DEFAULT IS OPEN, NOT CLOSED. When billing is not configured — the default
 * for a private local-first install, and what the public demo runs — every
 * feature is unlocked. A paywall that engages before anyone set a price would
 * lock the owner of the machine out of their own lab, which is the opposite of
 * what this product is. The gate exists exactly where billing exists.
 *
 * Once billing *is* on, the answer comes from `entitlements`, which only a
 * verified Stripe webhook writes. There is no path from a browser to a grant:
 * the success page reads this state, it never produces it.
 */

export type EntitlementDecision =
  | { allowed: true; reason: "billing-disabled" | "entitled" }
  | { allowed: false; reason: "anonymous" | "not-entitled"; feature: EntitlementFeature };

export async function resolveEntitlement(
  feature: EntitlementFeature
): Promise<EntitlementDecision> {
  if (!getFeatures().billing.enabled) {
    return { allowed: true, reason: "billing-disabled" };
  }

  const user = await getCurrentUser();

  if (!user) {
    return { allowed: false, reason: "anonymous", feature };
  }

  return (await hasEntitlement(user.id, feature))
    ? { allowed: true, reason: "entitled" }
    : { allowed: false, reason: "not-entitled", feature };
}

/** French, shown on the paywall panel and returned by gated API routes. */
export function entitlementRefusalMessage(decision: {
  reason: "anonymous" | "not-entitled";
}): string {
  return decision.reason === "anonymous"
    ? "Connecte-toi pour accéder à ce module premium."
    : "Ce module fait partie de l'offre premium. Un abonnement actif est nécessaire pour l'ouvrir.";
}

/**
 * Guard for route handlers. Returns a ready-to-return response when access is
 * refused, and nothing when it is granted — the same never-both-never-neither
 * shape as `resolveWriteUser` in `lib/auth/current-user.ts`.
 *
 * 402 rather than 403: the request is well-formed and the caller is who they
 * say they are; what is missing is a payment. A client that gets a 402 knows to
 * send the learner to `/billing` rather than to the login page.
 */
export async function guardEntitlement(
  feature: EntitlementFeature
): Promise<{ response?: Response }> {
  const decision = await resolveEntitlement(feature);

  if (decision.allowed) {
    return {};
  }

  return {
    response: Response.json(
      {
        error: decision.reason === "anonymous" ? "Session requise" : "Abonnement requis",
        details: entitlementRefusalMessage(decision),
        feature,
        checkoutUrl: "/billing"
      },
      { status: decision.reason === "anonymous" ? 401 : 402 }
    )
  };
}
