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
  /**
   * Les artefacts encore actifs, s'ils sont connus.
   *
   * `undefined` veut dire « on ne filtre pas » : c'est le comportement des
   * appelants qui n'ont pas la liste sous la main, et il ne change rien pour un
   * chapitre dont rien n'a été archivé.
   */
  activeArtifactIds?: ReadonlySet<string>;
  /**
   * Les étapes que chaque mini-cas publié attend, par identifiant de cas.
   *
   * Sans cette table, « Mini-cas terminé » s'acquérait sur *une* étape réussie :
   * un apprenant qui traite la première question d'un cas qui en compte six
   * décrochait la dimension, et pouvait afficher un chapitre « maîtrisé » sans
   * avoir fini le cas.
   */
  caseStepIds?: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Les dimensions qu'un chapitre peut faire travailler, déduites de ce qu'il
 * publie. Un chapitre sans exercice de calcul ne réclame pas de calcul.
 */
export function catalogueFromArtifactTypes(
  artifactTypes: readonly string[],
  options: {
    activeArtifactIds?: ReadonlySet<string>;
    caseStepIds?: ReadonlyMap<string, ReadonlySet<string>>;
  } = {}
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

  return {
    availableKinds: kinds,
    activeArtifactIds: options.activeArtifactIds,
    caseStepIds: options.caseStepIds
  };
}

/**
 * L'identifiant du cas dont vient un événement d'étape.
 *
 * La route enregistre `<idDuCas>#<idDeLÉtape>` : le cas et l'étape sont donc
 * tous deux récupérables, ce qui permet d'exiger la complétion du cas entier
 * plutôt que d'une étape quelconque.
 */
function splitCaseStep(artifactId: string): { caseId: string; stepId: string } | null {
  const separator = artifactId.indexOf("#");

  return separator === -1
    ? null
    : { caseId: artifactId.slice(0, separator), stepId: artifactId.slice(separator + 1) };
}

/**
 * Un mini-cas est terminé quand **toutes** ses étapes ont été réussies.
 *
 * Le compte de réussites ne suffisait pas : six étapes réussies pouvaient être
 * six fois la première. On regarde donc quelles étapes distinctes ont été
 * réussies, et on les compare à celles que le cas publie.
 *
 * Sans table d'étapes — un appelant qui ne l'a pas sous la main — on retombe sur
 * l'ancien comportement plutôt que de bloquer la dimension pour toujours.
 */
function completedCases(
  events: readonly ChapterActivityEvent[],
  caseStepIds: ReadonlyMap<string, ReadonlySet<string>> | undefined
): number {
  const succeededSteps = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.kind !== "case_step_attempt" || !event.succeeded) {
      continue;
    }

    const parts = splitCaseStep(event.artifactId);

    if (!parts) {
      continue;
    }

    const set = succeededSteps.get(parts.caseId) ?? new Set<string>();
    set.add(parts.stepId);
    succeededSteps.set(parts.caseId, set);
  }

  if (!caseStepIds) {
    return succeededSteps.size;
  }

  let complete = 0;

  for (const [caseId, expected] of caseStepIds) {
    const done = succeededSteps.get(caseId);

    if (done && [...expected].every((stepId) => done.has(stepId))) {
      complete += 1;
    }
  }

  return complete;
}

export function computeChapterProgress(
  events: readonly ChapterActivityEvent[],
  catalogue: ChapterCatalogue
): ChapterProgress {
  // LES ÉVÉNEMENTS D'ARTEFACTS RETIRÉS SONT ÉCARTÉS.
  //
  // Après un archivage ou une republication, l'ancien identifiant n'existe plus
  // : la route le refuse, et la réussite sur son remplaçant porte un identifiant
  // différent. Un échec sur l'ancienne version restait donc dans les échecs non
  // rattrapés pour toujours, et l'apprenant demeurait « à revoir » sur un
  // contenu qu'il ne pouvait plus ouvrir.
  const active = catalogue.activeArtifactIds;
  const relevant =
    active === undefined
      ? events
      : events.filter((event) => active.has(event.artifactId.split("#")[0]));

  const casesDone = completedCases(relevant, catalogue.caseStepIds);

  const dimensions: ChapterDimension[] = CHAPTER_ACTIVITY_KINDS.map((kind) => {
    const own = relevant.filter((event) => event.kind === kind);
    const successes = own.filter((event) => event.succeeded).length;

    // Le mini-cas se compte en *cas terminés*, pas en étapes réussies.
    const effectiveSuccesses = kind === "case_step_attempt" ? casesDone : successes;

    return {
      kind,
      label: DIMENSION_LABELS[kind],
      available: catalogue.availableKinds.has(kind),
      attempts: own.length,
      successes: effectiveSuccesses,
      acquired: effectiveSuccesses >= REQUIRED_SUCCESSES[kind]
    };
  });

  const available = dimensions.filter((dimension) => dimension.available);
  const acquired = available.filter((dimension) => dimension.acquired);

  // Un artefact compte comme « à revoir » tant que sa dernière tentative connue
  // est un échec. Compter les échecs bruts ferait qu'une notion ratée puis
  // maîtrisée resterait à revoir indéfiniment.
  const lastOutcomeByArtifact = new Map<string, boolean>();

  for (const event of [...relevant].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))) {
    lastOutcomeByArtifact.set(event.artifactId, event.succeeded);
  }

  const outstandingFailures = [...lastOutcomeByArtifact.values()].filter((succeeded) => !succeeded).length;

  const lastActivityAt =
    relevant.length === 0
      ? null
      : relevant.reduce(
          (latest, event) => (event.occurredAt > latest ? event.occurredAt : latest),
          relevant[0].occurredAt
        );

  return {
    status: resolveStatus({
      totalAttempts: relevant.length,
      acquired: acquired.length,
      available: available.length,
      outstandingFailures
    }),
    acquiredDimensions: acquired.length,
    availableDimensions: available.length,
    dimensions,
    totalAttempts: relevant.length,
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
