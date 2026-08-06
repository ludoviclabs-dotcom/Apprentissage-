import { CorpusIndex, type CorpusDocument } from "../src/types/source-reference";
import type { ContentPayload } from "../src/types/artifact";

/**
 * Corpus minimal partagé par les tests : deux documents, des pages numérotées
 * autrement que 1..n pour que rien ne puisse « marcher par hasard », et une page
 * marquée dégradée.
 */

export const COURSE_DOC_ID = "test-pack-aaaaaaaaaaaa";
export const EXERCISE_DOC_ID = "test-pack-bbbbbbbbbbbb";

export const CHUNK_RULES = "chunk-rules0000000000";
export const CHUNK_ACCOUNTS = "chunk-accounts000000";
export const CHUNK_DATA = "chunk-data0000000000";

const HASH_RULES = "a".repeat(64);
const HASH_ACCOUNTS = "b".repeat(64);
const HASH_DATA = "c".repeat(64);

const documents: CorpusDocument[] = [
  {
    documentId: COURSE_DOC_ID,
    packId: "test-pack",
    title: "Les emprunts obligataires - Fiche de cours",
    relativePath: "comptabilite/cours.pdf",
    category: "course",
    domainId: "compta-generale",
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
        sectionTitle: "Sans titre"
      },
      {
        id: CHUNK_ACCOUNTS,
        documentId: COURSE_DOC_ID,
        pageStart: 2,
        pageEnd: 2,
        contentHash: HASH_ACCOUNTS,
        content: "Le compte 163 est crédité du prix de remboursement, le 169 débité de la prime.",
        sectionTitle: "Sans titre"
      }
    ]
  },
  {
    documentId: EXERCISE_DOC_ID,
    packId: "test-pack",
    title: "Les emprunts obligataires - Mise en situation",
    relativePath: "comptabilite/exercice.pdf",
    category: "exercise",
    domainId: "compta-generale",
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
        sectionTitle: "Sans titre"
      }
    ]
  }
];

export const testCorpus = new CorpusIndex(documents);

export const validReference = {
  pack: "test-pack",
  documentId: COURSE_DOC_ID,
  documentTitle: "Les emprunts obligataires - Fiche de cours",
  // Le document est classé « course » : la nature doit le refléter.
  sourceType: "course" as const,
  pageStart: 2,
  pageEnd: 2,
  chunkIds: [CHUNK_ACCOUNTS],
  excerptHash: HASH_ACCOUNTS
};

export const dataReference = {
  pack: "test-pack",
  documentId: EXERCISE_DOC_ID,
  documentTitle: "Les emprunts obligataires - Mise en situation",
  sourceType: "exercise" as const,
  pageStart: 1,
  pageEnd: 1,
  chunkIds: [CHUNK_DATA],
  excerptHash: HASH_DATA
};

export function flashcardPayload(overrides: Record<string, unknown> = {}): ContentPayload {
  return {
    contentType: "flashcard",
    content: {
      type: "account",
      front: "Quel compte est crédité à la souscription d'un emprunt obligataire ?",
      back: "Le compte 163, pour le prix de remboursement.",
      explanation: "La dette est constatée pour ce qui devra être remboursé, l'écart allant au compte 169.",
      learningObjective: "Mémoriser le compte de dette obligataire.",
      sourceReferences: [validReference],
      difficulty: 2,
      tags: [],
      relatedConceptIds: [],
      atomicityCheck: { testedFactCount: 1, singleFocus: true, justification: "Une seule notion testée." },
      ...overrides
    }
  } as ContentPayload;
}

export function calculationPayload(overrides: Record<string, unknown> = {}): ContentPayload {
  return {
    contentType: "calculation_exercise",
    content: {
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
      roundingRule: "cent",
      formulaTemplateId: "prime-remboursement-totale.v1",
      templateInputs: { prixRemboursement: 1006, prixEmission: 996, nombreObligations: 8000 },
      calculationSteps: [{ order: 1, description: "Prime unitaire multipliée par le nombre d'obligations." }],
      explanation: "La prime mesure l'écart entre ce qui est encaissé et ce qui sera remboursé.",
      gradingRubric: [{ label: "Calcul exact", points: 10 }],
      competencyTags: ["cg-emprunts-obligataires"],
      sourceReferences: [dataReference],
      difficulty: 2,
      ...overrides
    }
  } as ContentPayload;
}

export function journalEntryPayload(overrides: Record<string, unknown> = {}): ContentPayload {
  return {
    contentType: "journal_entry_exercise",
    content: {
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
      sourceReferences: [validReference],
      difficulty: 3,
      ...overrides
    }
  } as ContentPayload;
}
