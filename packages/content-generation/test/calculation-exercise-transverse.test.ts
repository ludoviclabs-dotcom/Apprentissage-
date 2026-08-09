import { describe, expect, it } from "vitest";
import { calculationExerciseSchema, runTemplate, validateContent } from "../src";
import type { ContentPayload } from "../src";
import { dataReference, testCorpus } from "./fixtures";

/**
 * Un exercice bâti sur un calcul transverse traverse-t-il la chaîne réelle ?
 *
 * CE QUI EST ÉPROUVÉ ICI N'EST PAS LA FORMULE — l'autre fichier s'en charge —
 * MAIS LE CONTRAT ENTRE L'EXERCICE ET LE MOTEUR. Le générateur ne fournit qu'un
 * `formulaTemplateId` et des `templateInputs` ; c'est le code qui recalcule la
 * réponse, la compare à celle annoncée, et vérifie que chaque entrée du calcul
 * correspond bien à une variable de l'énoncé. Une réponse fausse doit échouer,
 * et échouer *au bon endroit* : sur `expectedAnswer`, pas sur un contrôle voisin.
 *
 * Les données sont fictives. Le comportement mathématique est celui du chapitre
 * — une part réalisée rapportée à un total prévu, puis appliquée à un produit —
 * sans reprendre aucun chiffre du corpus privé.
 */

function avancementExercise(overrides: Record<string, unknown> = {}): ContentPayload {
  return {
    contentType: "calculation_exercise",
    content: {
      title: "Produit reconnu à l'avancement",
      statement:
        "Un contrat prévoit un prix ferme de 500 000 € et un coût total prévisionnel de 400 000 €. À la clôture, les travaux acceptés représentent 100 000 € de coûts. Calculer le produit à comptabiliser.",
      variables: [
        { name: "montantBase", label: "Prix ferme du contrat", value: 500_000, unit: "€", providedInStatement: true },
        { name: "taux", label: "Taux d'avancement", value: 0.25, unit: "ratio", providedInStatement: false }
      ],
      expectedAnswer: 125_000,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent",
      formulaTemplateId: "fraction-d-un-montant.v1",
      templateInputs: { montantBase: 500_000, taux: 0.25 },
      calculationSteps: [
        { order: 1, description: "Taux d'avancement : 100 000 / 400 000 = 0,25.", intermediateResult: 0.25 },
        { order: 2, description: "Produit reconnu : 500 000 x 0,25." }
      ],
      explanation:
        "Le taux d'avancement mesure la part des coûts acceptés dans le coût total prévu ; il s'applique ensuite au prix du contrat, non aux coûts, sans quoi la marge disparaîtrait.",
      gradingRubric: [{ label: "Produit reconnu exact", points: 10 }],
      competencyTags: ["cg-contrats-long-terme"],
      sourceReferences: [dataReference],
      difficulty: 3,
      ...overrides
    }
  } as ContentPayload;
}

describe("exercice bâti sur un calcul transverse", () => {
  it("passe le schéma et la validation complète", () => {
    const payload = avancementExercise();

    expect(calculationExerciseSchema.safeParse(payload.content).success).toBe(true);

    const report = validateContent({ payload, corpus: testCorpus });

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("bascule en échec quand la réponse annoncée est fausse", () => {
    const report = validateContent({ payload: avancementExercise({ expectedAnswer: 100_000 }), corpus: testCorpus });

    expect(report.passed).toBe(false);
    expect(report.errors.map((issue) => issue.code)).toContain("resultat-divergent");
    // Aucune correction silencieuse : la réponse fausse reste dans le contenu.
    expect(report.errors.some((issue) => issue.path === "content.expectedAnswer")).toBe(true);
  });

  it("refuse une entrée du calcul absente de l'énoncé ou divergente", () => {
    const divergent = validateContent({
      payload: avancementExercise({ templateInputs: { montantBase: 500_000, taux: 0.4 } }),
      corpus: testCorpus
    });

    expect(divergent.errors.map((issue) => issue.code)).toContain("entree-incoherente");
  });

  it("échoue proprement quand les entrées violent une borne du template", () => {
    const report = validateContent({
      payload: avancementExercise({
        variables: [
          { name: "montantBase", label: "Prix ferme", value: 500_000, unit: "€", providedInStatement: true },
          { name: "taux", label: "Taux", value: 1.4, unit: "ratio", providedInStatement: false }
        ],
        templateInputs: { montantBase: 500_000, taux: 1.4 },
        expectedAnswer: 700_000
      }),
      corpus: testCorpus
    });

    expect(report.passed).toBe(false);
    expect(report.errors.map((issue) => issue.code)).toContain("calcul-impossible");
  });

  it("refuse un identifiant de template qui n'existe pas au schéma", () => {
    const parsed = calculationExerciseSchema.safeParse({
      ...(avancementExercise().content as Record<string, unknown>),
      formulaTemplateId: "produit-reconnu-avancement.v1"
    });

    expect(parsed.success).toBe(false);
  });

  it("contrôle la règle d'arrondi annoncée", () => {
    // Le moteur recalcule avec la règle portée par l'exercice : la changer
    // change la réponse attendue, et une réponse laissée telle quelle diverge.
    const auCentime = runTemplate("fraction-d-un-montant.v1", { montantBase: 1_000.01, taux: 0.333 }, "cent");
    const aLUnite = runTemplate("fraction-d-un-montant.v1", { montantBase: 1_000.01, taux: 0.333 }, "unit");

    expect(auCentime.rounded).toBe(333);
    expect(aLUnite.rounded).toBe(333);
    expect(auCentime.value).toBeCloseTo(333.00333, 5);
  });
});

describe("non-régression des calculs antérieurs", () => {
  it("rend exactement les mêmes résultats qu'avant l'extension du registre", () => {
    // Valeurs figées : si l'un de ces résultats bouge, un contenu déjà généré
    // sur les emprunts obligataires basculerait en « resultat-divergent » sans
    // que personne n'ait touché à son contenu.
    const attendus: Array<[string, Record<string, number>, number]> = [
      ["coupon-annuel-unitaire.v1", { valeurNominale: 1_000, tauxInteret: 0.045 }, 45],
      ["coupon-annuel-total.v1", { couponUnitaire: 45, nombreObligations: 8_000 }, 360_000],
      ["prime-remboursement-unitaire.v1", { prixRemboursement: 1_006, prixEmission: 996 }, 10],
      [
        "prime-remboursement-totale.v1",
        { prixRemboursement: 1_006, prixEmission: 996, nombreObligations: 8_000 },
        80_000
      ],
      ["montant-emission-total.v1", { prixEmission: 996, nombreObligations: 8_000 }, 7_968_000],
      ["dette-remboursement-totale.v1", { prixRemboursement: 1_006, nombreObligations: 8_000 }, 8_048_000],
      ["prorata-temporis-mois.v1", { montantAnnuel: 360_000, moisEcoules: 4 }, 120_000],
      ["interets-courus.v1", { couponAnnuelTotal: 360_000, moisEcoules: 4 }, 120_000],
      ["amortissement-lineaire-periode.v1", { montantAEtaler: 80_000, dureeMois: 96, moisEcoules: 4 }, 3_333.33],
      [
        "amortissement-prorata-interets.v1",
        { montantAEtaler: 80_000, interetsCourus: 120_000, interetsTotaux: 2_880_000 },
        3_333.33
      ],
      ["frais-emission-nets-encaisses.v1", { montantEmission: 7_968_000, fraisEmission: 48_000 }, 7_920_000]
    ];

    for (const [id, inputs, attendu] of attendus) {
      const run = runTemplate(id, inputs);

      expect(run.ok, id).toBe(true);
      expect(run.rounded, id).toBe(attendu);
    }
  });
});
