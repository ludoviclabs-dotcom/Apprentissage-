/**
 * Progression d'un chapitre publié.
 *
 * ELLE EST CALCULÉE, JAMAIS DÉCLARÉE. Aucune constante de démonstration, aucun
 * pourcentage d'illustration : la fonction ci-dessous est totale sur ses entrées
 * et ne connaît que des événements réellement enregistrés. Un chapitre sur lequel
 * personne n'a travaillé rend `not-started`, pas « 0 % » — les deux se ressemblent
 * à l'écran, mais le premier est un fait et le second une mesure inventée.
 *
 * OUVRIR UNE PAGE N'EST PAS PROGRESSER. `sheet_viewed` compte pour une dimension
 * sur sept et ne peut à lui seul dépasser « en cours ». Réduire la maîtrise à la
 * consultation était précisément le reproche fait aux anciens écrans de démo.
 *
 * Pure : ni horloge, ni base, ni hasard. Deux apprenants ayant le même historique
 * voient le même état, et le calcul est reproductible en test comme il est
 * explicable à l'apprenant.
 */

export const CHAPTER_ACTIVITY_KINDS = [
  /** La fiche 2.0 a été ouverte et parcourue. */
  "sheet_viewed",
  /** Une question de rappel actif a été traitée. */
  "active_recall",
  /** Une carte due a été auto-évaluée. */
  "flashcard_reviewed",
  "calculation_attempt",
  "journal_entry_attempt",
  "diagnosis_attempt",
  "case_step_attempt"
] as const;

export type ChapterActivityKind = (typeof CHAPTER_ACTIVITY_KINDS)[number];

export interface ChapterActivityEvent {
  kind: ChapterActivityKind;
  /** Identifiant de la version publiée travaillée. */
  artifactId: string;
  /** Vrai quand l'activité a été réussie. Toujours vrai pour une consultation. */
  succeeded: boolean;
  occurredAt: string;
}

export const CHAPTER_PROGRESS_STATUSES = ["not-started", "in-progress", "to-review", "mastered"] as const;

export type ChapterProgressStatus = (typeof CHAPTER_PROGRESS_STATUSES)[number];

/**
 * Les sept dimensions de la maîtrise d'un chapitre.
 *
 * Chacune correspond à une chose différente qu'un apprenant sait faire ; c'est
 * pourquoi elles se comptent séparément plutôt que de se fondre dans une moyenne.
 * Une dimension pour laquelle le chapitre ne publie aucune activité est *neutre* :
 * elle ne compte ni comme acquise, ni comme manquante, sans quoi un chapitre sans
 * mini-cas plafonnerait à six septièmes pour une raison qui ne regarde pas
 * l'apprenant.
 */
export interface ChapterDimension {
  kind: ChapterActivityKind;
  label: string;
  /** Le chapitre publie-t-il de quoi travailler cette dimension ? */
  available: boolean;
  attempts: number;
  successes: number;
  acquired: boolean;
}

export interface ChapterProgress {
  status: ChapterProgressStatus;
  /** Dimensions acquises sur dimensions disponibles. Jamais un pourcentage inventé. */
  acquiredDimensions: number;
  availableDimensions: number;
  dimensions: ChapterDimension[];
  totalAttempts: number;
  /** Activités échouées et jamais réussies depuis : ce qui alimente « à revoir ». */
  outstandingFailures: number;
  lastActivityAt: string | null;
}

const DIMENSION_LABELS: Record<ChapterActivityKind, string> = {
  sheet_viewed: "Fiche consultée",
  active_recall: "Rappel actif",
  flashcard_reviewed: "Cartes dues traitées",
  calculation_attempt: "Calculs réussis",
  journal_entry_attempt: "Écriture réussie",
  diagnosis_attempt: "Diagnostic réussi",
  case_step_attempt: "Mini-cas terminé"
};

/**
 * Ce qu'il faut de réussites pour tenir une dimension pour acquise.
 *
 * Une seule pour les activités notées : une écriture d'emprunt obligataire
 * réussie est une preuve, la répéter n'en est pas une meilleure. Deux pour le
 * rappel actif et les cartes, où une réussite isolée peut être un coup de chance
 * et où la répétition espacée est justement l'outil.
 */
const REQUIRED_SUCCESSES: Record<ChapterActivityKind, number> = {
  sheet_viewed: 1,
  active_recall: 2,
  flashcard_reviewed: 2,
  calculation_attempt: 1,
  journal_entry_attempt: 1,
  diagnosis_attempt: 1,
  case_step_attempt: 1
};

export interface ChapterCatalogue {
  /** Les types d'activité que le chapitre publie réellement. */
  availableKinds: ReadonlySet<ChapterActivityKind>;
}

/**
 * Les dimensions qu'un chapitre peut faire travailler, déduites de ce qu'il
 * publie. Un chapitre sans exercice de calcul ne réclame pas de calcul.
 */
export function catalogueFromArtifactTypes(
  artifactTypes: readonly string[]
): ChapterCatalogue {
  const kinds = new Set<ChapterActivityKind>();

  if (artifactTypes.includes("smart_revision_sheet")) {
    kinds.add("sheet_viewed");
    kinds.add("active_recall");
  }

  if (artifactTypes.includes("flashcard")) {
    kinds.add("flashcard_reviewed");
  }

  if (artifactTypes.includes("calculation_exercise")) {
    kinds.add("calculation_attempt");
  }

  if (artifactTypes.includes("journal_entry_exercise")) {
    kinds.add("journal_entry_attempt");
  }

  if (artifactTypes.includes("error_diagnosis_exercise")) {
    kinds.add("diagnosis_attempt");
  }

  if (artifactTypes.includes("progressive_case")) {
    kinds.add("case_step_attempt");
  }

  return { availableKinds: kinds };
}

export function computeChapterProgress(
  events: readonly ChapterActivityEvent[],
  catalogue: ChapterCatalogue
): ChapterProgress {
  const dimensions: ChapterDimension[] = CHAPTER_ACTIVITY_KINDS.map((kind) => {
    const own = events.filter((event) => event.kind === kind);
    const successes = own.filter((event) => event.succeeded).length;

    return {
      kind,
      label: DIMENSION_LABELS[kind],
      available: catalogue.availableKinds.has(kind),
      attempts: own.length,
      successes,
      acquired: successes >= REQUIRED_SUCCESSES[kind]
    };
  });

  const available = dimensions.filter((dimension) => dimension.available);
  const acquired = available.filter((dimension) => dimension.acquired);

  // Un artefact compte comme « à revoir » tant que sa dernière tentative connue
  // est un échec. Compter les échecs bruts ferait qu'une notion ratée puis
  // maîtrisée resterait à revoir indéfiniment.
  const lastOutcomeByArtifact = new Map<string, boolean>();

  for (const event of [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))) {
    lastOutcomeByArtifact.set(event.artifactId, event.succeeded);
  }

  const outstandingFailures = [...lastOutcomeByArtifact.values()].filter((succeeded) => !succeeded).length;

  const lastActivityAt =
    events.length === 0
      ? null
      : events.reduce((latest, event) => (event.occurredAt > latest ? event.occurredAt : latest), events[0].occurredAt);

  return {
    status: resolveStatus({
      totalAttempts: events.length,
      acquired: acquired.length,
      available: available.length,
      outstandingFailures
    }),
    acquiredDimensions: acquired.length,
    availableDimensions: available.length,
    dimensions,
    totalAttempts: events.length,
    outstandingFailures,
    lastActivityAt
  };
}

/**
 * La règle, en toutes lettres, parce qu'elle est affichée à l'apprenant :
 *
 * - aucune activité : « non commencé » ;
 * - au moins un échec non rattrapé : « à revoir », quoi qu'il ait été acquis
 *   par ailleurs — un chapitre porte d'abord ce qui reste à reprendre ;
 * - toutes les dimensions disponibles acquises : « maîtrisé » ;
 * - sinon : « en cours ».
 */
function resolveStatus(input: {
  totalAttempts: number;
  acquired: number;
  available: number;
  outstandingFailures: number;
}): ChapterProgressStatus {
  if (input.totalAttempts === 0) {
    return "not-started";
  }

  if (input.outstandingFailures > 0) {
    return "to-review";
  }

  if (input.available > 0 && input.acquired === input.available) {
    return "mastered";
  }

  return "in-progress";
}

export const CHAPTER_PROGRESS_LABELS: Record<ChapterProgressStatus, string> = {
  "not-started": "Non commencé",
  "in-progress": "En cours",
  "to-review": "À revoir",
  mastered: "Maîtrisé"
};
