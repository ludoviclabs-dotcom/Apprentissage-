import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv, resolveAppUrl } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts an empty environment and falls back to seeded defaults", () => {
    const env = parseEnv({});

    expect(env.FINANCE_HUB_USE_DATABASE).toBe(false);
    expect(env.LEARNING_HUB_AUTH_ENABLED).toBe(false);
    expect(env.AI_PROVIDER).toBe("none");
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Finance Learning Hub");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ OPENAI_API_KEY: "", DATABASE_URL: "   " });

    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("rejects database mode without a connection string", () => {
    expect(() => parseEnv({ FINANCE_HUB_USE_DATABASE: "true" })).toThrow(EnvValidationError);
  });

  it("accepts database mode with a connection string", () => {
    const env = parseEnv({
      FINANCE_HUB_USE_DATABASE: "true",
      DATABASE_URL: "postgresql://finance:pw@localhost:5432/finance_hub"
    });

    expect(env.FINANCE_HUB_USE_DATABASE).toBe(true);
  });

  it("rejects account auth without database mode, since accounts live in postgres", () => {
    try {
      parseEnv({ LEARNING_HUB_AUTH_ENABLED: "true" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.join("\n")).toContain("FINANCE_HUB_USE_DATABASE");
    }
  });

  it("accepts account auth alongside database mode", () => {
    const env = parseEnv({
      LEARNING_HUB_AUTH_ENABLED: "true",
      FINANCE_HUB_USE_DATABASE: "true",
      DATABASE_URL: "postgresql://finance:pw@localhost:5432/finance_hub"
    });

    expect(env.LEARNING_HUB_AUTH_ENABLED).toBe(true);
  });

  it("rejects the retired basic-auth credentials instead of ignoring them", () => {
    // Silently ignoring them would leave someone believing the app is gated.
    try {
      parseEnv({ LEARNING_HUB_AUTH_USER: "ludo", LEARNING_HUB_AUTH_PASSWORD: "secret" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues.join("\n");
      expect(issues).toContain("LEARNING_HUB_AUTH_USER");
      expect(issues).toContain("LEARNING_HUB_AUTH_PASSWORD");
      expect(issues).toContain("retired in PR-01");
    }
  });

  it("rejects the openai provider without an api key", () => {
    expect(() => parseEnv({ AI_PROVIDER: "openai" })).toThrow(EnvValidationError);
    expect(() => parseEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" })).not.toThrow();
  });

  it("rejects a provider that packages/ai does not implement", () => {
    expect(() => parseEnv({ AI_PROVIDER: "anthropic" })).toThrow(EnvValidationError);
  });

  it("rejects non-boolean flag values instead of silently reading them as false", () => {
    expect(() => parseEnv({ FINANCE_HUB_USE_DATABASE: "1" })).toThrow(EnvValidationError);
    expect(() => parseEnv({ FINANCE_HUB_PUBLIC_DEMO: "TRUE" })).toThrow(EnvValidationError);
  });

  it("rejects a malformed app url", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_APP_URL: "not-a-url" })).toThrow(EnvValidationError);
  });
});

describe("resolveAppUrl", () => {
  it("prefers the explicit app url and strips a trailing slash", () => {
    expect(resolveAppUrl(parseEnv({ NEXT_PUBLIC_APP_URL: "https://hub.example.com/" }))).toBe(
      "https://hub.example.com"
    );
  });

  it("falls back to the Vercel preview url", () => {
    expect(resolveAppUrl(parseEnv({ VERCEL_URL: "preview-abc.vercel.app" }))).toBe(
      "https://preview-abc.vercel.app"
    );
  });

  it("falls back to localhost", () => {
    expect(resolveAppUrl(parseEnv({}))).toBe("http://localhost:3000");
  });
});
