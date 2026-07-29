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

    LEARNING_HUB_AUTH_ENABLED: booleanFlag(),
    LEARNING_HUB_AUTH_USER: z.string().min(1).optional(),
    LEARNING_HUB_AUTH_PASSWORD: z.string().min(1).optional(),

    // Only providers actually implemented in `packages/ai` are accepted, so an
    // unimplemented choice fails loudly instead of silently disabling the tutor.
    AI_PROVIDER: z.enum(["none", "openai", "ollama"]).default("none"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
    OLLAMA_BASE_URL: optionalUrl("OLLAMA_BASE_URL"),
    OLLAMA_MODEL: z.string().min(1).default("llama3.1")
  })
  .superRefine((value, ctx) => {
    if (value.FINANCE_HUB_USE_DATABASE && !value.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "FINANCE_HUB_USE_DATABASE=true requires DATABASE_URL"
      });
    }

    if (value.LEARNING_HUB_AUTH_ENABLED) {
      if (!value.LEARNING_HUB_AUTH_USER) {
        ctx.addIssue({
          code: "custom",
          path: ["LEARNING_HUB_AUTH_USER"],
          message: "LEARNING_HUB_AUTH_ENABLED=true requires LEARNING_HUB_AUTH_USER"
        });
      }

      if (!value.LEARNING_HUB_AUTH_PASSWORD) {
        ctx.addIssue({
          code: "custom",
          path: ["LEARNING_HUB_AUTH_PASSWORD"],
          message: "LEARNING_HUB_AUTH_ENABLED=true requires LEARNING_HUB_AUTH_PASSWORD"
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
