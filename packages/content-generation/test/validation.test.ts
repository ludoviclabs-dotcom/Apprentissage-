import { describe, expect, it } from "vitest";
import { applyRounding, runTemplate, validateContent, VALIDATION_VERSION } from "../src";
import type { ContentPayload } from "../src";
import {
  calculationPayload,
  dataReference,
  flashcardPayload,
  journalEntryPayload,
  testCorpus,
  validReference
} from "./fixtures";

function validate(payload: ContentPayload, siblings: ContentPayload[] = []) {
  return validateContent({ payload, corpus: testCorpus, siblings });
}

describe("moteur de validation — contrôles communs", () => {
  it("accepte un contenu conforme et sourcé", () => {
    const result = validate(flashcardPayload());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.qualityScore).toBeGreaterThan(80);
  });

  it("porte sa version de validation dans les métadonnées", () => {
    expect(VALIDATION_VERSION).toMatch(/^content-validation\.v\d+$/);
  });

  it("refuse une carte sans source", () => {
    const result = validate(flashcardPayload({ sourceReferences: [] }));
    expect(result.passed).toBe(false);
  });

  it("refuse une référence vers une page inexistante", () => {
    const result = validate(
      flashcardPayload({ sourceReferences: [{ ...validReference, pageStart: 42, pageEnd: 42 }] })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "page-inexistante")).toBe(true);
  });

  it("refuse un chemin absolu glissé dans le contenu", () => {
    const result = validate(
      flashcardPayload({ explanation: "Voir C:\\Users\\Ludo\\Dropbox\\cours.pdf pour le détail complet." })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "chemin-absolu")).toBe(true);
  });

  it("signale une page dégradée en avertissement sans bloquer la génération", () => {
    // La page 3 du corpus de test est dégradée. Un contenu qui l'englobe reste
    // produit et relisable — c'est l'approbation qui le refusera, règle portée
    // par la route de revue et non par le moteur.
    const result = validate(
      flashcardPayload({ sourceReferences: [{ ...validReference, pageStart: 1, pageEnd: 3 }] })
    );

    expect(result.passed).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "page-degradee")).toBe(true);
  });

  it("refuse un secret glissé dans le contenu", () => {
    const result = validate(
      flashcardPayload({ explanation: "Clé de test : sk-abcdefghijklmnop pour appeler le service externe." })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "secret-detecte")).toBe(true);
  });
});

describe("moteur de validation — flashcards", () => {
  it("refuse une carte non atomique déclarée telle", () => {
    const result = validate(
      flashcardPayload({
        atomicityCheck: { testedFactCount: 3, singleFocus: false, justification: "Trois notions." }
      })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "carte-non-atomique")).toBe(true);
  });

  it("refuse une carte qui pose deux questions, même déclarée atomique", () => {
    const result = validate(
      flashcardPayload({
        front: "Quel compte est crédité ? Et pour quel montant exactement dans ce cas précis ?"
      })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "carte-non-atomique")).toBe(true);
  });

  it("refuse une carte dont la question contient déjà toute la réponse", () => {
    const result = validate(
      flashcardPayload({
        front: "Le compte 163 est-il crédité du prix de remboursement à la souscription ?",
        back: "Le compte 163 crédité du prix de remboursement.",
        atomicityCheck: { testedFactCount: 1, singleFocus: true, justification: "Une notion." }
      })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "reponse-dans-question")).toBe(true);
  });

  it("tolère un fort recouvrement quand la réponse apporte l'essentiel", () => {
    // La question reprend « compte / intérêts / courus », mais la réponse
    // apporte le numéro : c'est un avertissement, pas un blocage.
    const result = validate(
      flashcardPayload({
        front: "Quel compte reçoit les intérêts courus non échus d'un emprunt obligataire ?",
        back: "Le compte 16883 « Intérêts courus ».",
        type: "account"
      })
    );

    expect(result.passed).toBe(true);
    expect(result.warnings.some((issue) => issue.code === "recouvrement-fort")).toBe(true);
  });

  it("détecte un doublon exact entre deux cartes", () => {
    const first = flashcardPayload();
    const result = validate(flashcardPayload(), [first]);

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "doublon-exact")).toBe(true);
  });

  it("signale un quasi-doublon sans le bloquer", () => {
    const first = flashcardPayload();
    const result = validate(
      flashcardPayload({
        front: "Quel compte est crédité à la souscription d'un emprunt obligataire donc ?",
        back: "Le compte 163 « Autres emprunts obligataires »."
      }),
      [first]
    );

    expect(result.warnings.some((issue) => issue.code === "doublon-probable")).toBe(true);
  });
});

describe("moteur de validation — calculs", () => {
  it("accepte un exercice dont le résultat est recalculable", () => {
    const result = validate(calculationPayload());
    expect(result.passed).toBe(true);
  });

  it("refuse un résultat faux sans le corriger silencieusement", () => {
    const result = validate(calculationPayload({ expectedAnswer: 79000 }));

    expect(result.passed).toBe(false);
    const issue = result.errors.find((candidate) => candidate.code === "resultat-divergent");
    expect(issue).toBeDefined();
    // L'écart exact est reporté, et la valeur annoncée n'est pas remplacée.
    expect(issue?.message).toContain("79000");
    expect(issue?.message).toContain("80000");
  });

  it("refuse une entrée de calcul incohérente avec l'énoncé", () => {
    const result = validate(
      calculationPayload({ templateInputs: { prixRemboursement: 1010, prixEmission: 996, nombreObligations: 8000 } })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "entree-incoherente")).toBe(true);
  });

  it("refuse un template de calcul inconnu dès le schéma", () => {
    const result = validate(calculationPayload({ formulaTemplateId: "formule-maison.v1" }));
    expect(result.passed).toBe(false);
  });

  it("refuse un barème nul", () => {
    const result = validate(calculationPayload({ gradingRubric: [{ label: "Rien", points: 0 }] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "bareme-nul")).toBe(true);
  });

  it("exige au moins une compétence visée", () => {
    // AGENTS.md : « rubric, expected answer and competency tags ».
    expect(validate(calculationPayload({ competencyTags: [] })).passed).toBe(false);
  });

  it("refuse une compétence vide ou répétée", () => {
    const blank = validate(calculationPayload({ competencyTags: ["  "] }));
    expect(blank.errors.some((issue) => issue.code === "competence-vide")).toBe(true);

    const repeated = validate(calculationPayload({ competencyTags: ["cg-emprunts", "CG-Emprunts"] }));
    expect(repeated.errors.some((issue) => issue.code === "competence-dupliquee")).toBe(true);
  });
});

describe("templates de calcul", () => {
  it("recalcule la prime totale du cas CSP", () => {
    const run = runTemplate("prime-remboursement-totale.v1", {
      prixRemboursement: 1006,
      prixEmission: 996,
      nombreObligations: 8000
    });

    expect(run.ok).toBe(true);
    expect(run.rounded).toBe(80000);
  });

  it("applique la règle d'arrondi demandée", () => {
    const run = runTemplate(
      "amortissement-lineaire-periode.v1",
      { montantAEtaler: 80000, dureeMois: 96, moisEcoules: 4 },
      "cent"
    );

    expect(run.rounded).toBe(3333.33);
    expect(applyRounding(3333.3333, "unit")).toBe(3333);
    expect(applyRounding(3333.3333, "none")).toBe(3333.3333);
  });

  it("refuse une entrée manquante, hors bornes ou non déclarée", () => {
    expect(runTemplate("prime-remboursement-totale.v1", { prixRemboursement: 1006 }).ok).toBe(false);
    expect(
      runTemplate("coupon-annuel-unitaire.v1", { valeurNominale: 1000, tauxInteret: 5 }).error
    ).toContain("supérieure au maximum");
    expect(
      runTemplate("prime-remboursement-unitaire.v1", {
        prixRemboursement: 1006,
        prixEmission: 996,
        surprise: 1
      }).error
    ).toContain("non déclarée");
  });

  it("refuse une division par zéro plutôt que de produire un infini", () => {
    const run = runTemplate("amortissement-prorata-interets.v1", {
      montantAEtaler: 80000,
      interetsCourus: 0,
      interetsTotaux: 0
    });

    expect(run.ok).toBe(false);
    expect(run.error).toContain("division par zéro");
  });

  it("refuse un identifiant de template absent du registre", () => {
    const run = runTemplate("eval-arbitraire.v1", {});
    expect(run.ok).toBe(false);
    expect(run.error).toContain("inconnu");
  });
});

describe("moteur de validation — écritures comptables", () => {
  it("accepte une écriture équilibrée avec ses comptes requis", () => {
    const result = validate(journalEntryPayload());
    expect(result.passed).toBe(true);
  });

  it("refuse une écriture déséquilibrée", () => {
    const result = validate(
      journalEntryPayload({
        expectedLines: [
          {
            accountNumber: "4671",
            accountLabel: "Obligataires, obligations à placer",
            debit: 7968000,
            credit: 0,
            lineExplanation: "Créance au prix d'émission."
          },
          {
            accountNumber: "163",
            accountLabel: "Autres emprunts obligataires",
            debit: 0,
            credit: 8048000,
            lineExplanation: "Dette au prix de remboursement."
          }
        ],
        requiredAccounts: ["163", "4671"],
        expectedTotalDebit: 7968000,
        expectedTotalCredit: 8048000
      })
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "ecriture-desequilibree")).toBe(true);
  });

  it("refuse un total déclaré qui ne correspond pas aux lignes", () => {
    const result = validate(journalEntryPayload({ expectedTotalDebit: 1 }));
    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "total-declare-faux")).toBe(true);
  });

  it("refuse une écriture à laquelle manque un compte requis", () => {
    const result = validate(journalEntryPayload({ requiredAccounts: ["163", "169", "4671", "512"] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "compte-requis-absent")).toBe(true);
  });

  it("refuse dès le schéma une ligne à la fois au débit et au crédit", () => {
    const result = validate(
      journalEntryPayload({
        expectedLines: [
          {
            accountNumber: "163",
            accountLabel: "Autres emprunts obligataires",
            debit: 100,
            credit: 100,
            lineExplanation: "Ligne impossible."
          },
          {
            accountNumber: "169",
            accountLabel: "Primes de remboursement",
            debit: 0,
            credit: 100,
            lineExplanation: "Contrepartie."
          }
        ]
      })
    );

    expect(result.passed).toBe(false);
  });
});

describe("moteur de validation — mini-cas", () => {
  const baseStep = {
    objective: "Calculer la prime de remboursement totale de l'emprunt.",
    statement: "La société émet 8 000 obligations à 996 €, remboursables à 1 006 €. Calculer la prime totale.",
    exerciseType: "calculation" as const,
    answerSpecification: {
      kind: "calculation" as const,
      expectedValue: 80000,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent" as const
    },
    hintLevels: [],
    explanation: "La prime unitaire vaut 10 €, soit 80 000 € au total.",
    gradingRubric: [{ label: "Résultat exact", points: 5 }],
    sourceReferences: [dataReference]
  };

  function casePayload(steps: unknown[]): ContentPayload {
    return {
      contentType: "progressive_case",
      content: {
        title: "Dossier CSP",
        context: "La société CSP émet un emprunt obligataire et doit le comptabiliser jusqu'à l'inventaire.",
        sharedData: [],
        steps,
        finalSynthesis: "L'emprunt figure au passif pour son prix de remboursement, la prime étant amortie.",
        competencyTags: ["cg-emprunts-obligataires"],
        sourceReferences: [dataReference],
        difficulty: 3,
        estimatedMinutes: 30
      }
    } as ContentPayload;
  }

  it("accepte un cas dont les étapes progressent", () => {
    const result = validate(
      casePayload([
        { ...baseStep, id: "etape-1", order: 1, prerequisiteStepIds: [] },
        { ...baseStep, id: "etape-2", order: 2, prerequisiteStepIds: ["etape-1"] }
      ])
    );

    expect(result.passed).toBe(true);
  });

  it("refuse une dépendance vers une étape ultérieure", () => {
    const result = validate(
      casePayload([
        { ...baseStep, id: "etape-1", order: 1, prerequisiteStepIds: ["etape-2"] },
        { ...baseStep, id: "etape-2", order: 2, prerequisiteStepIds: [] }
      ])
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "dependance-circulaire")).toBe(true);
  });

  it("refuse une dépendance vers une étape inexistante", () => {
    const result = validate(
      casePayload([
        { ...baseStep, id: "etape-1", order: 1, prerequisiteStepIds: [] },
        { ...baseStep, id: "etape-2", order: 2, prerequisiteStepIds: ["etape-fantome"] }
      ])
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "prerequis-inconnu")).toBe(true);
  });

  it("refuse une spécification de réponse incohérente avec le type d'étape", () => {
    const result = validate(
      casePayload([
        { ...baseStep, id: "etape-1", order: 1, prerequisiteStepIds: [] },
        {
          ...baseStep,
          id: "etape-2",
          order: 2,
          exerciseType: "short_answer",
          prerequisiteStepIds: []
        }
      ])
    );

    expect(result.passed).toBe(false);
    expect(result.errors.some((issue) => issue.code === "specification-incoherente")).toBe(true);
  });
});
