import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { containsInternalConfigNames } from "@/lib/availability";
import { resolveDiagnostics } from "@/lib/availability-diagnostics";
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
      FINANCE_HUB_USE_DATABASE: "true",
      DATABASE_URL: DB_URL
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
    expect(features.writes.code).toBe("public-demo");
    expect(features.writes.publicMessage).toBeTruthy();
  });

  it("allows writes locally but flags that nothing is persisted", () => {
    const features = resolveFeatures(parseEnv({}));

    expect(features.writes.enabled).toBe(true);
    expect(features.persistence.enabled).toBe(false);
    expect(features.persistence.code).toBe("persistence-unavailable");
    expect(features.persistence.publicMessage).toBeTruthy();
  });

  it("enables persistence once the database is active", () => {
    const features = resolveFeatures(parseEnv({ FINANCE_HUB_USE_DATABASE: "true", DATABASE_URL: DB_URL }));

    expect(features.persistence.enabled).toBe(true);
    expect(features.database.enabled).toBe(true);
  });

  it("reports the tutor as disabled when no provider is configured", () => {
    const features = resolveFeatures(parseEnv({}));

    expect(features.aiTutor.enabled).toBe(false);
    expect(features.aiTutor.code).toBe("ai-disabled");
    expect(features.aiTutor.publicMessage).toBeTruthy();
  });

  it("enables the tutor for a configured provider", () => {
    const features = resolveFeatures(parseEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }));

    expect(features.aiTutor.enabled).toBe(true);
    expect(features.aiTutor.publicMessage).toBeUndefined();
  });

  it("never leaves a disabled feature without an explanation", () => {
    const features = resolveFeatures(parseEnv({ VERCEL_ENV: "production" }));

    for (const [name, state] of Object.entries(features)) {
      if (!state.enabled) {
        expect(state.publicMessage, `${name} is disabled without a public message`).toBeTruthy();
        expect(state.code, `${name} is disabled without a reason code`).toBeTruthy();
      }
    }
  });

  /**
   * La règle de PR-20, appliquée à la source plutôt qu'au rendu. Un message
   * public qui nomme une variable est une régression même si aucune page ne
   * l'affiche encore : la prochaine qui l'affichera n'aura rien à se reprocher.
   */
  it("keeps every public message free of internal configuration names", () => {
    const environments = [
      parseEnv({}),
      parseEnv({ FINANCE_HUB_PUBLIC_DEMO: "true" }),
      parseEnv({ VERCEL_ENV: "production" }),
      parseEnv({ FINANCE_HUB_USE_DATABASE: "true", DATABASE_URL: DB_URL })
    ];

    for (const env of environments) {
      for (const [name, state] of Object.entries(resolveFeatures(env))) {
        const text = `${state.publicMessage ?? ""} ${state.optionalAction?.label ?? ""}`;

        expect(
          containsInternalConfigNames(text),
          `${name} exposes an internal configuration name: ${text}`
        ).toBe(false);
      }
    }
  });

  /**
   * Le versant opérateur doit rester utile : un diagnostic vide renverrait
   * l'administrateur au même écran muet que le visiteur.
   */
  it("still tells an operator what to configure, server-side only", () => {
    const diagnostics = resolveDiagnostics(parseEnv({ FINANCE_HUB_PUBLIC_DEMO: "true" }));

    expect(diagnostics.persistence).toContain("FINANCE_HUB_USE_DATABASE");
    expect(diagnostics.writes).toContain("FINANCE_HUB_PUBLIC_DEMO");
    expect(diagnostics.database).toContain("DATABASE_URL");
  });
});
