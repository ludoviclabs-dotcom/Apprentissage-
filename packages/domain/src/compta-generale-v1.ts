import type { AuthoredExerciseVersion } from "./exercise-specs";
import type { ModuleLevelDefinition } from "./curriculum";
import type { Competency, Exercise, SourceReference } from "./types";

/**
 * Comptabilité générale v1 — the first track built to be finished.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE EXISTING COMPTA CONTENT. The twelve
 * `compta-generale` exercises already in `compta-v1.ts` are prose questions with
 * `{ label, points }` rubrics and no authored specification, so every one of them
 * still grades through `legacy_rubric` — the word matcher PR-03 exists to
 * replace. Each exercise here ships a typed specification instead, so the mark is
 * computed from what the learner actually posted: the accounts, the side, the
 * amounts, the balance. Nothing in this file is graded by looking for words.
 *
 * THE TOPICS ARE THE ONES A BEGINNER MEETS FIRST, in the order they meet them:
 * an invoice in, an invoice out, the bank, then VAT and a fixed asset. That is
 * also why the amounts are small and round — the exercise is the accounting
 * treatment, not the arithmetic.
 *
 * ONE COMPANY, ONE MONTH. Five of the fourteen exercises share a narrative — the
 * SARL Vélo Cité in March — and those five are the mini-case, in order. Reusing
 * them rather than authoring a parallel set is deliberate: a case study whose
 * content nobody has seen is a second syllabus to maintain, and a learner who has
 * done the drills should recognise the transactions when they meet them as a
 * month's work.
 */

// PR-12a : les références pointent vers des assets seedés qui existent
// réellement (`resolveSourceReference` dans learning.ts). Le pack
// "pack-compta-generale" cité jusqu'ici n'existait dans aucun catalogue.
const pcgSource: SourceReference = {
  pack: "pcg-anc-2026",
  document: "Plan comptable général — comptes et fonctionnement",
  sourceType: "official-reference",
  pageStart: 41,
  pageEnd: 58,
  effectiveDate: "2026-01-01"
};

const coursSource: SourceReference = {
  pack: "cours-master-2025",
  document: "Cours — opérations courantes et TVA",
  sourceType: "course",
  pageStart: 12,
  pageEnd: 34,
  effectiveDate: "2025-09-01"
};

export const comptaGeneraleV1Sources: SourceReference[] = [pcgSource, coursSource];

// --- Competencies ----------------------------------------------------------
//
// Two additions only. `cg-operations-courantes` already exists in `compta-v1.ts`
// and covers the invoice cycle, so redeclaring it would split one skill across
// two ids and make progression on it unreadable.

export const comptaGeneraleV1Competencies: Competency[] = [
  {
    id: "cg-tva",
    domainId: "compta-generale",
    name: "Liquider et déclarer la TVA",
    levelMin: 1,
    levelMax: 2,
    status: "not-started",
    strength: 0,
    focus: "Séparer TVA collectée, déductible sur biens et services, et déductible sur immobilisations."
  },
  {
    id: "cg-immobilisations",
    domainId: "compta-generale",
    name: "Comptabiliser une immobilisation et son amortissement",
    levelMin: 2,
    levelMax: 2,
    status: "not-started",
    strength: 0,
    focus: "Distinguer le compte 404 du 401, et amortir au prorata temporis."
  }
];

// --- Levels ----------------------------------------------------------------

export const COMPTA_GENERALE_V1_TRACK = "track-compta-generale-v1";

/**
 * A new track rather than new levels on `track-compta-generale`.
 *
 * Enrolment is per `(user, track)` and pins a curriculum version, so adding a
 * track leaves every learner already progressing through the provisions track
 * exactly where they were. Levels are numbered from 1 within the track, which is
 * what `assertValidCurriculum` requires.
 */
export const comptaGeneraleV1Levels: ModuleLevelDefinition[] = [
  {
    id: "level-compta-generale-v1-1",
    trackId: COMPTA_GENERALE_V1_TRACK,
    moduleId: "module-compta-generale-v1",
    domainId: "compta-generale",
    level: 1,
    title: "Achats, ventes et TVA",
    objective: "Enregistrer une facture d'achat et de vente, TVA comprise, et encaisser un client.",
    competencyIds: ["cg-operations-courantes", "cg-tva"],
    criticalCompetencyIds: ["cg-operations-courantes"],
    estimatedMinutes: 120,
    publicationStatus: "published"
  },
  {
    id: "level-compta-generale-v1-2",
    trackId: COMPTA_GENERALE_V1_TRACK,
    moduleId: "module-compta-generale-v1",
    domainId: "compta-generale",
    level: 2,
    title: "Banque, immobilisations et déclaration de TVA",
    objective: "Suivre la banque, immobiliser un bien, l'amortir et liquider la TVA du mois.",
    competencyIds: ["cg-tva", "cg-immobilisations"],
    criticalCompetencyIds: ["cg-immobilisations"],
    estimatedMinutes: 150,
    publicationStatus: "published"
  }
];

// --- Exercises -------------------------------------------------------------

interface ExerciseSeed {
  id: string;
  level: 1 | 2;
  minutes: number;
  title: string;
  statement: string;
  expectedAnswer: string;
  competencyIds: string[];
  rubric: Array<{ label: string; points: number }>;
}

function toExercise(seed: ExerciseSeed, type: Exercise["type"]): Exercise {
  return {
    id: seed.id,
    domainId: "compta-generale",
    type,
    title: seed.title,
    level: seed.level,
    estimatedMinutes: seed.minutes,
    statement: seed.statement,
    expectedAnswer: seed.expectedAnswer,
    rubric: seed.rubric,
    competencyIds: seed.competencyIds,
    sourceChunkIds: []
  };
}

/**
 * Criteria weights for a journal entry, shared so one badly-posted line costs the
 * same everywhere. The defaults in the evaluator are 4/3/4/2; these are the same
 * shape, restated here so a change is visible in the content rather than hidden
 * in the engine.
 */
const JOURNAL_POINTS = { accounts: 4, direction: 3, amounts: 4, balance: 2 };

/** Every entry in this module is to the cent, so no tolerance is granted. */
const JOURNAL_TOLERANCE = 0;

export const comptaGeneraleV1Exercises: Exercise[] = [
  // --- N1 : le cycle de la facture ----------------------------------------
  toExercise(
    {
      id: "ex-cgv1-achat-marchandises",
      level: 1,
      minutes: 8,
      title: "Facture d'achat de marchandises (SARL Vélo Cité)",
      statement:
        "SARL Vélo Cité, 4 mars N. Facture n° F-2031 du fournisseur Cyclo Pro : 60 pneus à 20,00 € HT l'unité, TVA 20 %, payable à 30 jours.\nPassez l'écriture d'achat au journal.",
      expectedAnswer:
        "Débit 607 Achats de marchandises 1 200,00 ; débit 44566 TVA déductible sur biens et services 240,00 ; crédit 401 Fournisseurs 1 440,00.\nLa dette est TTC : le fournisseur réclame la TVA, l'entreprise la récupère auprès de l'État.",
      competencyIds: ["cg-operations-courantes", "cg-tva"],
      rubric: [
        { label: "Comptes 607, 44566 et 401", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montants HT, TVA et TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-vente-marchandises",
      level: 1,
      minutes: 8,
      title: "Facture de vente de marchandises (SARL Vélo Cité)",
      statement:
        "SARL Vélo Cité, 11 mars N. Facture n° 2026-114 au client Sport Loisirs : 2 000,00 € HT de marchandises, TVA 20 %, payable à 30 jours.\nPassez l'écriture de vente au journal.",
      expectedAnswer:
        "Débit 411 Clients 2 400,00 ; crédit 707 Ventes de marchandises 2 000,00 ; crédit 44571 TVA collectée 400,00.\nLa créance est TTC ; la TVA collectée est une dette envers l'État, jamais un produit.",
      competencyIds: ["cg-operations-courantes", "cg-tva"],
      rubric: [
        { label: "Comptes 411, 707 et 44571", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montants HT, TVA et TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-reglement-client",
      level: 1,
      minutes: 5,
      title: "Encaissement d'un client par virement (SARL Vélo Cité)",
      statement:
        "SARL Vélo Cité, 28 mars N. Le client Sport Loisirs règle par virement la facture 2026-114 de 2 400,00 € TTC.\nPassez l'écriture d'encaissement.",
      expectedAnswer:
        "Débit 512 Banque 2 400,00 ; crédit 411 Clients 2 400,00.\nAucune TVA n'apparaît : elle a été constatée à la facturation, l'encaissement ne fait que solder la créance.",
      competencyIds: ["cg-operations-courantes"],
      rubric: [
        { label: "Comptes 512 et 411", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montant TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-avoir-fournisseur",
      level: 1,
      minutes: 10,
      title: "Avoir reçu d'un fournisseur après retour",
      statement:
        "18 mars N. Dix pneus achetés le 4 mars sont retournés au fournisseur Cyclo Pro, qui adresse l'avoir n° A-311 : 200,00 € HT, TVA 20 %.\nPassez l'écriture de l'avoir.",
      expectedAnswer:
        "Débit 401 Fournisseurs 240,00 ; crédit 607 Achats de marchandises 200,00 ; crédit 44566 TVA déductible sur biens et services 40,00.\nL'avoir est l'écriture d'achat en sens inverse : la dette diminue, la charge et la TVA déductible aussi.",
      competencyIds: ["cg-operations-courantes", "cg-tva"],
      rubric: [
        { label: "Comptes 401, 607 et 44566", points: 4 },
        { label: "Sens inversé par rapport à la facture", points: 3 },
        { label: "Montants HT, TVA et TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-tva-collectee",
      level: 1,
      minutes: 5,
      title: "TVA collectée du mois",
      statement:
        "Les ventes du mois s'élèvent à 24 000,00 € HT, toutes soumises au taux normal de 20 %.\nCalculez la TVA collectée du mois, en euros.",
      expectedAnswer: "24 000 × 20 % = 4 800,00 €.",
      competencyIds: ["cg-tva"],
      rubric: [{ label: "TVA collectée", points: 20 }]
    },
    "calculation"
  ),
  toExercise(
    {
      id: "ex-cgv1-comptes-tiers-qcm",
      level: 1,
      minutes: 5,
      title: "Reconnaître un compte de tiers",
      statement:
        "Parmi les comptes suivants, lesquels appartiennent à la classe 4 (comptes de tiers) ?",
      expectedAnswer:
        "401 Fournisseurs, 411 Clients et 44566 TVA déductible sur biens et services. 512 est un compte financier (classe 5) et 607 un compte de charges (classe 6).",
      competencyIds: ["cg-operations-courantes"],
      rubric: [{ label: "Classement des comptes", points: 20 }]
    },
    "qcm"
  ),
  toExercise(
    {
      id: "ex-cgv1-tva-deductible-qcm",
      level: 1,
      minutes: 6,
      title: "TVA déductible ou non déductible ?",
      statement:
        "Sur quelles dépenses l'entreprise peut-elle récupérer la TVA ?",
      expectedAnswer:
        "Marchandises destinées à la revente et matériel informatique : TVA déductible. Véhicule de tourisme et frais de logement des dirigeants : TVA exclue du droit à déduction.",
      competencyIds: ["cg-tva"],
      rubric: [{ label: "Droit à déduction", points: 20 }]
    },
    "qcm"
  ),

  // --- N2 : banque, immobilisation, déclaration ---------------------------
  toExercise(
    {
      id: "ex-cgv1-frais-bancaires",
      level: 2,
      minutes: 6,
      title: "Frais de tenue de compte prélevés par la banque",
      statement:
        "31 mars N. La banque prélève 50,00 € HT de frais de tenue de compte, TVA 20 %.\nPassez l'écriture.",
      expectedAnswer:
        "Débit 627 Services bancaires et assimilés 50,00 ; débit 44566 TVA déductible sur biens et services 10,00 ; crédit 512 Banque 60,00.\nLes frais bancaires sont une charge externe soumise à TVA, pas une charge financière.",
      competencyIds: ["cg-operations-courantes", "cg-tva"],
      rubric: [
        { label: "Comptes 627, 44566 et 512", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montants HT, TVA et TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-immo-acquisition",
      level: 2,
      minutes: 10,
      title: "Acquisition d'un poste informatique (SARL Vélo Cité)",
      statement:
        "SARL Vélo Cité, 1er octobre N. Acquisition d'un poste informatique pour l'atelier : 3 000,00 € HT, TVA 20 %, facture du fournisseur InfoPro payable à 60 jours.\nPassez l'écriture d'acquisition.",
      expectedAnswer:
        "Débit 2183 Matériel de bureau et matériel informatique 3 000,00 ; débit 44562 TVA déductible sur immobilisations 600,00 ; crédit 404 Fournisseurs d'immobilisations 3 600,00.\nDeux pièges : le compte de TVA est le 44562 et non le 44566, et la dette va au 404 et non au 401.",
      competencyIds: ["cg-immobilisations", "cg-tva"],
      rubric: [
        { label: "Comptes 2183, 44562 et 404", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montants HT, TVA et TTC", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-immo-annuite",
      level: 2,
      minutes: 8,
      title: "Première annuité d'amortissement au prorata temporis",
      statement:
        "Le poste informatique de 3 000,00 € HT est mis en service le 1er octobre N. Amortissement linéaire sur 5 ans, exercice clos le 31 décembre N.\nCalculez la dotation aux amortissements de l'exercice N, en euros.",
      expectedAnswer:
        "Annuité pleine = 3 000 / 5 = 600,00 €. Le bien n'est en service que 3 mois : 600 × 3/12 = 150,00 €.",
      competencyIds: ["cg-immobilisations"],
      rubric: [{ label: "Dotation N au prorata temporis", points: 20 }]
    },
    "calculation"
  ),
  toExercise(
    {
      id: "ex-cgv1-immo-dotation",
      level: 2,
      minutes: 6,
      title: "Écriture de dotation aux amortissements",
      statement:
        "31 décembre N. Comptabilisez la dotation aux amortissements de 150,00 € calculée sur le poste informatique (compte 2183).\nPassez l'écriture d'inventaire.",
      expectedAnswer:
        "Débit 6811 Dotations aux amortissements sur immobilisations 150,00 ; crédit 28183 Amortissements du matériel de bureau et informatique 150,00.\nL'amortissement ne touche jamais le compte 2183 : la valeur d'origine reste au bilan, l'usure est portée au compte 28 qui vient en déduction.",
      competencyIds: ["cg-immobilisations"],
      rubric: [
        { label: "Comptes 6811 et 28183", points: 4 },
        { label: "Sens débit/crédit", points: 3 },
        { label: "Montant de la dotation", points: 4 },
        { label: "Équilibre de l'écriture", points: 2 }
      ]
    },
    "journal-entry"
  ),
  toExercise(
    {
      id: "ex-cgv1-tva-a-decaisser",
      level: 2,
      minutes: 8,
      title: "TVA à décaisser du mois (SARL Vélo Cité)",
      statement:
        "Pour le mois de mars N : TVA collectée 4 800,00 € ; TVA déductible sur biens et services 2 900,00 € ; TVA déductible sur immobilisations 600,00 €.\nCalculez la TVA à décaisser, en euros.",
      expectedAnswer:
        "4 800 − 2 900 − 600 = 1 300,00 €. La TVA déductible sur immobilisations se déduit comme celle sur biens et services ; seul le compte diffère.",
      competencyIds: ["cg-tva"],
      rubric: [{ label: "TVA à décaisser", points: 20 }]
    },
    "calculation"
  ),
  toExercise(
    {
      id: "ex-cgv1-credit-tva",
      level: 2,
      minutes: 6,
      title: "Crédit de TVA reportable",
      statement:
        "Pour le mois d'avril N : TVA collectée 1 200,00 € ; TVA déductible totale 1 900,00 €.\nCalculez le crédit de TVA reportable sur le mois suivant, en euros (valeur positive).",
      expectedAnswer:
        "1 900 − 1 200 = 700,00 € de crédit de TVA. L'entreprise ne verse rien et reporte 700,00 € sur la déclaration suivante (compte 44567).",
      competencyIds: ["cg-tva"],
      rubric: [{ label: "Crédit de TVA", points: 20 }]
    },
    "calculation"
  ),
  toExercise(
    {
      id: "ex-cgv1-rapprochement-bancaire",
      level: 2,
      minutes: 10,
      title: "Solde après rapprochement bancaire",
      statement:
        "Au 31 mars N, le relevé bancaire affiche un solde en faveur de l'entreprise de 5 120,00 €. Deux écarts sont identifiés : un chèque de 900,00 € émis le 29 mars et non encore débité par la banque, et un virement client de 380,00 € figurant sur le relevé mais non encore comptabilisé.\nCalculez le solde rapproché, en euros.",
      expectedAnswer:
        "À partir du relevé : 5 120 − 900 = 4 220,00 €. Le virement de 380,00 € ne corrige pas le relevé — il y figure déjà — mais le compte 512, qui passe de 3 840,00 à 4 220,00 €. Les deux chemins convergent : c'est le contrôle.",
      competencyIds: ["cg-operations-courantes"],
      rubric: [{ label: "Solde rapproché", points: 20 }]
    },
    "calculation"
  )
];

// --- Authored evaluator specifications --------------------------------------
//
// One per exercise: this module has no `legacy_rubric` fallback anywhere.

function journalVersion(
  exerciseId: string,
  expectedLines: Array<{ account: string; debit?: number; credit?: number; label: string; alsoAccept?: string[] }>,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      expectedLines,
      amountToleranceAbs: JOURNAL_TOLERANCE,
      allowExtraLines: false,
      points: JOURNAL_POINTS
    },
    testCases
  };
}

function numericVersion(
  exerciseId: string,
  expected: number,
  label: string,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "numeric",
    spec: {
      expected,
      // To the cent. A VAT amount is not an estimate, so a percentage tolerance
      // would accept an answer that no tax authority would.
      toleranceAbs: 0.01,
      unit: "EUR",
      label
    },
    testCases
  };
}

export const comptaGeneraleV1ExerciseVersions: AuthoredExerciseVersion[] = [
  journalVersion(
    "ex-cgv1-achat-marchandises",
    [
      { account: "607", debit: 1200, label: "Achats de marchandises" },
      { account: "44566", debit: 240, label: "TVA déductible sur biens et services" },
      { account: "401", credit: 1440, label: "Fournisseurs" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 1200 },
            { account: "44566", debit: 240 },
            { account: "401", credit: 1440 }
          ]
        },
        expectedScore: 20
      },
      {
        // The classic beginner error: the payable recorded net of VAT. The entry
        // no longer balances, and the mark has to say so rather than round up.
        name: "dette-en-ht",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 1200 },
            { account: "44566", debit: 240 },
            { account: "401", credit: 1200 }
          ]
        },
        expectedScore: 14.88,
        expectedOutcomes: { accounts: "met", direction: "met", amounts: "partial", balance: "missed" }
      },
      {
        name: "sens-inverse",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", credit: 1200 },
            { account: "44566", credit: 240 },
            { account: "401", debit: 1440 }
          ]
        },
        expectedScore: 9.23,
        expectedOutcomes: { accounts: "met", direction: "missed", amounts: "missed", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-vente-marchandises",
    [
      { account: "411", debit: 2400, label: "Clients" },
      { account: "707", credit: 2000, label: "Ventes de marchandises" },
      { account: "44571", credit: 400, label: "TVA collectée" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "411", debit: 2400 },
            { account: "707", credit: 2000 },
            { account: "44571", credit: 400 }
          ]
        },
        expectedScore: 20
      },
      {
        // VAT posted to the deductible account: right side, right amount, wrong
        // account. Only the accounts criterion may fall.
        name: "tva-deductible-au-lieu-de-collectee",
        submission: {
          kind: "journal",
          lines: [
            { account: "411", debit: 2400 },
            { account: "707", credit: 2000 },
            { account: "44566", credit: 400 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-reglement-client",
    [
      { account: "512", debit: 2400, label: "Banque" },
      { account: "411", credit: 2400, label: "Clients" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "512", debit: 2400 },
            { account: "411", credit: 2400 }
          ]
        },
        expectedScore: 20
      },
      {
        // Re-recognising VAT on collection is the misconception this item exists
        // to catch: the extra line is not expected and costs the accounts mark.
        name: "tva-rajoutee-a-l-encaissement",
        submission: {
          kind: "journal",
          lines: [
            { account: "512", debit: 2400 },
            { account: "411", credit: 2000 },
            { account: "44571", credit: 400 }
          ]
        },
        expectedScore: 13.85,
        expectedOutcomes: { accounts: "partial", direction: "met", amounts: "partial", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-avoir-fournisseur",
    [
      { account: "401", debit: 240, label: "Fournisseurs" },
      { account: "607", credit: 200, label: "Achats de marchandises" },
      { account: "44566", credit: 40, label: "TVA déductible sur biens et services" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "401", debit: 240 },
            { account: "607", credit: 200 },
            { account: "44566", credit: 40 }
          ]
        },
        expectedScore: 20
      },
      {
        // The avoir posted like a purchase. Accounts and balance survive;
        // direction and amounts do not.
        name: "sens-de-la-facture",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 200 },
            { account: "44566", debit: 40 },
            { account: "401", credit: 240 }
          ]
        },
        expectedScore: 9.23,
        expectedOutcomes: { accounts: "met", direction: "missed", amounts: "missed", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-tva-collectee", 4800, "TVA collectée du mois", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 4800 }, expectedScore: 20 },
    {
      // 24 000 read as TTC instead of HT — the single most common VAT slip.
      name: "assiette-ttc",
      submission: { kind: "numeric", value: 4000 },
      expectedScore: 0
    }
  ]),
  {
    id: "exv-cgv1-comptes-tiers-qcm-1",
    exerciseId: "ex-cgv1-comptes-tiers-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Comptes de la classe 4",
      options: [
        { id: "401", label: "401 Fournisseurs" },
        { id: "411", label: "411 Clients" },
        { id: "44566", label: "44566 TVA déductible sur biens et services" },
        {
          id: "512",
          label: "512 Banque",
          rationale: "512 est un compte financier (classe 5) : la banque n'est pas un tiers au sens du PCG."
        },
        {
          id: "607",
          label: "607 Achats de marchandises",
          rationale: "607 est un compte de charges (classe 6), pas une dette envers un tiers."
        }
      ],
      correctOptionIds: ["401", "411", "44566"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: { kind: "choice", selectedOptionIds: ["401", "411", "44566"] },
        expectedScore: 20
      },
      {
        name: "coche-tout",
        submission: { kind: "choice", selectedOptionIds: ["401", "411", "44566", "512", "607"] },
        expectedScore: 0
      },
      {
        name: "oublie-la-tva",
        submission: { kind: "choice", selectedOptionIds: ["401", "411"] },
        expectedScore: 13.33
      }
    ]
  },
  {
    id: "exv-cgv1-tva-deductible-qcm-1",
    exerciseId: "ex-cgv1-tva-deductible-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Droit à déduction de la TVA",
      options: [
        { id: "marchandises", label: "Marchandises destinées à la revente" },
        { id: "informatique", label: "Matériel informatique de l'entreprise" },
        {
          id: "tourisme",
          label: "Véhicule de tourisme pour un commercial",
          rationale:
            "La TVA sur les véhicules de tourisme est exclue du droit à déduction, quel que soit l'usage professionnel."
        },
        {
          id: "logement",
          label: "Nuits d'hôtel des dirigeants",
          rationale: "Les dépenses de logement des dirigeants et salariés sont exclues du droit à déduction."
        }
      ],
      correctOptionIds: ["marchandises", "informatique"]
    },
    testCases: [
      {
        name: "les-deux-deductibles",
        submission: { kind: "choice", selectedOptionIds: ["marchandises", "informatique"] },
        expectedScore: 20
      },
      {
        name: "retient-le-vehicule-de-tourisme",
        submission: { kind: "choice", selectedOptionIds: ["marchandises", "informatique", "tourisme"] },
        expectedScore: 10
      }
    ]
  },
  journalVersion(
    "ex-cgv1-frais-bancaires",
    [
      { account: "627", debit: 50, label: "Services bancaires et assimilés" },
      { account: "44566", debit: 10, label: "TVA déductible sur biens et services" },
      { account: "512", credit: 60, label: "Banque" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "627", debit: 50 },
            { account: "44566", debit: 10 },
            { account: "512", credit: 60 }
          ]
        },
        expectedScore: 20
      },
      {
        // Bank charges booked as a financial expense (661). One account wrong.
        name: "charge-financiere",
        submission: {
          kind: "journal",
          lines: [
            { account: "661", debit: 50 },
            { account: "44566", debit: 10 },
            { account: "512", credit: 60 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-immo-acquisition",
    [
      { account: "2183", debit: 3000, label: "Matériel de bureau et matériel informatique" },
      { account: "44562", debit: 600, label: "TVA déductible sur immobilisations" },
      { account: "404", credit: 3600, label: "Fournisseurs d'immobilisations" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "2183", debit: 3000 },
            { account: "44562", debit: 600 },
            { account: "404", credit: 3600 }
          ]
        },
        expectedScore: 20
      },
      {
        // Both traps at once: 44566 instead of 44562, and 401 instead of 404.
        name: "comptes-d-exploitation",
        submission: {
          kind: "journal",
          lines: [
            { account: "2183", debit: 3000 },
            { account: "44566", debit: 600 },
            { account: "401", credit: 3600 }
          ]
        },
        expectedScore: 6.66,
        expectedOutcomes: { accounts: "missed", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-immo-annuite", 150, "Dotation aux amortissements de l'exercice N", [
    { name: "prorata-temporis", submission: { kind: "numeric", value: 150 }, expectedScore: 20 },
    {
      // The full-year annuity: the prorata is exactly what this item tests.
      name: "annuite-pleine",
      submission: { kind: "numeric", value: 600 },
      expectedScore: 0
    }
  ]),
  journalVersion(
    "ex-cgv1-immo-dotation",
    [
      { account: "6811", debit: 150, label: "Dotations aux amortissements sur immobilisations" },
      { account: "28183", debit: undefined, credit: 150, label: "Amortissements du matériel informatique" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "6811", debit: 150 },
            { account: "28183", credit: 150 }
          ]
        },
        expectedScore: 20
      },
      {
        // Crediting the asset itself instead of the depreciation account: the
        // misconception the item is built to detect.
        name: "credite-l-immobilisation",
        submission: {
          kind: "journal",
          lines: [
            { account: "6811", debit: 150 },
            { account: "2183", credit: 150 }
          ]
        },
        expectedScore: 8.46,
        expectedOutcomes: { accounts: "missed", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-tva-a-decaisser", 1300, "TVA à décaisser du mois", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 1300 }, expectedScore: 20 },
    {
      // VAT on fixed assets forgotten — it deducts like any other.
      name: "oublie-la-tva-sur-immobilisations",
      submission: { kind: "numeric", value: 1900 },
      expectedScore: 0
    }
  ]),
  numericVersion("ex-cgv1-credit-tva", 700, "Crédit de TVA reportable", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 700 }, expectedScore: 20 },
    { name: "signe-inverse", submission: { kind: "numeric", value: -700 }, expectedScore: 0 }
  ]),
  numericVersion("ex-cgv1-rapprochement-bancaire", 4220, "Solde rapproché au 31 mars", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 4220 }, expectedScore: 20 },
    {
      // The unrecorded transfer subtracted from the statement as well: it is
      // already on the statement, so counting it twice is the error.
      name: "virement-compte-deux-fois",
      submission: { kind: "numeric", value: 3840 },
      expectedScore: 0
    }
  ])
];

// --- The mini-case ---------------------------------------------------------

export interface MiniCaseDocument {
  id: string;
  reference: string;
  date: string;
  summary: string;
}

export interface MiniCaseStep {
  exerciseId: string;
  /** What the learner is asked to produce at this step. */
  instruction: string;
  /** Which document justifies it. */
  documentId: string;
}

export interface ComptaMiniCase {
  id: string;
  title: string;
  trackId: string;
  levelId: string;
  context: string;
  documents: MiniCaseDocument[];
  steps: MiniCaseStep[];
  /** Checked at the end, so the learner sees the month close rather than a score. */
  closing: {
    label: string;
    expectedTvaCollectee: number;
    expectedTvaDeductible: number;
    expectedTvaADecaisser: number;
  };
  sourceReferences: SourceReference[];
}

/**
 * One month at the SARL Vélo Cité.
 *
 * The steps are module exercises, in date order, not a parallel set of
 * questions. That is the whole design: the drills and the case are the same
 * transactions, so finishing the level is genuine preparation for the case
 * rather than a different exam.
 *
 * `closing` is what turns five entries into a month: the VAT the entries imply
 * has to be the VAT the learner computes at the end. It is checked by the last
 * step, which is a real graded exercise, so the case has an outcome that is
 * marked rather than merely displayed.
 */
export const comptaGeneraleV1MiniCase: ComptaMiniCase = {
  id: "case-cgv1-mois-de-mars",
  title: "Le mois de mars de la SARL Vélo Cité",
  trackId: COMPTA_GENERALE_V1_TRACK,
  levelId: "level-compta-generale-v1-2",
  context:
    "La SARL Vélo Cité vend des cycles et des accessoires. Vous tenez sa comptabilité pour le mois de mars N. Les pièces ci-dessous sont classées par date ; chaque étape demande l'écriture ou le calcul qu'elles justifient.",
  documents: [
    {
      id: "doc-f2031",
      reference: "Facture fournisseur F-2031",
      date: "04/03/N",
      summary: "Cyclo Pro — 60 pneus à 20,00 € HT, TVA 20 %, payable à 30 jours."
    },
    {
      id: "doc-2026-114",
      reference: "Facture de vente 2026-114",
      date: "11/03/N",
      summary: "Sport Loisirs — 2 000,00 € HT de marchandises, TVA 20 %, payable à 30 jours."
    },
    {
      id: "doc-a311",
      reference: "Avoir fournisseur A-311",
      date: "18/03/N",
      summary: "Cyclo Pro — retour de 10 pneus, 200,00 € HT, TVA 20 %."
    },
    {
      id: "doc-releve-virement",
      reference: "Relevé bancaire du 28/03",
      date: "28/03/N",
      summary: "Virement reçu de Sport Loisirs pour 2 400,00 € en règlement de la facture 2026-114."
    },
    {
      id: "doc-releve-frais",
      reference: "Relevé bancaire du 31/03",
      date: "31/03/N",
      summary: "Frais de tenue de compte : 50,00 € HT, TVA 20 %."
    },
    {
      id: "doc-recap-tva",
      reference: "Récapitulatif TVA de mars",
      date: "31/03/N",
      summary:
        "TVA collectée du mois 4 800,00 € ; TVA déductible sur biens et services 2 900,00 € ; TVA déductible sur immobilisations 600,00 €."
    }
  ],
  steps: [
    {
      exerciseId: "ex-cgv1-achat-marchandises",
      documentId: "doc-f2031",
      instruction: "Enregistrez la facture d'achat au journal."
    },
    {
      exerciseId: "ex-cgv1-vente-marchandises",
      documentId: "doc-2026-114",
      instruction: "Enregistrez la facture de vente au journal."
    },
    {
      exerciseId: "ex-cgv1-avoir-fournisseur",
      documentId: "doc-a311",
      instruction: "Enregistrez l'avoir reçu du fournisseur."
    },
    {
      exerciseId: "ex-cgv1-reglement-client",
      documentId: "doc-releve-virement",
      instruction: "Enregistrez l'encaissement du client."
    },
    {
      exerciseId: "ex-cgv1-frais-bancaires",
      documentId: "doc-releve-frais",
      instruction: "Enregistrez les frais bancaires du mois."
    },
    {
      exerciseId: "ex-cgv1-tva-a-decaisser",
      documentId: "doc-recap-tva",
      instruction: "Liquidez la TVA du mois : calculez la TVA à décaisser."
    }
  ],
  closing: {
    label: "Déclaration de TVA de mars N",
    expectedTvaCollectee: 4800,
    expectedTvaDeductible: 3500,
    expectedTvaADecaisser: 1300
  },
  sourceReferences: [pcgSource, coursSource]
};

// --- Level membership ------------------------------------------------------

/**
 * Which level an exercise belongs to.
 *
 * This is what lets a submission feed PR-02: the grading service reads the level
 * off the exercise and records a `direct` mastery event against it, so answering
 * a question moves the progression bar without the API having to be told which
 * level it was for.
 */
export const comptaGeneraleV1LevelByExercise: Record<string, string> = Object.fromEntries(
  comptaGeneraleV1Exercises.map((exercise) => [
    exercise.id,
    exercise.level === 1 ? "level-compta-generale-v1-1" : "level-compta-generale-v1-2"
  ])
);

export function getComptaGeneraleV1Level(exerciseId: string): string | null {
  return comptaGeneraleV1LevelByExercise[exerciseId] ?? null;
}

export function getComptaGeneraleV1Exercises(level: 1 | 2): Exercise[] {
  return comptaGeneraleV1Exercises.filter((exercise) => exercise.level === level);
}
