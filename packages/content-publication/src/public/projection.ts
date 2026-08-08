// SOUS-CHEMIN « normative », PAS LA RACINE DU PAQUET. La racine de
// `@finance/content-generation` réexporte le magasin de brouillons et le
// chargeur de corpus, qui importent `node:fs`. Ce module est atteint depuis des
// îlots clients par `@finance/content-publication/public` : passer par la racine
// tirerait `node:fs` dans le paquet du navigateur et ferait échouer le build —
// c'est exactement le piège que `source-list.tsx` documente déjà un cran plus
// haut. Les types, eux, passent par la racine : `import type` s'efface à la
// compilation et ne crée aucune arête d'exécution.
import { resolveNormativeContext } from "@finance/content-generation/normative";
import type {
  CalculationExercise,
  CustomAccountDisclosure,
  ErrorDiagnosisExercise,
  GeneratedFlashcard,
  JournalEntryExercise,
  NormativeProfile,
  NormativeStatus,
  ProgressiveCase,
  ScoringPolicy,
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
 *
 * `pack` EST PUBLIÉ, ET C'EST UNE EXIGENCE, PAS UN CHOIX. `AGENTS.md` demande
 * que toute réponse sourcée cite « document, page, pack et date lorsqu'elle est
 * disponible ». Le retirer par prudence privait chaque règle d'un des quatre
 * champs exigés — et un identifiant de pack ne dit rien de l'arborescence : il
 * nomme un lot d'import, pas un emplacement.
 */
export interface PublicSourceReference {
  documentTitle: string;
  sourceType: PublishedSourceReference["sourceType"];
  /** Lot d'import d'où vient le document. Exigé par AGENTS.md. */
  pack: string;
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
    pack: reference.pack,
    sectionTitle: reference.sectionTitle,
    pageStart: reference.pageStart,
    pageEnd: reference.pageEnd,
    effectiveDate: reference.effectiveDate,
    documentId: reference.documentId
  };
}

/** Libellés de nature du matériau, jamais l'identifiant brut à l'écran. */
export const SOURCE_TYPE_LABELS: Record<PublishedSourceReference["sourceType"], string> = {
  course: "Support de cours",
  "official-reference": "Référence officielle",
  "personal-note": "Note personnelle",
  exercise: "Énoncé ou corrigé"
};

export function toPublicSourceReferences(
  references: readonly PublishedSourceReference[]
): PublicSourceReference[] {
  return references.map(toPublicSourceReference);
}

// --- Contexte normatif -----------------------------------------------------

/**
 * Le référentiel tel qu'un visiteur le voit.
 *
 * LES NOTES DE DIVERGENCE NE SORTENT PAS. `versionConflictNotes` est un
 * raisonnement de relecteur — il nomme des identifiants de document, cite ce
 * qu'un audit a établi, et s'adresse à quelqu'un qui arbitre. Un apprenant a
 * besoin de savoir *ce qui s'applique*, pas de lire l'instruction du dossier.
 * `sourceVersionIds` reste dedans pour la même raison : ce sont des références
 * internes de version, et la liste des sources publiques existe déjà à côté.
 *
 * LES SOUS-COMPTES DÉCLARÉS N'Y SONT PAS NON PLUS, ET POUR UNE RAISON QUI N'A
 * RIEN À VOIR. Ils sont pédagogiquement utiles — savoir que 4671 subdivise 467
 * fait partie de ce qu'un apprenant doit comprendre — mais un énoncé d'écriture
 * est projeté *sans* ses comptes requis, justement pour ne pas réduire
 * l'exercice à un placement de montants. Les publier dans le contexte les
 * aurait redonnés par la bande. Ils voyagent donc avec ce qui est déjà visible :
 * la fiche, et la correction rendue après tentative.
 */
export interface PublicNormativeContext {
  profile: NormativeProfile;
  status: NormativeStatus;
  scoringPolicy: ScoringPolicy;
  effectiveFrom?: string;
  effectiveTo?: string;
  supersededByProfile?: NormativeProfile;
}

/**
 * Le contexte d'une version publiée, ou celui du référentiel en vigueur quand
 * la version est antérieure au champ. Jamais `undefined` : une page publique ne
 * doit pas avoir à décider quoi faire d'un référentiel absent.
 */
export function normativeContextOf(version: PublishedContentVersion): PublicNormativeContext {
  const context = resolveNormativeContext(version.normativeContextSnapshot);

  return {
    profile: context.profile,
    status: context.status,
    scoringPolicy: context.scoringPolicy,
    effectiveFrom: context.effectiveFrom,
    effectiveTo: context.effectiveTo,
    supersededByProfile: context.supersededByProfile
  };
}

/**
 * Les sous-comptes déclarés d'une version publiée.
 *
 * À n'appeler que là où la réponse est déjà connue du lecteur : une fiche de
 * révision, un verso révélé, une correction rendue. Sur un énoncé non encore
 * tenté, ils nommeraient un compte attendu.
 */
export function disclosedAccountsOf(version: PublishedContentVersion): CustomAccountDisclosure[] {
  return resolveNormativeContext(version.normativeContextSnapshot).customAccountDisclosures;
}

/**
 * Vrai quand la réponse attendue de ce contenu fait foi aujourd'hui.
 *
 * C'est la seule question que les files de travail et le calcul de maîtrise ont
 * à poser. Un contenu « comparaison seule » s'affiche — c'est son intérêt — mais
 * ne corrige rien et ne compte nulle part.
 */
export function isGradedVersion(version: PublishedContentVersion): boolean {
  return normativeContextOf(version).scoringPolicy === "graded";
}

/** Vrai quand le contenu relève du référentiel en vigueur. */
export function isCurrentProfileVersion(version: PublishedContentVersion): boolean {
  return normativeContextOf(version).profile === "anc-2026-current";
}

/**
 * Les versions qu'un parcours noté a le droit d'employer.
 *
 * Le filtre est écrit une fois et appelé partout — file de révision espacée,
 * catalogue de progression, entraînement — parce que trois filtres écrits
 * séparément finiraient par diverger, et que la divergence se verrait le jour
 * où un contenu historique noterait quelqu'un.
 */
export function filterGradedVersions(
  versions: readonly PublishedContentVersion[]
): PublishedContentVersion[] {
  return versions.filter(isGradedVersion);
}

/**
 * Les versions qui ne servent qu'à comparer deux états du droit.
 *
 * Elles alimentent l'encart comparatif facultatif, jamais une correction.
 */
export function filterComparisonOnlyVersions(
  versions: readonly PublishedContentVersion[]
): PublishedContentVersion[] {
  return versions.filter(
    (version) => normativeContextOf(version).scoringPolicy === "comparison-only"
  );
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
  /** Selon quel référentiel la réponse fait foi. */
  normativeContext: PublicNormativeContext;
}

export interface RevealedFlashcard {
  cardId: string;
  back: string;
  explanation: string;
  sources: PublicSourceReference[];
  normativeContext: PublicNormativeContext;
  /** Les sous-comptes que la réponse emploie, une fois la réponse connue. */
  disclosedAccounts: CustomAccountDisclosure[];
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
    tags: card.tags,
    normativeContext: normativeContextOf(version)
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
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot),
    normativeContext: normativeContextOf(version),
    disclosedAccounts: disclosedAccountsOf(version)
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
  normativeContext: PublicNormativeContext;
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
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot),
    normativeContext: normativeContextOf(version)
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
  normativeContext: PublicNormativeContext;
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
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot),
    normativeContext: normativeContextOf(version)
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
  normativeContext: PublicNormativeContext;
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
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot),
    normativeContext: normativeContextOf(version)
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
  normativeContext: PublicNormativeContext;
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
    sources: publicSources,
    normativeContext: normativeContextOf(version)
  };
}
