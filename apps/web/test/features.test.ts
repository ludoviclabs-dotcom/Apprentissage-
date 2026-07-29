import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { isDatabaseActive, isPublicDemo, resolveFeatures } from "@/lib/features";

const DB_URL = "postgresql://finance:pw@localhost:5432/finance_hub";

describe("isPublicDemo", () => {
  it("is false by default in local development", () => {
    expect(isPublicDemo(parseEnv({}))).toBe(false);
  });

  it("is true on Vercel production when auth is off", () => {
    expect(isPublicDemo(parseEnv({ VERCEL_ENV: "production" }))).toBe(true);
  });

  it("is false on Vercel production once auth is on", () => {
    const env = parseEnv({
      VERCEL_ENV: "production",
      LEARNING_HUB_AUTH_ENABLED: "true",
      LEARNING_HUB_AUTH_USER: "ludo",
      LEARNING_HUB_AUTH_PASSWORD: "secret"
    });

    expect(isPublicDemo(env)).toBe(false);
  });

  it("can be forced on locally", () => {
    expect(isPublicDemo(parseEnv({ FINANCE_HUB_PUBLIC_DEMO: "true" }))).toBe(true);
  });

  it("stays true on preview deployments only when explicitly requested", () => {
    expect(isPublicDemo(parseEnv({ VERCEL_ENV: "preview" }))).toBe(false);
  });
});

describe("isDatabaseActive", () => {
  it("is false without configuration", () => {
    expect(isDatabaseActive(parseEnv({}))).toBe(false);
  });

  it("is true when both the flag and the url are set", () => {
    expect(isDatabaseActive(parseEnv({ FINANCE_HUB_USE_DATABASE: "true", DATABASE_URL: DB_URL }))).toBe(true);
  });
});

describe("resolveFeatures", () => {
  it("disables writes and explains why in public demo", () => {
    const features = resolveFeatures(parseEnv({ FINANCE_HUB_PUBLIC_DEMO: "true" }));

    expect(features.writes.enabled).toBe(false);
    expect(features.uploads.enabled).toBe(false);
    expect(features.sourcePackImport.enabled).toBe(false);
    expect(features.writes.reason).toBeTruthy();
  });

  it("allows writes locally but flags that nothing is persisted", () => {
    const features = resolveFeatures(parseEnv({}));

    expect(features.writes.enabled).toBe(true);
    expect(features.persistence.enabled).toBe(false);
    expect(features.persistence.reason).toContain("FINANCE_HUB_USE_DATABASE");
  });

  it("enables persistence once the database is active", () => {
    const features = resolveFeatures(parseEnv({ FINANCE_HUB_USE_DATABASE: "true", DATABASE_URL: DB_URL }));

    expect(features.persistence.enabled).toBe(true);
    expect(features.database.enabled).toBe(true);
  });

  it("reports the tutor as disabled when no provider is configured", () => {
    const features = resolveFeatures(parseEnv({}));

    expect(features.aiTutor.enabled).toBe(false);
    expect(features.aiTutor.reason).toContain("AI_PROVIDER=none");
  });

  it("enables the tutor for a configured provider", () => {
    const features = resolveFeatures(parseEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }));

    expect(features.aiTutor.enabled).toBe(true);
    expect(features.aiTutor.reason).toBeUndefined();
  });

  it("never leaves a disabled feature without an explanation", () => {
    const features = resolveFeatures(parseEnv({ VERCEL_ENV: "production" }));

    for (const [name, state] of Object.entries(features)) {
      if (!state.enabled) {
        expect(state.reason, `${name} is disabled without a reason`).toBeTruthy();
      }
    }
  });
});
