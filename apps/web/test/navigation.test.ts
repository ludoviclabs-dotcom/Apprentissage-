import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_SECTION,
  HOME_NAV_ITEM,
  PRIMARY_NAV_SECTIONS,
  ariaCurrentFor,
  isNavItemActive,
  isPathActive,
  isSectionActive,
  resolveActiveHref
} from "@/lib/navigation";
import { resolveTopbar } from "@/lib/topbar";
import {
  COMPETENCY_STATUS_LABELS,
  LEARNING_DAY_STATUS_LABELS,
  statusLabel
} from "@/lib/status-labels";

describe("architecture de navigation", () => {
  it("expose au maximum cinq destinations principales", () => {
    // Accueil + les quatre groupes. C'est la Definition of Done de PR-09 :
    // une sixième destination principale doit faire échouer ce test.
    expect(1 + PRIMARY_NAV_SECTIONS.length).toBeLessThanOrEqual(5);
  });

  it("ne place ni administration, ni facturation, ni compte dans la navigation principale", () => {
    const hrefs = PRIMARY_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));

    for (const forbidden of ["/documents", "/source-packs", "/billing", "/account", "/login", "/signup"]) {
      expect(hrefs).not.toContain(forbidden);
    }
  });

  it("garde Documents, Source packs et Relecture accessibles via la section Administration", () => {
    const hrefs = ADMIN_NAV_SECTION.items.map((item) => item.href);

    expect(hrefs).toEqual(["/documents", "/source-packs", "/admin/content-review"]);
  });

  it("tient la navigation principale à l'écart de l'espace de relecture", () => {
    const hrefs = PRIMARY_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));

    expect(hrefs).not.toContain("/admin/content-review");
  });
});

describe("état actif des routes imbriquées", () => {
  it("active l'entrée exacte", () => {
    expect(isPathActive("/exercices", "/exercices")).toBe(true);
    expect(ariaCurrentFor("/exercices", "/exercices")).toBe("page");
  });

  it("active l'ancêtre d'une route imbriquée", () => {
    expect(isPathActive("/exercices/tva-101", "/exercices")).toBe(true);
    expect(ariaCurrentFor("/exercices/tva-101", "/exercices")).toBe("true");
    expect(isPathActive("/modules/excel-finance-lab/exercices/lab-1", "/modules")).toBe(true);
  });

  it("ne confond pas un préfixe de chaîne avec un segment", () => {
    expect(isPathActive("/exercices-avances", "/exercices")).toBe(false);
  });

  it("n'active l'accueil que sur la racine", () => {
    expect(isPathActive("/", HOME_NAV_ITEM.href)).toBe(true);
    expect(isPathActive("/exercices", HOME_NAV_ITEM.href)).toBe(false);
  });

  it("un lien d'ancre ne revendique jamais l'état actif", () => {
    expect(isPathActive("/progression", "/progression#badges")).toBe(false);
    expect(ariaCurrentFor("/progression", "/progression#badges")).toBeUndefined();
  });

  it("active la section porteuse d'une route imbriquée", () => {
    const apprendre = PRIMARY_NAV_SECTIONS.find((section) => section.key === "apprendre");
    const entrainer = PRIMARY_NAV_SECTIONS.find((section) => section.key === "entrainer");

    expect(apprendre && isSectionActive("/modules/comptabilite-generale/n1", apprendre)).toBe(true);
    expect(entrainer && isSectionActive("/modules/comptabilite-generale/n1", entrainer)).toBe(false);
  });
});

/**
 * PR-20. `/revisions/carnet-erreurs` est couvert par deux entrées du menu, et
 * c'est la plus spécifique qui doit gagner. `isPathActive` seul en allumait
 * deux, avec deux `aria-current` simultanés — un lecteur d'écran annonçait deux
 * pages courantes.
 */
describe("une seule entrée active, la plus spécifique", () => {
  it("désigne le carnet d'erreurs, pas la session du jour", () => {
    expect(resolveActiveHref("/revisions/carnet-erreurs")).toBe("/revisions/carnet-erreurs");
    expect(isNavItemActive("/revisions/carnet-erreurs", "/revisions/carnet-erreurs")).toBe(true);
    expect(isNavItemActive("/revisions/carnet-erreurs", "/revisions")).toBe(false);
    expect(ariaCurrentFor("/revisions/carnet-erreurs", "/revisions")).toBeUndefined();
    expect(ariaCurrentFor("/revisions/carnet-erreurs", "/revisions/carnet-erreurs")).toBe("page");
  });

  it("laisse la session du jour active sur /revisions", () => {
    expect(isNavItemActive("/revisions", "/revisions")).toBe(true);
    expect(isNavItemActive("/revisions", "/revisions/carnet-erreurs")).toBe(false);
  });

  /**
   * La session découverte n'a pas d'entrée propre : c'est « Exercices » qui la
   * porte, comme n'importe quelle route imbriquée sans lien dédié.
   */
  it("laisse Exercices porter la session découverte", () => {
    expect(resolveActiveHref("/exercices/session-decouverte")).toBe("/exercices");
    expect(ariaCurrentFor("/exercices/session-decouverte", "/exercices")).toBe("true");
  });

  it("garde la section Réviser dépliée sur les deux routes", () => {
    const reviser = PRIMARY_NAV_SECTIONS.find((section) => section.key === "reviser");

    expect(reviser && isSectionActive("/revisions", reviser)).toBe(true);
    expect(reviser && isSectionActive("/revisions/carnet-erreurs", reviser)).toBe(true);
  });

  it("n'active exactement qu'une entrée par route", () => {
    const everyLeaf = [
      HOME_NAV_ITEM,
      ...PRIMARY_NAV_SECTIONS.flatMap((section) => section.items),
      ...ADMIN_NAV_SECTION.items
    ];

    for (const pathname of [
      "/",
      "/exercices",
      "/exercices/session-decouverte",
      "/revisions",
      "/revisions/carnet-erreurs",
      "/corrections/corr-1",
      "/modules/excel-finance-lab/exercices/lab-1",
      "/documents"
    ]) {
      const active = everyLeaf.filter((item) => isNavItemActive(pathname, item.href));

      expect(active.map((item) => item.href), pathname).toHaveLength(1);
    }
  });

  it("n'active rien sur une route hors menu", () => {
    expect(resolveActiveHref("/route-inconnue")).toBeUndefined();
  });

  it("expose le carnet d'erreurs comme une vraie route, plus comme une ancre", () => {
    const reviser = PRIMARY_NAV_SECTIONS.find((section) => section.key === "reviser");
    const carnet = reviser?.items.find((item) => item.label === "Carnet d'erreurs");

    expect(carnet?.href).toBe("/revisions/carnet-erreurs");
    expect(carnet?.anchor).toBeUndefined();
  });
});

describe("topbar contextuelle", () => {
  it("résout les exemples du cahier des charges", () => {
    expect(resolveTopbar("/exercices")).toMatchObject({ section: "S'entraîner", title: "Exercices" });
    expect(resolveTopbar("/revisions")).toMatchObject({ section: "Réviser", title: "Session du jour" });
    expect(resolveTopbar("/billing")).toMatchObject({ section: "Compte", title: "Offre" });
    expect(resolveTopbar("/modules/excel-finance-lab")).toMatchObject({
      section: "Apprendre",
      title: "Excel Finance Lab"
    });
  });

  /**
   * Les deux routes de PR-20 s'annoncent elles-mêmes. Le carnet affichait
   * « Session du jour » parce que la règle `/revisions` l'absorbait — c'est
   * l'ordre des règles, du plus spécifique au plus général, qui le corrige.
   */
  it("donne au carnet et à la session découverte leur propre titre", () => {
    expect(resolveTopbar("/revisions/carnet-erreurs")).toMatchObject({
      section: "Réviser",
      title: "Carnet d'erreurs"
    });
    expect(resolveTopbar("/revisions/carnet-erreurs").breadcrumb.map((entry) => entry.label)).toEqual(
      ["Réviser", "Carnet d'erreurs"]
    );

    expect(resolveTopbar("/exercices/session-decouverte")).toMatchObject({
      section: "S'entraîner",
      title: "Session découverte"
    });
    expect(
      resolveTopbar("/exercices/session-decouverte").breadcrumb.map((entry) => entry.label)
    ).toEqual(["S'entraîner", "Exercices", "Session découverte"]);
  });

  it("ne casse pas les routes voisines", () => {
    expect(resolveTopbar("/revisions").title).toBe("Session du jour");
    expect(resolveTopbar("/exercices/tva-101").title).toBe("Exercices");
  });

  it("couvre les routes dynamiques par préfixe", () => {
    expect(resolveTopbar("/exercices/tva-101").title).toBe("Exercices");
    expect(resolveTopbar("/corrections/corr-1").section).toBe("Réviser");
    expect(resolveTopbar("/modules/excel-finance-lab/exercices/lab-1").title).toBe("Excel Finance Lab");
    expect(resolveTopbar("/attestations/FLH-2026-0001").title).toBe("Attestations");
  });

  it("désigne Documents et Source packs comme Administration", () => {
    expect(resolveTopbar("/documents").section).toBe("Administration");
    expect(resolveTopbar("/source-packs/pack-1").section).toBe("Administration");
  });

  it("reste générique sur une route inconnue plutôt que d'afficher une rubrique fausse", () => {
    expect(resolveTopbar("/route-inconnue").title).toBe("Finance Learning Hub");
  });

  it("masque la recherche globale sur la page de recherche et les écrans d'auth", () => {
    expect(resolveTopbar("/recherche").search).toBe(false);
    expect(resolveTopbar("/login").search).toBe(false);
    expect(resolveTopbar("/exercices").search).toBe(true);
  });
});

describe("libellés français des statuts", () => {
  it("traduit les huit statuts requis", () => {
    expect(LEARNING_DAY_STATUS_LABELS.done).toBe("Terminé");
    expect(LEARNING_DAY_STATUS_LABELS.today).toBe("Aujourd'hui");
    expect(LEARNING_DAY_STATUS_LABELS.next).toBe("À venir");
    expect(LEARNING_DAY_STATUS_LABELS.locked).toBe("Verrouillé");
    expect(COMPETENCY_STATUS_LABELS["in-progress"]).toBe("En cours");
    expect(COMPETENCY_STATUS_LABELS["not-started"]).toBe("Non commencé");
    expect(COMPETENCY_STATUS_LABELS.mastered).toBe("Maîtrisé");
    expect(COMPETENCY_STATUS_LABELS.fragile).toBe("À consolider");
  });

  it("ne laisse jamais passer un statut brut", () => {
    expect(statusLabel("needs-review")).toBe("À vérifier");
    expect(statusLabel("submitted")).toBe("Rendue");
    expect(statusLabel("available")).toBe("Disponible");
  });
});
