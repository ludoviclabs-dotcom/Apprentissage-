import {
  CorpusIndex,
  type ContentDraft,
  type ContentDraftStatus,
  type ContentPayload,
  type CorpusDocument,
  type GenerationMode,
  type NormativeContext
} from "@finance/content-generation";

/**
 * Corpus et brouillons de test.
 *
 * LES BROUILLONS SONT EN MODE `live` PAR DÉFAUT. C'est la seule façon de tester
 * une publication réussie, puisque le garde refuse le mode `mock` — et c'est
 * précisément ce qu'un test doit pouvoir vérifier dans les deux sens.
 *
 * Les numéros de page ne sont pas 1..n, et la page 3 est marquée dégradée : rien
 * ne doit pouvoir « marcher par hasard », et le refus de publier un contenu
 * appuyé sur une extraction dégradée doit être exerçable.
 */

export const COURSE_DOC_ID = "e2e-pack-course";
export const REFERENCE_DOC_ID = "e2e-pack-reference";
export const EXERCISE_DOC_ID = "e2e-pack-exercise";

export const CHUNK_RULES = "e2e-chunk-rules";
export const CHUNK_ACCOUNTS = "e2e-chunk-accounts";
export const CHUNK_DEGRADED = "e2e-chunk-degraded";
export const CHUNK_DATA = "e2e-chunk-data";

const HASH_RULES = "a".repeat(64);
const HASH_ACCOUNTS = "b".repeat(64);
const HASH_DEGRADED = "d".repeat(64);
const HASH_DATA = "c".repeat(64);

const documents: CorpusDocument[] = [
  {
    documentId: COURSE_DOC_ID,
    packId: "e2e-pack",
    title: "[Fixture e2e] Emprunts obligataires - Fiche de cours",
    relativePath: "fixture/cours",
    category: "course",
    domainId: "comptabilite",
    chapterSlug: "les-emprunts-obligataires",
    pages: [
      { pageNumber: 1, degraded: false },
      { pageNumber: 2, degraded: false },
      { pageNumber: 3, degraded: true }
    ],
    chunks: [
      {
        id: CHUNK_RULES,
        documentId: COURSE_DOC_ID,
        pageStart: 1,
        pageEnd: 1,
        contentHash: HASH_RULES,
        content: "La valeur nominale est le montant sur lequel sont calculés les intérêts.",
        sectionTitle: "Définitions"
      },
      {
        id: CHUNK_ACCOUNTS,
        documentId: COURSE_DOC_ID,
        pageStart: 2,
        pageEnd: 2,
        contentHash: HASH_ACCOUNTS,
        content: "Le compte 163 est crédité du prix de remboursement, le 169 débité de la prime.",
        sectionTitle: "Comptabilisation"
      },
      {
        id: CHUNK_DEGRADED,
        documentId: COURSE_DOC_ID,
        pageStart: 3,
        pageEnd: 3,
        contentHash: HASH_DEGRADED,
        content: "Amortissement de la prime : compte 6861.",
        sectionTitle: "Amortissement"
      }
    ]
  },
  {
    documentId: EXERCISE_DOC_ID,
    packId: "e2e-pack",
    title: "[Fixture e2e] Emprunts obligataires - Mise en situation",
    relativePath: "fixture/exercice",
    category: "exercise",
    domainId: "comptabilite",
    chapterSlug: "les-emprunts-obligataires",
    pages: [{ pageNumber: 1, degraded: false }],
    chunks: [
      {
        id: CHUNK_DATA,
        documentId: EXERCISE_DOC_ID,
        pageStart: 1,
        pageEnd: 1,
        contentHash: HASH_DATA,
        content: "8 000 obligations de 1 000 €, prix d'émission 996 €, remboursement 1 006 €.",
        sectionTitle: "Données"
      }
    ]
  }
];

export const testCorpus = new CorpusIndex(documents);

/** Un corpus vide : tout y est introuvable, ce qui exerce le refus « source morte ». */
export const emptyCorpus = new CorpusIndex([]);

export const courseReference = {
  pack: "e2e-pack",
  documentId: COURSE_DOC_ID,
  documentTitle: "[Fixture e2e] Emprunts obligataires - Fiche de cours",
  sourceType: "course" as const,
  pageStart: 2,
  pageEnd: 2,
  chunkIds: [CHUNK_ACCOUNTS],
  sectionTitle: "Comptabilisation",
  excerpt: "Le compte 163 est crédité du prix de remboursement.",
  excerptHash: HASH_ACCOUNTS
};

export const degradedReference = {
  ...courseReference,
  pageStart: 3,
  pageEnd: 3,
  chunkIds: [CHUNK_DEGRADED],
  sectionTitle: "Amortissement",
  excerpt: "Amortissement de la prime : compte 6861.",
  excerptHash: HASH_DEGRADED
};

export const dataReference = {
  pack: "e2e-pack",
  documentId: EXERCISE_DOC_ID,
  documentTitle: "[Fixture e2e] Emprunts obligataires - Mise en situation",
  sourceType: "exercise" as const,
  pageStart: 1,
  pageEnd: 1,
  chunkIds: [CHUNK_DATA],
  sectionTitle: "Données",
  excerpt: "8 000 obligations de 1 000 €.",
  excerptHash: HASH_DATA
};

export function sheetContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Emprunts obligataires",
    slug: "emprunts-obligataires",
    chapter: "Emprunts obligataires",
    learningObjective: "Comptabiliser un emprunt obligataire de son émission à son remboursement.",
    prerequisites: ["Cycle de la facture", "Amortissements"],
    essentialRules: [
      {
        statement: "La dette obligataire est constatée au prix de remboursement, pas au prix d'émission.",
        rationale: "C'est le montant que la société devra effectivement verser.",
        sourceReferences: [courseReference]
      }
    ],
    accountMap: [
      {
        accountNumber: "163",
        label: "Autres emprunts obligataires",
        usage: "Crédité du prix de remboursement à la souscription.",
        side: "credit" as const,
        sourceReferences: [courseReference]
      }
    ],
    formulas: [
      {
        name: "Prime de remboursement totale",
        expression: "(prix de remboursement - prix d'émission) x nombre d'obligations",
        variableDefinitions: [{ symbol: "N", meaning: "nombre d'obligations", unit: "titres" }],
        unit: "€",
        roundingRule: "cent" as const,
        sourceReferences: [dataReference]
      }
    ],
    timelineSteps: [
      {
        order: 1,
        moment: "Émission",
        action: "Constatation de la dette et de la créance sur les obligataires.",
        accountsInvolved: ["163", "4671"],
        sourceReferences: [courseReference]
      }
    ],
    workedExample: {
      title: "Émission de 8 000 obligations",
      steps: [
        { kind: "data" as const, title: "Données", content: "8 000 obligations, émission 996 €, remboursement 1 006 €." },
        { kind: "calculation" as const, title: "Prime", content: "8 000 x 10 = 80 000 €." },
        { kind: "result" as const, title: "Résultat", content: "La prime totale s'élève à 80 000 €." }
      ],
      sourceReferences: [dataReference]
    },
    commonMistakes: [
      {
        mistake: "Constater la dette au prix d'émission.",
        correction: "La dette se constate au prix de remboursement ; l'écart est la prime.",
        sourceReferences: [courseReference]
      }
    ],
    activeRecallQuestions: [
      {
        question: "À quel prix la dette obligataire est-elle constatée ?",
        answer: "Au prix de remboursement.",
        sourceReferences: [courseReference]
      }
    ],
    summary:
      "L'emprunt obligataire se comptabilise au prix de remboursement, la prime étant amortie sur la durée.",
    sourceReferences: [courseReference],
    difficulty: 3,
    estimatedMinutes: 25,
    ...overrides
  };
}

export function calculationContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Prime de remboursement totale",
    statement:
      "La société émet 8 000 obligations, prix d'émission 996 €, prix de remboursement 1 006 €. Calculer la prime totale.",
    variables: [
      { name: "prixRemboursement", label: "Prix de remboursement", value: 1006, unit: "€", providedInStatement: true },
      { name: "prixEmission", label: "Prix d'émission", value: 996, unit: "€", providedInStatement: true },
      { name: "nombreObligations", label: "Nombre d'obligations", value: 8000, unit: "titres", providedInStatement: true }
    ],
    expectedAnswer: 80000,
    unit: "€",
    tolerance: 0.01,
    roundingRule: "cent" as const,
    formulaTemplateId: "prime-remboursement-totale.v1",
    templateInputs: { prixRemboursement: 1006, prixEmission: 996, nombreObligations: 8000 },
    calculationSteps: [{ order: 1, description: "Prime unitaire multipliée par le nombre d'obligations." }],
    explanation: "La prime mesure l'écart entre ce qui est encaissé et ce qui sera remboursé.",
    gradingRubric: [{ label: "Calcul exact", points: 10 }],
    competencyTags: ["cg-emprunts-obligataires"],
    sourceReferences: [dataReference],
    difficulty: 2,
    ...overrides
  };
}

export function journalContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Souscription de l'emprunt obligataire",
    statement: "Passer l'écriture de souscription de l'emprunt obligataire au journal de la société.",
    operationDate: "01/09/N",
    contextualData: [],
    expectedLines: [
      {
        accountNumber: "4671",
        accountLabel: "Obligataires, obligations à placer",
        debit: 7968000,
        credit: 0,
        lineExplanation: "Créance au prix d'émission."
      },
      {
        accountNumber: "169",
        accountLabel: "Primes de remboursement des obligations",
        debit: 80000,
        credit: 0,
        lineExplanation: "Prime de remboursement."
      },
      {
        accountNumber: "163",
        accountLabel: "Autres emprunts obligataires",
        debit: 0,
        credit: 8048000,
        lineExplanation: "Dette au prix de remboursement."
      }
    ],
    requiredAccounts: ["163", "169", "4671"],
    allowedAlternativeAccounts: [],
    expectedTotalDebit: 8048000,
    expectedTotalCredit: 8048000,
    gradingRubric: [{ label: "Écriture équilibrée", points: 10 }],
    competencyTags: ["cg-emprunts-obligataires"],
    explanation: "La prime comble l'écart entre le montant encaissé et la dette constatée.",
    sourceReferences: [courseReference],
    difficulty: 3,
    ...overrides
  };
}

export function diagnosisContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Une écriture d'émission suspecte",
    scenario:
      "Un stagiaire a passé l'écriture d'émission suivante pour 8 000 obligations émises à 996 € et remboursées 1 006 €.",
    proposedEntry: [
      {
        accountNumber: "4671",
        accountLabel: "Obligataires, obligations à placer",
        debit: 7968000,
        credit: 0,
        lineExplanation: "Créance."
      },
      {
        accountNumber: "163",
        accountLabel: "Autres emprunts obligataires",
        debit: 0,
        credit: 7968000,
        lineExplanation: "Dette au prix d'émission."
      }
    ],
    // Sans `as const` sur le tableau : le schéma attend une liste *mutable*, et
    // un tuple readonly ne s'y assigne pas. Les éléments sont typés un à un.
    errorCategories: [
      "wrong_amount" as const,
      "missing_line" as const,
      "no_error" as const
    ],
    expectedErrorCategory: "missing_line" as const,
    expectedCorrection: "Il manque la ligne 169 pour la prime de remboursement de 80 000 €.",
    explanation: "La dette se constate au prix de remboursement ; la contrepartie est la prime.",
    gradingRubric: [{ label: "Nature de l'erreur", points: 10 }],
    competencyTags: ["cg-emprunts-obligataires"],
    sourceReferences: [courseReference],
    difficulty: 3,
    ...overrides
  };
}

export function caseContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Emprunt obligataire de la société CSP",
    context: "La société CSP émet un emprunt obligataire le 1er septembre N.",
    sharedData: [{ label: "Nombre d'obligations", value: "8 000" }],
    steps: [
      {
        id: "prime",
        order: 1,
        objective: "Calculer la prime de remboursement totale.",
        statement: "Prix d'émission 996 €, prix de remboursement 1 006 €, 8 000 obligations.",
        exerciseType: "calculation" as const,
        answerSpecification: {
          kind: "calculation" as const,
          expectedValue: 80000,
          unit: "€",
          tolerance: 0.01,
          roundingRule: "cent" as const
        },
        hintLevels: [
          { level: 1, hint: "La prime est un écart de prix." },
          { level: 2, hint: "Prime unitaire = remboursement - émission." },
          { level: 3, hint: "Multiplier la prime unitaire par le nombre d'obligations." }
        ],
        explanation: "8 000 x (1 006 - 996) = 80 000 €.",
        gradingRubric: [{ label: "Calcul exact", points: 10 }],
        sourceReferences: [dataReference],
        prerequisiteStepIds: []
      },
      {
        id: "ecriture",
        order: 2,
        objective: "Passer l'écriture de souscription.",
        statement: "Enregistrer la souscription au journal.",
        exerciseType: "journal_entry" as const,
        answerSpecification: {
          kind: "journal_entry" as const,
          expectedLines: [
            {
              accountNumber: "4671",
              accountLabel: "Obligataires, obligations à placer",
              debit: 7968000,
              credit: 0,
              lineExplanation: "Créance."
            },
            {
              accountNumber: "169",
              accountLabel: "Primes de remboursement",
              debit: 80000,
              credit: 0,
              lineExplanation: "Prime."
            },
            {
              accountNumber: "163",
              accountLabel: "Autres emprunts obligataires",
              debit: 0,
              credit: 8048000,
              lineExplanation: "Dette."
            }
          ]
        },
        hintLevels: [{ level: 1, hint: "Trois comptes interviennent." }],
        explanation: "La prime comble l'écart entre encaissement et dette.",
        gradingRubric: [{ label: "Écriture juste", points: 10 }],
        sourceReferences: [courseReference],
        prerequisiteStepIds: ["prime"]
      }
    ],
    finalSynthesis: "L'émission constate une dette au prix de remboursement et une prime à amortir.",
    competencyTags: ["cg-emprunts-obligataires"],
    sourceReferences: [courseReference],
    difficulty: 4,
    estimatedMinutes: 30,
    ...overrides
  };
}

export interface DraftOptions {
  status?: ContentDraftStatus;
  /**
   * Le type vient du paquet de génération, et non d'une paire écrite ici.
   * L'énumération locale `"mock" | "live"` datait d'avant `manual-assisted` : les
   * tests qui l'employaient déjà ne compilaient que parce que les fichiers de
   * test sont hors du `include` du tsconfig, ce qui est exactement le genre de
   * divergence que ce correctif supprime ailleurs.
   */
  mode?: GenerationMode;
  chapterSlug?: string;
  validationPassed?: boolean;
  warnings?: Array<{ code: string; message: string; severity: "warning" }>;
  id?: string;
  /** `null` pour exercer explicitement le cas du référentiel non déclaré. */
  normativeContext?: NormativeContext | null;
}

/**
 * Le référentiel des brouillons de test.
 *
 * LES FIXTURES EMPLOIENT 4671, QUI N'EST PAS UN COMPTE DU PLAN. Le support de
 * cours le dit lui-même ; il reste utilisable comme subdivision de 467, à
 * condition de l'annoncer. Sans cette déclaration, le garde refuse désormais la
 * publication — et c'est le comportement attendu, pas un défaut de fixture :
 * publier un sous-compte comme s'il était prescrit est exactement ce que ce
 * modèle corrige.
 */
export function fixtureNormativeContext(payload: ContentPayload): NormativeContext {
  // La déclaration suit l'emploi : déclarer un sous-compte qu'un contenu
  // n'emploie pas est refusé, et à juste titre — elle décrirait alors un autre
  // contenu. Les fixtures qui n'emploient que des comptes du plan relèvent donc
  // simplement du référentiel en vigueur.
  const usesSubAccount = JSON.stringify(payload.content).includes("4671");

  return {
    profile: usesSubAccount ? "entity-specific" : "anc-2026-current",
    status: usesSubAccount ? "custom" : "current",
    effectiveFrom: "2026-01-01",
    scoringPolicy: "graded",
    // Un profil en vigueur nomme le référentiel qu'il suit : le garde le refuse
    // sinon, faute de quoi rien ne dirait quoi reprendre quand le plan changera.
    sourceVersionIds: [REFERENCE_DOC_ID],
    customAccountDisclosures: usesSubAccount
      ? [
          {
            accountNumber: "4671",
            parentAccount: "467",
            source: "course",
            label: "Obligataires, obligations à placer"
          }
        ]
      : [],
    versionConflictNotes: []
  };
}

/** Assemble un brouillon complet autour d'un contenu. */
export function draftFor(payload: ContentPayload, options: DraftOptions = {}): ContentDraft {
  const status = options.status ?? "approved";
  const passed = options.validationPassed ?? true;

  return {
    id: options.id ?? "e2e-draft-sheet",
    status,
    chapterSlug: options.chapterSlug ?? "les-emprunts-obligataires",
    chapterLabel: "Les emprunts obligataires",
    domainId: "comptabilite",
    title: (payload.content as { title?: string }).title ?? "Carte",
    difficulty: 3,
    generationMetadata: {
      provider: "openai",
      model: "gpt-test",
      promptId: "prompt-test",
      promptVersion: "v1",
      generatedAt: "2026-08-01T10:00:00.000Z",
      inputHash: "e".repeat(64),
      sourcePackId: "e2e-pack",
      documentIds: [COURSE_DOC_ID, EXERCISE_DOC_ID],
      chunkIds: [CHUNK_ACCOUNTS, CHUNK_DATA],
      mode: options.mode ?? "live",
      repairAttempts: 0
    },
    validationMetadata: {
      passed,
      validationVersion: "content-validation.v1",
      validatedAt: "2026-08-01T10:05:00.000Z",
      errors: passed ? [] : [{ code: "test", message: "échec simulé", severity: "error" }],
      warnings: options.warnings ?? [],
      qualityScore: passed ? 95 : 20,
      blockingReasons: passed ? [] : ["test : échec simulé"]
    },
    normativeContext:
      options.normativeContext === undefined ? fixtureNormativeContext(payload) : options.normativeContext,
    reviewMetadata: {
      reviewedBy: "relecteur@example.test",
      reviewedAt: "2026-08-01T11:00:00.000Z",
      revision: 1
    },
    history: [],
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    ...payload
  } as ContentDraft;
}

export function flashcardContent(overrides: Record<string, unknown> = {}) {
  return {
    type: "account" as const,
    front: "Quel compte est crédité à la souscription d'un emprunt obligataire ?",
    back: "Le compte 163, pour le prix de remboursement.",
    explanation: "La dette est constatée pour ce qui devra être remboursé, l'écart allant au compte 169.",
    learningObjective: "Mémoriser le compte de dette obligataire.",
    sourceReferences: [courseReference],
    difficulty: 2,
    tags: ["comptes"],
    relatedConceptIds: [],
    atomicityCheck: { testedFactCount: 1, singleFocus: true, justification: "Une seule notion testée." },
    ...overrides
  };
}

export const approvedFlashcardDraft = (): ContentDraft =>
  draftFor({ contentType: "flashcard", content: flashcardContent() } as ContentPayload, {
    id: "e2e-draft-flashcard"
  });

export const approvedSheetDraft = (): ContentDraft =>
  draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload);

export const approvedCalculationDraft = (): ContentDraft =>
  draftFor({ contentType: "calculation_exercise", content: calculationContent() } as ContentPayload, {
    id: "e2e-draft-calculation"
  });

export const approvedJournalDraft = (): ContentDraft =>
  draftFor({ contentType: "journal_entry_exercise", content: journalContent() } as ContentPayload, {
    id: "e2e-draft-journal"
  });

export const approvedDiagnosisDraft = (): ContentDraft =>
  draftFor({ contentType: "error_diagnosis_exercise", content: diagnosisContent() } as ContentPayload, {
    id: "e2e-draft-diagnosis"
  });

export const approvedCaseDraft = (): ContentDraft =>
  draftFor({ contentType: "progressive_case", content: caseContent() } as ContentPayload, {
    id: "e2e-draft-case"
  });
