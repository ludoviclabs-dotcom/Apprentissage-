import { describe, expect, it } from "vitest";
import { CALCULATION_TEMPLATE_IDS, getTemplate, runTemplate } from "../src";

/**
 * Les six calculs transverses.
 *
 * CE QU'ILS DOIVENT PROUVER. Qu'ils sont *généraux* : les valeurs employées ici
 * ne sont pas celles du corpus, et un même template doit rendre le bon résultat
 * sur des données perturbées. Un template qui ne passerait que sur les chiffres
 * d'un exercice du cours serait une formule déguisée en registre.
 *
 * CE QU'ILS DOIVENT PROUVER AUSSI. Qu'une entrée invalide est *refusée*, jamais
 * rattrapée. Un taux de réalisation au-dessus de 100 %, un nombre de titres
 * fractionnaire, une division par zéro : chacun rend `ok: false` avec un motif,
 * et non une valeur plausible qui masquerait l'erreur d'énoncé.
 */

describe("écart entre deux montants", () => {
  it("rend la différence sur un cas simple", () => {
    expect(runTemplate("ecart-entre-deux-montants.v1", { montantInitial: 250, montantSoustrait: 90 }).rounded).toBe(160);
  });

  it("rend un résultat négatif quand le contrat est déficitaire", () => {
    // Un résultat à terminaison négatif est le cas que le chapitre enseigne :
    // le borner à zéro le ferait disparaître.
    const run = runTemplate("ecart-entre-deux-montants.v1", {
      montantInitial: 400_000,
      montantSoustrait: 465_000
    });

    expect(run.ok).toBe(true);
    expect(run.rounded).toBe(-65_000);
  });

  it("refuse une entrée négative", () => {
    expect(runTemplate("ecart-entre-deux-montants.v1", { montantInitial: -1, montantSoustrait: 0 }).ok).toBe(false);
  });

  it("rend exactement le même résultat sur deux exécutions", () => {
    const inputs = { montantInitial: 910_000, montantSoustrait: 825_000 };

    expect(runTemplate("ecart-entre-deux-montants.v1", inputs)).toEqual(
      runTemplate("ecart-entre-deux-montants.v1", inputs)
    );
  });
});

describe("montant total d'une quantité", () => {
  it("multiplie un montant unitaire par une quantité", () => {
    expect(
      runTemplate("produit-montant-quantite.v1", { montantUnitaire: 25, quantite: 400 }).rounded
    ).toBe(10_000);
  });

  it("suit la quantité quand elle change", () => {
    // La formule doit être générale : doubler la quantité double le total.
    const simple = runTemplate("produit-montant-quantite.v1", { montantUnitaire: 12.5, quantite: 1_000 });
    const double = runTemplate("produit-montant-quantite.v1", { montantUnitaire: 12.5, quantite: 2_000 });

    expect(simple.rounded).toBe(12_500);
    expect(double.rounded).toBe(25_000);
  });

  it("rend zéro sur une quantité nulle sans échouer", () => {
    expect(runTemplate("produit-montant-quantite.v1", { montantUnitaire: 30, quantite: 0 }).rounded).toBe(0);
  });

  it("refuse une entrée non déclarée", () => {
    expect(
      runTemplate("produit-montant-quantite.v1", {
        montantUnitaire: 30,
        quantite: 10,
        nombreObligations: 5
      }).ok
    ).toBe(false);
  });
});

describe("fraction d'un montant", () => {
  it("applique un taux à un montant", () => {
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 910_000, taux: 0.375 }).rounded).toBe(341_250);
  });

  it("arrondit au centime", () => {
    // 0,333 x 1 000,01 = 333,00333 : la règle par défaut est le centime.
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 1_000.01, taux: 0.333 }).rounded).toBe(333);
  });

  it("refuse un taux supérieur à 1", () => {
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 1_000, taux: 1.2 }).ok).toBe(false);
  });

  it("refuse un taux négatif", () => {
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 1_000, taux: -0.1 }).ok).toBe(false);
  });

  it("accepte les bornes exactes", () => {
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 800, taux: 0 }).rounded).toBe(0);
    expect(runTemplate("fraction-d-un-montant.v1", { montantBase: 800, taux: 1 }).rounded).toBe(800);
  });
});

describe("taux de réalisation", () => {
  it("rend la quotité réalisée", () => {
    expect(
      runTemplate("taux-de-realisation.v1", { montantRealise: 300_000, montantTotalPrevu: 800_000 }).value
    ).toBeCloseTo(0.375, 10);
  });

  it("suit la révision du total prévu", () => {
    // Même part réalisée, total prévu révisé : le taux doit bouger. C'est ce qui
    // distingue une formule d'une constante recopiée du cours.
    const avant = runTemplate("taux-de-realisation.v1", { montantRealise: 577_500, montantTotalPrevu: 825_000 });
    const apres = runTemplate("taux-de-realisation.v1", { montantRealise: 577_500, montantTotalPrevu: 900_000 });

    expect(avant.value).toBeCloseTo(0.7, 10);
    expect(apres.value).toBeCloseTo(0.6416666666, 8);
  });

  it("refuse un total prévu nul plutôt que de rendre l'infini", () => {
    const run = runTemplate("taux-de-realisation.v1", { montantRealise: 100, montantTotalPrevu: 0 });

    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/division par zéro/);
  });

  it("refuse un taux supérieur à 100 % au lieu de le plafonner", () => {
    const run = runTemplate("taux-de-realisation.v1", { montantRealise: 900, montantTotalPrevu: 800 });

    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/100 %/);
  });

  it("accepte la borne exacte de 100 %", () => {
    expect(runTemplate("taux-de-realisation.v1", { montantRealise: 800, montantTotalPrevu: 800 }).value).toBe(1);
  });

  it("ne s'arrondit pas par défaut", () => {
    // Un taux arrondi au centime fausserait le montant qu'on en tire ensuite.
    expect(getTemplate("taux-de-realisation.v1")?.defaultRounding).toBe("none");
  });
});

describe("montant unitaire après répartition", () => {
  it("répartit un montant global sur des unités", () => {
    expect(
      runTemplate("montant-unitaire-par-repartition.v1", { montantGlobal: 150_000, nombreUnites: 6_000 }).rounded
    ).toBe(25);
  });

  it("refuse un nombre d'unités nul", () => {
    expect(
      runTemplate("montant-unitaire-par-repartition.v1", { montantGlobal: 1_000, nombreUnites: 0 }).ok
    ).toBe(false);
  });

  it("arrondit au centime un quotient qui ne tombe pas juste", () => {
    expect(
      runTemplate("montant-unitaire-par-repartition.v1", { montantGlobal: 1_000, nombreUnites: 3 }).rounded
    ).toBe(333.33);
  });
});

describe("nombre de titres à créer", () => {
  it("convertit un montant en titres", () => {
    expect(runTemplate("nombre-de-titres.v1", { montantTotal: 480_000, valeurUnitaire: 120 }).rounded).toBe(4_000);
  });

  it("reste général quand la valeur unitaire change", () => {
    expect(runTemplate("nombre-de-titres.v1", { montantTotal: 480_000, valeurUnitaire: 160 }).rounded).toBe(3_000);
  });

  it("refuse un quotient fractionnaire au lieu de l'arrondir", () => {
    const run = runTemplate("nombre-de-titres.v1", { montantTotal: 1_000, valeurUnitaire: 300 });

    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/entier/);
  });

  it("refuse une valeur unitaire nulle", () => {
    expect(runTemplate("nombre-de-titres.v1", { montantTotal: 1_000, valeurUnitaire: 0 }).ok).toBe(false);
  });
});

describe("propriétés du registre étendu", () => {
  const AJOUTES = [
    "ecart-entre-deux-montants.v1",
    "produit-montant-quantite.v1",
    "fraction-d-un-montant.v1",
    "taux-de-realisation.v1",
    "montant-unitaire-par-repartition.v1",
    "nombre-de-titres.v1"
  ];

  it("expose les six nouveaux identifiants", () => {
    for (const id of AJOUTES) {
      expect(CALCULATION_TEMPLATE_IDS, id).toContain(id);
    }
  });

  it("conserve les onze identifiants antérieurs", () => {
    // Aucun contenu déjà généré ne doit perdre son template.
    for (const id of [
      "coupon-annuel-unitaire.v1",
      "coupon-annuel-total.v1",
      "prime-remboursement-unitaire.v1",
      "prime-remboursement-totale.v1",
      "montant-emission-total.v1",
      "dette-remboursement-totale.v1",
      "prorata-temporis-mois.v1",
      "interets-courus.v1",
      "amortissement-lineaire-periode.v1",
      "amortissement-prorata-interets.v1",
      "frais-emission-nets-encaisses.v1"
    ]) {
      expect(CALCULATION_TEMPLATE_IDS, id).toContain(id);
    }

    expect(CALCULATION_TEMPLATE_IDS).toHaveLength(17);
  });

  it("ne nomme aucun chapitre ni aucune société dans les nouveaux templates", () => {
    // Un identifiant ou un libellé qui nommerait « Silvex », « obligataire » ou
    // « constitution » trahirait un template taillé pour un seul exemple.
    const interdits = /silvex|cegef|alical|roy|obligatai|emprunt|constitution|capital social/i;

    for (const id of AJOUTES) {
      const template = getTemplate(id)!;

      expect(`${template.id} ${template.label}`, id).not.toMatch(interdits);
      for (const input of template.inputs) {
        expect(input.name, `${id}.${input.name}`).not.toMatch(interdits);
      }
    }
  });

  it("refuse un template inconnu", () => {
    expect(runTemplate("pourcentage-avancement-silvex.v1", { a: 1 }).ok).toBe(false);
  });

  it("n'évalue aucune expression fournie par l'appelant", () => {
    // La surface d'expression est nulle : une chaîne passée en entrée est
    // refusée par le contrôle de finitude, jamais interprétée.
    const run = runTemplate("fraction-d-un-montant.v1", {
      montantBase: 100,
      taux: "0.5" as unknown as number
    });

    expect(run.ok).toBe(false);
  });
});
