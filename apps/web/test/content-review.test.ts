import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/lib/env";
import { resolveFeatures } from "@/lib/features";
import { ADMIN_NAV_SECTION } from "@/lib/navigation";
import { resolveTopbar } from "@/lib/topbar";
import { containsInternalConfigNames } from "@/lib/availability";

describe("CONTENT_REVIEW_ENABLED", () => {
  it("est désactivé par défaut", () => {
    expect(parseEnv({}).CONTENT_REVIEW_ENABLED).toBe(false);
    expect(resolveFeatures(parseEnv({})).contentReview.enabled).toBe(false);
  });

  it("s'active explicitement", () => {
    const env = parseEnv({ CONTENT_REVIEW_ENABLED: "true" });
    expect(resolveFeatures(env).contentReview.enabled).toBe(true);
  });

  it("refuse le démarrage en production sans comptes", () => {
    expect(() =>
      parseEnv({
        CONTENT_REVIEW_ENABLED: "true",
        VERCEL_ENV: "production",
        LEARNING_HUB_AUTH_ENABLED: "false"
      })
    ).toThrow(EnvValidationError);
  });

  it("accepte la production quand les comptes sont actifs", () => {
    const env = parseEnv({
      CONTENT_REVIEW_ENABLED: "true",
      VERCEL_ENV: "production",
      LEARNING_HUB_AUTH_ENABLED: "true",
      FINANCE_HUB_USE_DATABASE: "true",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db"
    });

    expect(env.CONTENT_REVIEW_ENABLED).toBe(true);
  });

  it("refuse aussi une production auto-hébergée, sans VERCEL_ENV", () => {
    // Sans comptes, resolveViewerRole donne le rôle admin à un visiteur
    // anonyme : ne contrôler que VERCEL_ENV laissait passer exactement cette
    // configuration sur un `next start` auto-hébergé.
    expect(() =>
      parseEnv({
        CONTENT_REVIEW_ENABLED: "true",
        NODE_ENV: "production",
        LEARNING_HUB_AUTH_ENABLED: "false"
      })
    ).toThrow(EnvValidationError);
  });

  it("accepte une machine privée qui le déclare par son nom", () => {
    const env = parseEnv({
      CONTENT_REVIEW_ENABLED: "true",
      NODE_ENV: "production",
      LEARNING_HUB_AUTH_ENABLED: "false",
      CONTENT_REVIEW_ALLOW_UNAUTHENTICATED: "true"
    });

    expect(env.CONTENT_REVIEW_ALLOW_UNAUTHENTICATED).toBe(true);
  });

  it("refuse cet aveu sur un déploiement Vercel de production", () => {
    // L'échappatoire vaut pour un hôte que personne d'autre ne joint ; sur
    // Vercel, l'instance est joignable par définition.
    expect(() =>
      parseEnv({
        CONTENT_REVIEW_ENABLED: "true",
        VERCEL_ENV: "production",
        LEARNING_HUB_AUTH_ENABLED: "false",
        CONTENT_REVIEW_ALLOW_UNAUTHENTICATED: "true"
      })
    ).toThrow(EnvValidationError);
  });

  it("reste ouvert hors production sans comptes — le cas du poste local", () => {
    const env = parseEnv({ CONTENT_REVIEW_ENABLED: "true", LEARNING_HUB_AUTH_ENABLED: "false" });
    expect(env.CONTENT_REVIEW_ENABLED).toBe(true);
  });

  it("ne divulgue aucun nom de variable dans le message public", () => {
    const state = resolveFeatures(parseEnv({})).contentReview;
    expect(state.enabled).toBe(false);
    expect(containsInternalConfigNames(state.publicMessage ?? "")).toBe(false);
  });
});

describe("navigation de l'espace de relecture", () => {
  it("range la relecture dans l'administration", () => {
    const hrefs = ADMIN_NAV_SECTION.items.map((item) => item.href);
    expect(hrefs).toContain("/admin/content-review");
  });

  it("porte un en-tête d'administration explicite", () => {
    const topbar = resolveTopbar("/admin/content-review");
    expect(topbar.section).toBe("Administration");
    expect(topbar.breadcrumb.map((crumb) => crumb.label)).toEqual(["Administration", "Relecture"]);
  });

  it("couvre aussi la page de détail d'un brouillon", () => {
    expect(resolveTopbar("/admin/content-review/draft-abc123").section).toBe("Administration");
  });
});
