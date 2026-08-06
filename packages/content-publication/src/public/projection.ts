import type {
  CalculationExercise,
  ErrorDiagnosisExercise,
  GeneratedFlashcard,
  JournalEntryExercise,
  ProgressiveCase,
  SmartRevisionSheet
} from "@finance/content-generation";
import type { PublishedContentVersion, PublishedSourceReference } from "../types";

/**
 * Ce qu'une page publique a le droit de recevoir.
 *
 * LA RÈGLE EST « CE QUI N'EST PAS ENVOYÉ NE PEUT PAS FUIR ». Masquer une
 * réponse en CSS, ou la rendre dans un attribut `data-`, la laisse dans le
 * source de la page : le premier « afficher le code source » la donne. Les
 * projections ci-dessous retirent donc la réponse attendue de la *charge utile*,
 * et la correction est obtenue par un appel serveur après tentative — c'est déjà
 * la règle que `POST /api/revisions/reveal` applique aux cartes et que les pages
 * de cas appliquent aux figures attendues.
 *
 * Le corollaire est que la notation ne peut pas être faite dans le navigateur.
 * C'est voulu : elle est déterministe et serveur, donc invérifiable par
 * l'apprenant et identique pour tous.
 */

/**
 * Une source telle qu'un visiteur la voit.
 *
 * Ni chemin, ni nom de fichier, ni lien : de quoi identifier un document et la
 * page qui porte la règle, et rien de plus. `documentId` est conservé comme
 * identifiant interne opaque — il ne désigne aucun emplacement.
 */
export interface PublicSourceReference {
  documentTitle: string;
  sourceType: PublishedSourceReference["sourceType"];
  sectionTitle?: string;
  pageStart: number;
  pageEnd: number;
  effectiveDate?: string;
  documentId: string;
}

export function toPublicSourceReference(reference: PublishedSourceReference): PublicSourceReference {
  return {
    documentTitle: reference.documentTitle,
    sourceType: reference.sourceType,
    sectionTitle: reference.sectionTitle,
    pageStart: reference.pageStart,
    pageEnd: reference.pageEnd,
    effectiveDate: reference.effectiveDate,
    documentId: reference.documentId
  };
}

export function toPublicSourceReferences(
  references: readonly PublishedSourceReference[]
): PublicSourceReference[] {
  return references.map(toPublicSourceReference);
}

// --- Fiche de révision -----------------------------------------------------

/**
 * La fiche part entière : elle est faite pour être lue, réponses de rappel
 * actif comprises. Les masquer serait un choix d'interface (bouton « afficher la
 * réponse »), pas une règle de confidentialité — rien ici n'est noté.
 */
export type PublicRevisionSheet = SmartRevisionSheet;

// --- Flashcard -------------------------------------------------------------

/** Le recto seul. Verso, explication et source arrivent après révélation. */
export interface PublicFlashcardFront {
  cardId: string;
  type: GeneratedFlashcard["type"];
  front: string;
  difficulty: number;
  tags: string[];
}

export interface RevealedFlashcard {
  cardId: string;
  back: string;
  explanation: string;
  sources: PublicSourceReference[];
}

export function toPublicFlashcardFront(version: PublishedContentVersion): PublicFlashcardFront {
  if (version.contentSnapshot.contentType !== "flashcard") {
    throw new Error(`« ${version.id} » n'est pas une flashcard`);
  }

  const card = version.contentSnapshot.content;

  return {
    cardId: version.id,
    type: card.type,
    front: card.front,
    difficulty: card.difficulty,
    tags: card.tags
  };
}

export function revealFlashcard(version: PublishedContentVersion): RevealedFlashcard {
  if (version.contentSnapshot.contentType !== "flashcard") {
    throw new Error(`« ${version.id} » n'est pas une flashcard`);
  }

  const card = version.contentSnapshot.content;

  return {
    cardId: version.id,
    back: card.back,
    explanation: card.explanation,
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
  };
}

// --- Exercice de calcul ----------------------------------------------------

/**
 * L'énoncé sans sa réponse.
 *
 * `tolerance` et `roundingRule` restent : ce sont des consignes, l'apprenant
 * doit savoir à quelle précision on l'attend. `expectedAnswer`,
 * `calculationSteps`, `explanation` et le barème partent.
 */
export interface PublicCalculationExercise {
  exerciseId: string;
  title: string;
  statement: string;
  variables: CalculationExercise["variables"];
  unit: string;
  tolerance: number;
  roundingRule: CalculationExercise["roundingRule"];
  difficulty: number;
  competencyTags: string[];
  sources: PublicSourceReference[];
}

export function toPublicCalculationExercise(
  version: PublishedContentVersion
): PublicCalculationExercise {
  if (version.contentSnapshot.contentType !== "calculation_exercise") {
    throw new Error(`« ${version.id} » n'est pas un exercice de calcul`);
  }

  const exercise = version.contentSnapshot.content;

  return {
    exerciseId: version.id,
    title: exercise.title,
    statement: exercise.statement,
    variables: exercise.variables,
    unit: exercise.unit,
    tolerance: exercise.tolerance,
    roundingRule: exercise.roundingRule,
    difficulty: exercise.difficulty,
    competencyTags: exercise.competencyTags,
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
  };
}

// --- Écriture comptable ----------------------------------------------------

/**
 * L'énoncé sans l'écriture attendue.
 *
 * `requiredAccounts` part aussi : donner la liste des comptes à utiliser
 * transformerait l'exercice en simple placement de montants.
 */
export interface PublicJournalEntryExercise {
  exerciseId: string;
  title: string;
  statement: string;
  operationDate: string;
  contextualData: JournalEntryExercise["contextualData"];
  /** Nombre de lignes attendues : une aide de cadrage, pas une réponse. */
  expectedLineCount: number;
  difficulty: number;
  competencyTags: string[];
  sources: PublicSourceReference[];
}

export function toPublicJournalEntryExercise(
  version: PublishedContentVersion
): PublicJournalEntryExercise {
  if (version.contentSnapshot.contentType !== "journal_entry_exercise") {
    throw new Error(`« ${version.id} » n'est pas une écriture comptable`);
  }

  const exercise = version.contentSnapshot.content;

  return {
    exerciseId: version.id,
    title: exercise.title,
    statement: exercise.statement,
    operationDate: exercise.operationDate,
    contextualData: exercise.contextualData,
    expectedLineCount: exercise.expectedLines.length,
    difficulty: exercise.difficulty,
    competencyTags: exercise.competencyTags,
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
  };
}

// --- Diagnostic d'erreur ---------------------------------------------------

export interface PublicErrorDiagnosisExercise {
  exerciseId: string;
  title: string;
  scenario: string;
  proposedAnswer?: string;
  /** L'écriture fautive est montrée : c'est l'objet de l'exercice. */
  proposedEntry?: ErrorDiagnosisExercise["proposedEntry"];
  /** Les choix offerts, sans dire lequel est le bon. */
  errorCategories: ErrorDiagnosisExercise["errorCategories"];
  difficulty: number;
  competencyTags: string[];
  sources: PublicSourceReference[];
}

export function toPublicErrorDiagnosisExercise(
  version: PublishedContentVersion
): PublicErrorDiagnosisExercise {
  if (version.contentSnapshot.contentType !== "error_diagnosis_exercise") {
    throw new Error(`« ${version.id} » n'est pas un diagnostic d'erreur`);
  }

  const exercise = version.contentSnapshot.content;

  return {
    exerciseId: version.id,
    title: exercise.title,
    scenario: exercise.scenario,
    proposedAnswer: exercise.proposedAnswer,
    proposedEntry: exercise.proposedEntry,
    errorCategories: exercise.errorCategories,
    difficulty: exercise.difficulty,
    competencyTags: exercise.competencyTags,
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
  };
}

// --- Mini-cas progressif ---------------------------------------------------

/**
 * Une étape sans sa spécification de réponse ni son explication.
 *
 * `hintCount` est publié, `hints` non : les indices sont demandés un par un au
 * serveur, sinon les trois niveaux voyageraient avec la page et la gradation
 * n'aurait aucun effet.
 */
export interface PublicCaseStep {
  id: string;
  order: number;
  objective: string;
  statement: string;
  exerciseType: ProgressiveCase["steps"][number]["exerciseType"];
  /** Consignes de forme d'une étape de calcul ; jamais la valeur attendue. */
  unit?: string;
  tolerance?: number;
  roundingRule?: CalculationExercise["roundingRule"];
  /** Choix offerts d'une étape de diagnostic. */
  errorCategories?: ErrorDiagnosisExercise["errorCategories"];
  hintCount: number;
  prerequisiteStepIds: string[];
  sources: PublicSourceReference[];
}

export interface PublicProgressiveCase {
  caseId: string;
  title: string;
  context: string;
  sharedData: ProgressiveCase["sharedData"];
  steps: PublicCaseStep[];
  difficulty: number;
  estimatedMinutes: number;
  competencyTags: string[];
  sources: PublicSourceReference[];
}

export function toPublicProgressiveCase(version: PublishedContentVersion): PublicProgressiveCase {
  if (version.contentSnapshot.contentType !== "progressive_case") {
    throw new Error(`« ${version.id} » n'est pas un mini-cas`);
  }

  const kase = version.contentSnapshot.content;
  const publicSources = toPublicSourceReferences(version.sourceReferencesSnapshot);

  return {
    caseId: version.id,
    title: kase.title,
    context: kase.context,
    sharedData: kase.sharedData,
    steps: [...kase.steps]
      .sort((left, right) => left.order - right.order)
      .map((step) => ({
        id: step.id,
        order: step.order,
        objective: step.objective,
        statement: step.statement,
        exerciseType: step.exerciseType,
        unit: step.answerSpecification.kind === "calculation" ? step.answerSpecification.unit : undefined,
        tolerance:
          step.answerSpecification.kind === "calculation" ? step.answerSpecification.tolerance : undefined,
        roundingRule:
          step.answerSpecification.kind === "calculation"
            ? step.answerSpecification.roundingRule
            : undefined,
        // Une étape de diagnostic dans un cas n'énumère pas ses choix dans le
        // schéma : les neuf catégories du domaine sont proposées telles quelles.
        errorCategories: undefined,
        hintCount: step.hintLevels.length,
        prerequisiteStepIds: step.prerequisiteStepIds,
        sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
      })),
    difficulty: kase.difficulty,
    estimatedMinutes: kase.estimatedMinutes,
    competencyTags: kase.competencyTags,
    sources: publicSources
  };
}
