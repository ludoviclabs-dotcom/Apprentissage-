import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Only `NEXT_PUBLIC_*` values may be read from client components. Everything else
 * in this module is server-only: importing it from a client component would leak
 * secrets into the bundle.
 *
 * The parser is deliberately permissive about *missing* configuration (the app
 * runs on seeded data with no `.env` at all) and strict about *contradictory*
 * configuration, which is what silently degrades the product today: asking for
 * database mode without a `DATABASE_URL` used to fall back to seeds without ever
 * telling anyone.
 */

const TRUTHY = ["true", "false"] as const;

function booleanFlag(defaultValue: "true" | "false" = "false") {
  return z
    .enum(TRUTHY, {
      message: 'expected the string "true" or "false"'
    })
    .default(defaultValue)
    .transform((value) => value === "true");
}

function optionalUrl(label: string) {
  return z
    .string()
    .min(1)
    .refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: `${label} must be an absolute URL` }
    )
    .optional();
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Set by Vercel. Absent locally. */
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_URL: z.string().min(1).optional(),

    NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Finance Learning Hub"),
    NEXT_PUBLIC_APP_URL: optionalUrl("NEXT_PUBLIC_APP_URL"),

    DATABASE_URL: z.string().min(1).optional(),
    FINANCE_HUB_USE_DATABASE: booleanFlag(),
    FINANCE_HUB_PUBLIC_DEMO: booleanFlag(),

    // Turns on account-based authentication. Since PR-01 this means real user
    // accounts in PostgreSQL, not the single shared HTTP basic credential.
    LEARNING_HUB_AUTH_ENABLED: booleanFlag(),
    // Comma-separated e-mails allowed to see the document administration area
    // (Documents, Source packs) when accounts are enabled. Absent, every
    // account of the private install administers — the pre-PR-09 behavior.
    LEARNING_HUB_ADMIN_EMAILS: z.string().min(1).optional(),
    // Turns on the private content review area (/admin/content-review). Off by
    // default, and refused outright in production unless accounts are on: the
    // area shows the text of private course material, so an unauthenticated
    // production deployment must not be able to open it by mistake.
    CONTENT_REVIEW_ENABLED: booleanFlag(),

    // Retired in PR-01. Kept in the schema only so a stale `.env` fails loudly
    // instead of quietly losing its protection: someone who still sets these
    // would otherwise believe the app is gated when it is not.
    LEARNING_HUB_AUTH_USER: z.string().min(1).optional(),
    LEARNING_HUB_AUTH_PASSWORD: z.string().min(1).optional(),

    // Only providers actually implemented in `packages/ai` are accepted, so an
    // unimplemented choice fails loudly instead of silently disabling the tutor.
    AI_PROVIDER: z.enum(["none", "openai", "ollama"]).default("none"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
    OLLAMA_BASE_URL: optionalUrl("OLLAMA_BASE_URL"),
    OLLAMA_MODEL: z.string().min(1).default("llama3.1"),

    // --- Stripe billing (PR-07) ---------------------------------------------
    //
    // The flag is the rollback lever: turning it off closes checkout and stops
    // gating premium modules, without removing a single stored entitlement.
    // Only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is allowed near a browser; the
    // secret key, the webhook secret and every price id are server-only, which
    // is what stops a client choosing what it pays.
    FINANCE_HUB_BILLING_ENABLED: booleanFlag(),
    STRIPE_SECRET_KEY: z
      .string()
      .min(1)
      .refine((value) => value.startsWith("sk_") || value.startsWith("rk_"), {
        message: "must be a secret (sk_…) or restricted (rk_…) key, never a publishable pk_ key"
      })
      .optional(),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .min(1)
      .refine((value) => value.startsWith("whsec_"), {
        message: "must be the whsec_… signing secret shown by `stripe listen` or the endpoint page"
      })
      .optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
      .string()
      .min(1)
      .refine((value) => value.startsWith("pk_"), {
        message: "must be a publishable pk_ key — a secret key here would ship to the browser"
      })
      .optional(),
    STRIPE_PRICE_FOUNDER_ANNUAL: z.string().min(1).optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.FINANCE_HUB_USE_DATABASE && !value.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "FINANCE_HUB_USE_DATABASE=true requires DATABASE_URL"
      });
    }

    // Accounts and sessions are rows in PostgreSQL, so auth cannot work in
    // seeded mode. Failing here beats an app that shows a login form and then
    // cannot store the account.
    if (value.LEARNING_HUB_AUTH_ENABLED && !value.FINANCE_HUB_USE_DATABASE) {
      ctx.addIssue({
        code: "custom",
        path: ["FINANCE_HUB_USE_DATABASE"],
        message:
          "LEARNING_HUB_AUTH_ENABLED=true requires FINANCE_HUB_USE_DATABASE=true — accounts and sessions are stored in PostgreSQL"
      });
    }

    // The review area displays the extracted text of private course material.
    // In production, "who is looking" must be answerable, and without accounts
    // it is not: refuse to boot rather than serve private sources to anyone who
    // guesses the URL.
    if (
      value.CONTENT_REVIEW_ENABLED &&
      value.VERCEL_ENV === "production" &&
      !value.LEARNING_HUB_AUTH_ENABLED
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["LEARNING_HUB_AUTH_ENABLED"],
        message:
          "CONTENT_REVIEW_ENABLED=true in production requires LEARNING_HUB_AUTH_ENABLED=true — the review area shows private source material and must know who is reading"
      });
    }

    for (const retired of ["LEARNING_HUB_AUTH_USER", "LEARNING_HUB_AUTH_PASSWORD"] as const) {
      if (value[retired]) {
        ctx.addIssue({
          code: "custom",
          path: [retired],
          message: `${retired} was retired in PR-01: HTTP basic auth is replaced by user accounts. Remove it from your .env`
        });
      }
    }

    if (value.AI_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "AI_PROVIDER=openai requires OPENAI_API_KEY"
      });
    }

    if (value.FINANCE_HUB_BILLING_ENABLED) {
      // Entitlements, subscriptions and certificates are owned rows. Selling
      // access with nowhere to record who bought it would take the money and
      // grant nothing, so this is a boot failure rather than a runtime surprise.
      if (!value.LEARNING_HUB_AUTH_ENABLED) {
        ctx.addIssue({
          code: "custom",
          path: ["LEARNING_HUB_AUTH_ENABLED"],
          message:
            "FINANCE_HUB_BILLING_ENABLED=true requires LEARNING_HUB_AUTH_ENABLED=true — an entitlement belongs to an account"
        });
      }

      for (const required of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
        if (!value[required]) {
          ctx.addIssue({
            code: "custom",
            path: [required],
            message: `FINANCE_HUB_BILLING_ENABLED=true requires ${required}`
          });
        }
      }

      // Without a price there is nothing to sell, and a checkout button that
      // 500s on click is worse than one that was never rendered.
      if (!value.STRIPE_PRICE_FOUNDER_ANNUAL && !value.STRIPE_PRICE_PRO_MONTHLY) {
        ctx.addIssue({
          code: "custom",
          path: ["STRIPE_PRICE_FOUNDER_ANNUAL"],
          message:
            "FINANCE_HUB_BILLING_ENABLED=true requires at least one price id (STRIPE_PRICE_FOUNDER_ANNUAL or STRIPE_PRICE_PRO_MONTHLY)"
        });
      }

      // Test keys against a live webhook secret, or the reverse, silently drops
      // every event: the signature never matches and no entitlement is ever
      // granted. Catching the mismatch here beats debugging it from Stripe's
      // delivery log.
      const liveKey = value.STRIPE_SECRET_KEY?.includes("_live_");
      const liveDeployment = value.VERCEL_ENV === "production";

      if (liveKey && !liveDeployment && value.NODE_ENV !== "production") {
        ctx.addIssue({
          code: "custom",
          path: ["STRIPE_SECRET_KEY"],
          message:
            "a live Stripe key is configured outside production — use a test key (sk_test_…) for local and preview work"
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** `FOO=` in a `.env` file yields `""`, which should mean "not configured". */
function withoutEmptyStrings(source: Record<string, string | undefined>) {
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim() !== "") {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Pure parser, exported for tests. Throws {@link EnvValidationError} listing every
 * problem at once rather than failing on the first one.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(withoutEmptyStrings(source));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join(".") || "env";
      return `${key}: ${issue.message}`;
    });

    throw new EnvValidationError(issues);
  }

  return result.data;
}

/** Canonical app URL, used for absolute links and redirects. */
export function resolveAppUrl(env: Env): string {
  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

let cached: Env | undefined;

/** Memoized parse of `process.env`. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test-only: drop the memoized value so a new `process.env` is re-read. */
export function resetEnvCache() {
  cached = undefined;
}
