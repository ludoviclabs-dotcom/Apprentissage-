import { describe, expect, it } from "vitest";
import type { ContentPayload } from "../src/types/artifact";
import type { NormativeContext } from "../src/types/normative-context";
import {
  MISSING_CONTEXT_CODE,
  NORMATIVE_MISMATCH_CODE,
  UNDECLARED_ACCOUNT_CODE,
  UNSOURCED_OFFICIAL_ACCOUNT_CODE,
  WRONG_PARENT_CODE,
  checkNormativeContext,
  classifyNormativeContext
} from "../src/validation/normative";
import { collectVersionedAccounts, distinctAccountNumbers } from "../src/validation/normative-accounts";
import { validateContent } from "../src/validation/engine";
import {
  journalEntryPayload,
  officialReference,
  testCorpus,
  validReference
} from "./fixtures";

/**
 * Versionnement normatif : ce que chaque profil a le droit d'affirmer.
 *
 * Les écritures ci-dessous ne cherchent pas à être justes comptablement — elles
 * cherchent à être *typées* : un traitement actuel, un traitement historique, un
 * mélange des deux. C'est le mélange qui doit être refusé, et il ne peut l'être
 * que si les trois cas sont exerçables côte à côte.
 */

function context(overrides: Partial<NormativeContext> = {}): NormativeContext {
  return {
    profile: "anc-2026-current",
    status: "current",
    effectiveFrom: "2026-01-01",
    scoringPolicy: "graded",
    sourceVersionIds: [],
    customAccountDisclosures: [],
    versionConflictNotes: [],
    ...overrides
  };
}

/** L'étalement des frais d'émission, dans sa forme actuelle : 481 puis 6862. */
function currentSpreadPayload(overrides: Record<string, unknown> = {}): ContentPayload {
  return journalEntryPayload({
    title: "Dotation aux amortissements des frais d'émission",
    expectedLines: [
      {
        accountNumber: "6862",
        accountLabel: "Dotations aux amortissements des frais d'émission des emprunts",
        debit: 20000,
        credit: 0,
        lineExplanation: "Quote-part de l'exercice."
      },
      {
        accountNumber: "481",
        accountLabel: "Charges à répartir sur plusieurs exercices",
        debit: 0,
        credit: 20000,
        lineExplanation: "Amortissement des frais étalés."
      }
    ],
    requiredAccounts: ["481", "6862"],
    expectedTotalDebit: 20000,
    expectedTotalCredit: 20000,
    sourceReferences: [validReference, officialReference],
    ...overrides
  });
}

/** Le même étalement tel que le support d'origine l'enregistre : 4816 et 6812. */
function legacySpreadPayload(overrides: Record<string, unknown> = {}): ContentPayload {
  return journalEntryPayload({
    title: "Dotation aux amortissements des frais d'émission (support d'origine)",
    expectedLines: [
      {
        accountNumber: "6812",
        accountLabel: "Dotations aux amortissements des charges d'exploitation à répartir",
        debit: 20000,
        credit: 0,
        lineExplanation: "Quote-part de l'exercice, nomenclature du support."
      },
      {
        accountNumber: "4816",
        accountLabel: "Frais d'émission des emprunts",
        debit: 0,
        credit: 20000,
        lineExplanation: "Amortissement des frais étalés."
      }
    ],
    requiredAccounts: ["4816", "6812"],
    expectedTotalDebit: 20000,
    expectedTotalCredit: 20000,
    ...overrides
  });
}

const LEGACY_CONFLICT_NOTE = {
  code: "compte-remplace",
  severity: "warning" as const,
  message: "Traitement remplacé au 1er janvier 2026 : 481 et 6862 tiennent désormais ce rôle.",
  sourceIds: []
};

const legacyContext = (): NormativeContext =>
  context({
    profile: "course-original",
    status: "legacy",
    effectiveFrom: undefined,
    effectiveTo: "2025-12-31",
    scoringPolicy: "comparison-only",
    supersededByProfile: "anc-2026-current",
    customAccountDisclosures: [
      {
        accountNumber: "4816",
        parentAccount: "481",
        source: "course",
        label: "Frais d'émission des emprunts"
      }
    ],
    versionConflictNotes: [LEGACY_CONFLICT_NOTE]
  });

function codesOf(result: { errors: Array<{ code: string }> }): string[] {
  return result.errors.map((problem) => problem.code);
}

describe("profil ANC 2026 — ce qui est en vigueur", () => {
  it("accepte le traitement actuel des frais d'émission par 481 et 6862", () => {
    const result = checkNormativeContext({
      payload: currentSpreadPayload(),
      normativeContext: context()
    });

    expect(result.errors).toEqual([]);
    expect(distinctAccountNumbers(result.occurrences)).toContain("481");
    expect(distinctAccountNumbers(result.occurrences)).toContain("6862");
  });

  it("refuse le compte 791, dont le mécanisme n'existe plus", () => {
    const payload = currentSpreadPayload({
      expectedLines: [
        {
          accountNumber: "481",
          accountLabel: "Charges à répartir sur plusieurs exercices",
          debit: 100000,
          credit: 0,
          lineExplanation: "Frais étalés."
        },
        {
          accountNumber: "791",
          accountLabel: "Transferts de charges d'exploitation",
          debit: 0,
          credit: 100000,
          lineExplanation: "Virement des frais engagés."
        }
      ],
      requiredAccounts: ["481", "791"],
      expectedTotalDebit: 100000,
      expectedTotalCredit: 100000
    });

    const result = checkNormativeContext({ payload, normativeContext: context() });

    expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
    expect(result.errors.some((problem) => problem.message.includes("791"))).toBe(true);
  });

  it("refuse 6862 et 6812 pour une même dotation, quel que soit le profil", () => {
    const payload = currentSpreadPayload({
      expectedLines: [
        {
          accountNumber: "6862",
          accountLabel: "Dotations aux amortissements des frais d'émission des emprunts",
          debit: 10000,
          credit: 0,
          lineExplanation: "Quote-part, nomenclature actuelle."
        },
        {
          accountNumber: "6812",
          accountLabel: "Dotations aux amortissements des charges à répartir",
          debit: 10000,
          credit: 0,
          lineExplanation: "Quote-part, nomenclature du support."
        },
        {
          accountNumber: "481",
          accountLabel: "Charges à répartir sur plusieurs exercices",
          debit: 0,
          credit: 20000,
          lineExplanation: "Amortissement des frais étalés."
        }
      ],
      requiredAccounts: ["481", "6862", "6812"],
      expectedTotalDebit: 20000,
      expectedTotalCredit: 20000
    });

    // Le refus tient même sans référentiel déclaré : additionner deux dotations
    // qui se remplacent est faux quel que soit le plan comptable invoqué.
    for (const normativeContext of [context(), null]) {
      const result = checkNormativeContext({ payload, normativeContext });

      expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
    }
  });

  it("refuse un contenu courant qui ne cite aucune référence officielle", () => {
    const result = checkNormativeContext({
      payload: currentSpreadPayload({ sourceReferences: [validReference] }),
      normativeContext: context()
    });

    expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
    expect(
      result.errors.some((problem) => problem.message.includes("aucune référence officielle"))
    ).toBe(true);
  });
});

describe("profil support d'origine — ce qui a été remplacé", () => {
  it("conserve le traitement historique sans le refuser", () => {
    const result = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: legacyContext()
    });

    expect(result.errors).toEqual([]);
  });

  it("impose la politique « comparaison seule »", () => {
    const result = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: legacyContext()
    });

    expect(legacyContext().scoringPolicy).toBe("comparison-only");
    expect(result.errors).toEqual([]);

    const graded = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: { ...legacyContext(), scoringPolicy: "graded" }
    });

    expect(codesOf(graded)).toContain(NORMATIVE_MISMATCH_CODE);
  });

  it("refuse qu'une réponse attendue historique serve à noter", () => {
    const result = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: { ...legacyContext(), scoringPolicy: "graded" }
    });

    expect(
      result.errors.some((problem) => problem.message.includes("la réponse attendue emploie le compte"))
    ).toBe(true);
  });

  it("refuse de présenter un traitement remplacé sans note de divergence", () => {
    const result = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: { ...legacyContext(), versionConflictNotes: [] }
    });

    expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
    expect(result.errors.some((problem) => problem.message.includes("note de divergence"))).toBe(true);
  });

  it("refuse un profil dont le statut ne correspond pas", () => {
    const result = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: { ...legacyContext(), status: "current" }
    });

    expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
  });
});

describe("sous-comptes — déclarés ou refusés", () => {
  it("exige que 4816 soit déclaré comme subdivision de 481", () => {
    const undeclared = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: { ...legacyContext(), customAccountDisclosures: [] }
    });

    expect(codesOf(undeclared)).toContain(UNDECLARED_ACCOUNT_CODE);

    const wrongParent = checkNormativeContext({
      payload: legacySpreadPayload(),
      normativeContext: {
        ...legacyContext(),
        customAccountDisclosures: [
          {
            accountNumber: "4816",
            parentAccount: "486",
            source: "course",
            label: "Frais d'émission des emprunts"
          }
        ]
      }
    });

    expect(codesOf(wrongParent)).toContain(WRONG_PARENT_CODE);
  });

  it("exige que 4671 soit déclaré comme subdivision de 467", () => {
    // `journalEntryPayload` emploie 4671 : c'est le cas réel du chapitre.
    const undeclared = checkNormativeContext({
      payload: journalEntryPayload(),
      normativeContext: context({ profile: "entity-specific", status: "custom" })
    });

    expect(codesOf(undeclared)).toContain(UNDECLARED_ACCOUNT_CODE);

    const declared = checkNormativeContext({
      payload: journalEntryPayload(),
      normativeContext: context({
        profile: "entity-specific",
        status: "custom",
        customAccountDisclosures: [
          {
            accountNumber: "4671",
            parentAccount: "467",
            source: "course",
            label: "Obligataires, obligations à placer"
          }
        ]
      })
    });

    expect(declared.errors).toEqual([]);
  });

  it("refuse un sous-compte du support dans le profil en vigueur", () => {
    const result = checkNormativeContext({
      payload: journalEntryPayload({ sourceReferences: [validReference, officialReference] }),
      normativeContext: context({
        customAccountDisclosures: [
          {
            accountNumber: "4671",
            parentAccount: "467",
            source: "course",
            label: "Obligataires, obligations à placer"
          }
        ]
      })
    });

    expect(codesOf(result)).toContain(NORMATIVE_MISMATCH_CODE);
  });

  it("refuse une déclaration qui ne correspond à aucun compte employé", () => {
    const result = checkNormativeContext({
      payload: currentSpreadPayload(),
      normativeContext: context({
        customAccountDisclosures: [
          {
            accountNumber: "4671",
            parentAccount: "467",
            source: "entity-plan",
            label: "Sous-compte d'une autre écriture"
          }
        ]
      })
    });

    expect(codesOf(result)).toContain(UNDECLARED_ACCOUNT_CODE);
  });
});

describe("compte 512 — un intitulé qui vient du plan de comptes", () => {
  const bankPayload = (references: unknown[]) =>
    journalEntryPayload({
      title: "Versement des fonds",
      expectedLines: [
        {
          accountNumber: "512",
          accountLabel: "Banques",
          debit: 7868000,
          credit: 0,
          lineExplanation: "Montant net encaissé."
        },
        {
          accountNumber: "163",
          accountLabel: "Autres emprunts obligataires",
          debit: 0,
          credit: 7868000,
          lineExplanation: "Dette constatée."
        }
      ],
      requiredAccounts: ["163", "512"],
      expectedTotalDebit: 7868000,
      expectedTotalCredit: 7868000,
      sourceReferences: references
    });

  it("refuse le compte 512 quand aucune référence officielle n'est citée", () => {
    const result = checkNormativeContext({
      payload: bankPayload([validReference]),
      normativeContext: context({ profile: "entity-specific", status: "custom" })
    });

    expect(codesOf(result)).toContain(UNSOURCED_OFFICIAL_ACCOUNT_CODE);
  });

  it("accepte le compte 512 relié au plan de comptes officiel", () => {
    const result = checkNormativeContext({
      payload: bankPayload([validReference, officialReference]),
      normativeContext: context()
    });

    expect(result.errors).toEqual([]);
  });
});

describe("référentiel absent — averti, jamais supposé", () => {
  it("signale sans refuser un contenu qui n'en déclare pas", () => {
    const result = checkNormativeContext({ payload: journalEntryPayload(), normativeContext: null });

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((problem) => problem.code)).toContain(MISSING_CONTEXT_CODE);
  });

  it("laisse lisibles les brouillons antérieurs au modèle", () => {
    // Le contrôle complet, celui qui décide du statut d'un brouillon : sans
    // référentiel déclaré, un contenu écrit avant ce modèle continue de passer.
    const result = validateContent({ payload: journalEntryPayload(), corpus: testCorpus });

    expect(result.passed).toBe(true);
    expect(result.warnings.map((problem) => problem.code)).toContain(MISSING_CONTEXT_CODE);
  });

  it("ne dit rien d'un contenu qui n'emploie aucun compte versionné", () => {
    const payload = currentSpreadPayload({
      expectedLines: [
        {
          accountNumber: "163",
          accountLabel: "Autres emprunts obligataires",
          debit: 1000,
          credit: 0,
          lineExplanation: "Remboursement."
        },
        {
          accountNumber: "169",
          accountLabel: "Primes de remboursement des obligations",
          debit: 0,
          credit: 1000,
          lineExplanation: "Prime amortie."
        }
      ],
      requiredAccounts: ["163", "169"],
      expectedTotalDebit: 1000,
      expectedTotalCredit: 1000
    });

    const result = checkNormativeContext({ payload, normativeContext: null });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("relevé des comptes versionnés", () => {
  it("distingue un compte d'une tranche de montant", () => {
    const payload = currentSpreadPayload({
      statement:
        "Les frais s'élèvent à 1 791 200 € et sont étalés. Préciser le compte employé pour la dotation.",
      explanation: "Le montant de 1 791 200 € ne désigne aucun compte ; la dotation passe par 6862."
    });

    const found = distinctAccountNumbers(collectVersionedAccounts(payload));

    expect(found).not.toContain("791");
    expect(found).toContain("6862");
  });

  it("relève un compte cité dans un texte, sans le confondre avec un attendu", () => {
    const payload = currentSpreadPayload({
      explanation:
        "Le support d'origine virait ces frais par le compte 791, ce que le plan en vigueur ne prévoit plus."
    });

    const occurrences = collectVersionedAccounts(payload);
    const inText = occurrences.filter((occurrence) => occurrence.accountNumber === "791");

    expect(inText).toHaveLength(1);
    expect(inText[0].structured).toBe(false);
  });
});

describe("classement automatique", () => {
  it("propose le support d'origine pour un contenu qui emploie un compte remplacé", () => {
    const classification = classifyNormativeContext(legacySpreadPayload());

    expect(classification.proposedProfile).toBe("course-original");
    expect(classification.proposedScoringPolicy).toBe("comparison-only");
    expect(classification.legacyAccounts).toContain("6812");
  });

  it("propose une déclaration de sous-compte avec son parent officiel", () => {
    const classification = classifyNormativeContext(journalEntryPayload());

    expect(classification.proposedProfile).toBe("entity-specific");
    expect(classification.proposedDisclosures).toEqual([
      {
        accountNumber: "4671",
        parentAccount: "467",
        source: "course",
        label: "Obligataires, obligations à placer (subdivision du support)"
      }
    ]);
  });

  it("propose le référentiel en vigueur quand rien ne diverge", () => {
    const classification = classifyNormativeContext(currentSpreadPayload());

    expect(classification.proposedProfile).toBe("anc-2026-current");
    expect(classification.ambiguous).toBe(false);
  });

  it("signale comme ambigu ce qui demande un arbitrage humain", () => {
    const classification = classifyNormativeContext(
      currentSpreadPayload({ sourceReferences: [validReference] })
    );

    expect(classification.proposedProfile).toBe("anc-2026-current");
    expect(classification.ambiguous).toBe(false);

    const bankWithoutReference = classifyNormativeContext(
      journalEntryPayload({
        expectedLines: [
          {
            accountNumber: "512",
            accountLabel: "Banques",
            debit: 100,
            credit: 0,
            lineExplanation: "Encaissement."
          },
          {
            accountNumber: "163",
            accountLabel: "Autres emprunts obligataires",
            debit: 0,
            credit: 100,
            lineExplanation: "Dette."
          }
        ],
        requiredAccounts: ["163", "512"],
        expectedTotalDebit: 100,
        expectedTotalCredit: 100,
        sourceReferences: [validReference]
      })
    );

    expect(bankWithoutReference.ambiguous).toBe(true);
  });

  it("ne touche jamais à la réponse attendue", () => {
    const payload = legacySpreadPayload();
    const before = JSON.stringify(payload);

    classifyNormativeContext(payload);

    expect(JSON.stringify(payload)).toBe(before);
  });
});
