import { describe, expect, it } from "vitest";
import { getConfiguredPlan, getConfiguredPlans, resolvePlanKeyForPrice, toPublicPlans } from "@/lib/billing/plans";
import { EnvValidationError, parseEnv } from "@/lib/env";
import { isBillingActive, resolveFeatures } from "@/lib/features";

/**
 * The configuration side of billing: what has to be set before a price can be
 * charged, and what may leave the server once it is.
 */

const DB_URL = "postgresql://finance:pw@localhost:5432/finance_hub";

const BILLING_ENV = {
  FINANCE_HUB_BILLING_ENABLED: "true",
  LEARNING_HUB_AUTH_ENABLED: "true",
  FINANCE_HUB_USE_DATABASE: "true",
  DATABASE_URL: DB_URL,
  STRIPE_SECRET_KEY: "sk_test_51ABCDEF",
  STRIPE_WEBHOOK_SECRET: "whsec_test_ABCDEF",
  STRIPE_PRICE_FOUNDER_ANNUAL: "price_founder_annual_test"
} as const;

function issuesOf(source: Record<string, string | undefined>): string {
  try {
    parseEnv(source);
    return "";
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as EnvValidationError).issues.join("\n");
  }
}

describe("stripe environment contract", () => {
  it("leaves billing off, and every module open, with no configuration at all", () => {
    const features = resolveFeatures(parseEnv({}));

    expect(features.billing.enabled).toBe(false);
    expect(features.billing.reason).toContain("FINANCE_HUB_BILLING_ENABLED");
  });

  it("accepts a complete configuration", () => {
    const env = parseEnv({ ...BILLING_ENV });

    expect(isBillingActive(env)).toBe(true);
    expect(resolveFeatures(env).billing.enabled).toBe(true);
  });

  it("refuses billing without accounts, since an entitlement belongs to somebody", () => {
    const issues = issuesOf({ ...BILLING_ENV, LEARNING_HUB_AUTH_ENABLED: "false" });

    expect(issues).toContain("LEARNING_HUB_AUTH_ENABLED");
  });

  it("refuses billing without a key or a webhook secret", () => {
    expect(issuesOf({ ...BILLING_ENV, STRIPE_SECRET_KEY: undefined })).toContain("STRIPE_SECRET_KEY");
    expect(issuesOf({ ...BILLING_ENV, STRIPE_WEBHOOK_SECRET: undefined })).toContain(
      "STRIPE_WEBHOOK_SECRET"
    );
  });

  it("refuses billing with nothing to sell", () => {
    const issues = issuesOf({ ...BILLING_ENV, STRIPE_PRICE_FOUNDER_ANNUAL: undefined });

    expect(issues).toContain("at least one price id");
  });

  it("refuses a publishable key in the secret slot", () => {
    // The mistake that would put a secret-shaped variable in a public one, or
    // leave the server unable to authenticate at all.
    expect(issuesOf({ ...BILLING_ENV, STRIPE_SECRET_KEY: "pk_test_51ABCDEF" })).toContain(
      "STRIPE_SECRET_KEY"
    );
    expect(
      issuesOf({ ...BILLING_ENV, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "sk_test_51ABCDEF" })
    ).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  });

  it("refuses a webhook secret that is not a signing secret", () => {
    expect(issuesOf({ ...BILLING_ENV, STRIPE_WEBHOOK_SECRET: "sk_test_51ABCDEF" })).toContain(
      "STRIPE_WEBHOOK_SECRET"
    );
  });

  it("refuses a live key outside production", () => {
    const issues = issuesOf({ ...BILLING_ENV, STRIPE_SECRET_KEY: "sk_live_51ABCDEF" });

    expect(issues).toContain("live Stripe key");
  });

  it("allows a live key on a production deployment", () => {
    const env = parseEnv({
      ...BILLING_ENV,
      STRIPE_SECRET_KEY: "sk_live_51ABCDEF",
      VERCEL_ENV: "production"
    });

    expect(isBillingActive(env)).toBe(true);
  });

  it("stays inactive when the flag is on but the database is not", () => {
    // `parseEnv` cannot reach this state — auth already requires the database —
    // but `isBillingActive` is the predicate every gate reads, and it must not
    // answer "on" for a configuration that could not record a grant.
    const env = { ...parseEnv({}), FINANCE_HUB_BILLING_ENABLED: true } as ReturnType<typeof parseEnv>;

    expect(isBillingActive(env)).toBe(false);
  });
});

describe("price resolution", () => {
  const env = parseEnv({ ...BILLING_ENV, STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly_test" });

  it("lists only the plans that have a configured price", () => {
    const onlyAnnual = getConfiguredPlans(parseEnv({ ...BILLING_ENV }));

    expect(onlyAnnual.map((entry) => entry.plan.key)).toEqual(["founder-annual"]);
    expect(getConfiguredPlans(env).map((entry) => entry.plan.key)).toEqual([
      "founder-annual",
      "pro-monthly"
    ]);
  });

  it("returns nothing for a plan whose price is unset", () => {
    expect(getConfiguredPlan("pro-monthly", parseEnv({ ...BILLING_ENV }))).toBeNull();
  });

  it("maps a price back to its plan, and an unknown price to nothing", () => {
    expect(resolvePlanKeyForPrice("price_pro_monthly_test", env)).toBe("pro-monthly");
    expect(resolvePlanKeyForPrice("price_someone_elses", env)).toBeNull();
    expect(resolvePlanKeyForPrice(null, env)).toBeNull();
  });

  it("strips price ids from what the pricing panel receives", () => {
    // The panel is rendered by a client component; a price id in this payload
    // would ship to the browser.
    const publicPlans = toPublicPlans(getConfiguredPlans(env));

    expect(JSON.stringify(publicPlans)).not.toContain("price_");
    expect(publicPlans.map((plan) => plan.key)).toEqual(["founder-annual", "pro-monthly"]);
  });
});
