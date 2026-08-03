import "server-only";

import {
  ACTIVITY_KINDS,
  activeCurriculum,
  canonicalLearningTracks,
  evaluateTrack,
  getCanonicalTrackDefinition,
  getModuleLevelForExercise,
  getPublishedTrackLevels,
  getTrackLevels,
  type CanonicalTrackDefinition,
  type CurriculumVersion,
  type LevelSnapshot,
  type LevelStatus,
  type ModuleLevelDefinition,
  type UnlockBlocker
} from "@finance/domain";
import {
  canUseDatabase,
  getActiveCurriculumVersion,
  getEnrollment,
  getTrackCurriculum,
  refreshTrackProgress
} from "@finance/db";

export interface CanonicalLevelState {
  definition: ModuleLevelDefinition;
  snapshot: LevelSnapshot;
  status: LevelStatus;
  href: string | null;
  canOpen: boolean;
}

export interface CanonicalNextAction {
  trackId: string;
  levelId: string;
  label: string;
  title: string;
  href: string;
}

export interface CanonicalTrackState {
  track: CanonicalTrackDefinition;
  curriculumId: string;
  curriculumLabel: string;
  sourceLabel: string;
  mode: "demo" | "new" | "enrolled";
  levels: CanonicalLevelState[];
  publishedLevels: CanonicalLevelState[];
  score: number | null;
  passingScore: number;
  criticalCompetencies: Array<{
    levelId: string;
    competencyId: string;
    minimum: number;
  }>;
  finalDiagnosticCompleted: boolean;
  blockers: UnlockBlocker[];
  nextAction: CanonicalNextAction | null;
}

export interface CanonicalLearningProgression {
  mode: "demo" | "personal";
  tracks: CanonicalTrackState[];
  score: number | null;
  nextAction: CanonicalNextAction | null;
}

function plannedSnapshot(levelId: string, rulesVersion: string): LevelSnapshot {
  return {
    levelId,
    rulesVersion,
    status: "planned",
    score: 0,
    components: { direct: 0, retention: 0, caseStudy: 0, explanation: 0 },
    missingKinds: [...ACTIVITY_KINDS],
    finalDiagnosticCompleted: false,
    blockers: []
  };
}

function emptyPublishedSnapshots(curriculum: CurriculumVersion, trackId: string): LevelSnapshot[] {
  return evaluateTrack(
    getPublishedTrackLevels(curriculum, trackId).map((level) => ({
      levelId: level.id,
      criticalCompetencies: level.criticalCompetencyIds.map((competencyId) => ({
        competencyId,
        strength: 0
      }))
    })),
    { events: [], acquiredLevelIds: [] },
    curriculum.rules
  );
}

async function resolveCurriculum(
  userId: string | null | undefined,
  trackId: string
): Promise<{ curriculum: CurriculumVersion; mode: CanonicalTrackState["mode"] }> {
  if (!userId) {
    return { curriculum: activeCurriculum, mode: "demo" };
  }

  if (!canUseDatabase()) {
    return { curriculum: activeCurriculum, mode: "new" };
  }

  const enrollment = await getEnrollment(userId, trackId);

  if (enrollment) {
    const pinned = await getTrackCurriculum(userId, trackId);

    if (!pinned) {
      throw new Error(`Curriculum épinglé introuvable pour le track "${trackId}".`);
    }

    return { curriculum: pinned, mode: "enrolled" };
  }

  const active = await getActiveCurriculumVersion();

  if (!active) {
    throw new Error(
      "Le catalogue de progression n'est pas initialisé. Lance `pnpm db:seed` après les migrations."
    );
  }

  return { curriculum: active, mode: "new" };
}

function scoreForTrack(levels: CanonicalLevelState[]): number {
  const published = levels.filter((level) => level.definition.publicationStatus === "published");

  if (published.length === 0) {
    return 0;
  }

  return Math.round(
    (published.reduce((sum, level) => sum + level.snapshot.score, 0) / published.length) * 100
  ) / 100;
}

export async function getCanonicalTrackState(
  userId: string | null | undefined,
  trackId: string
): Promise<CanonicalTrackState> {
  const track = getCanonicalTrackDefinition(trackId);

  if (!track) {
    throw new Error(`Track canonique inconnu : "${trackId}".`);
  }

  const { curriculum, mode } = await resolveCurriculum(userId, trackId);
  const definitions = getTrackLevels(curriculum, trackId);

  if (definitions.length === 0) {
    throw new Error(`Le curriculum "${curriculum.id}" ne publie pas le track "${trackId}".`);
  }

  const evaluated =
    mode === "enrolled" && userId
      ? await refreshTrackProgress(userId, trackId)
      : emptyPublishedSnapshots(curriculum, trackId);
  const snapshots = new Map(evaluated.map((snapshot) => [snapshot.levelId, snapshot]));
  const levels = definitions.map((definition) => {
    const snapshot =
      definition.publicationStatus === "planned"
        ? plannedSnapshot(definition.id, curriculum.rules.version)
        : snapshots.get(definition.id) ?? plannedSnapshot(definition.id, curriculum.rules.version);
    const canOpen =
      definition.publicationStatus === "published" &&
      snapshot.status !== "locked" &&
      snapshot.status !== "planned";

    return {
      definition,
      snapshot,
      status: snapshot.status,
      canOpen,
      href: canOpen ? `${track.href}/${definition.level}` : null
    } satisfies CanonicalLevelState;
  });
  const publishedLevels = levels.filter(
    (level) => level.definition.publicationStatus === "published"
  );
  const actionable = publishedLevels.find(
    (level) => level.status === "in_progress" || level.status === "available"
  );
  const nextAction = actionable?.href
    ? {
        trackId,
        levelId: actionable.definition.id,
        label: mode === "demo" ? "Essayer la démonstration" : "Prochaine action",
        title: actionable.definition.title,
        href:
          mode === "demo"
            ? `${track.href}/exercices/${track.demoExerciseId}`
            : actionable.href
      }
    : null;

  return {
    track,
    curriculumId: curriculum.id,
    curriculumLabel: curriculum.label,
    sourceLabel: `${track.sourceLabel} · ${curriculum.id}`,
    mode,
    levels,
    publishedLevels,
    score: mode === "demo" ? null : scoreForTrack(levels),
    passingScore: curriculum.rules.passingScore,
    criticalCompetencies: publishedLevels.flatMap((level) =>
      level.definition.criticalCompetencyIds.map((competencyId) => ({
        levelId: level.definition.id,
        competencyId,
        minimum: curriculum.rules.criticalCompetencyMinimum
      }))
    ),
    finalDiagnosticCompleted: publishedLevels.every(
      (level) => level.snapshot.finalDiagnosticCompleted
    ),
    blockers: actionable?.snapshot.blockers ?? [],
    nextAction
  };
}

export async function getCanonicalLearningProgression(
  userId?: string | null
): Promise<CanonicalLearningProgression> {
  const tracks = await Promise.all(
    canonicalLearningTracks.map((track) => getCanonicalTrackState(userId, track.trackId))
  );
  const personalScores = tracks
    .map((track) => track.score)
    .filter((score): score is number => score !== null);

  return {
    mode: userId ? "personal" : "demo",
    tracks,
    score:
      userId && personalScores.length > 0
        ? Math.round(
            (personalScores.reduce((sum, score) => sum + score, 0) / personalScores.length) * 100
          ) / 100
        : null,
    nextAction: tracks.map((track) => track.nextAction).find(Boolean) ?? null
  };
}

export async function getLevelAccess(input: {
  userId?: string | null;
  trackId: string;
  level: number;
}): Promise<CanonicalLevelState | null> {
  const state = await getCanonicalTrackState(input.userId, input.trackId);
  return state.levels.find((level) => level.definition.level === input.level) ?? null;
}

export async function getExerciseAccess(input: {
  userId?: string | null;
  exerciseId: string;
}): Promise<{ allowed: boolean; reason: string; level: CanonicalLevelState | null }> {
  const levelId = getModuleLevelForExercise(input.exerciseId);

  if (!levelId) {
    return { allowed: true, reason: "outside-canonical-curriculum", level: null };
  }

  const track = canonicalLearningTracks.find((candidate) =>
    Object.keys(candidate.diagnosticExerciseIds).includes(levelId)
  );

  if (!track) {
    return { allowed: false, reason: "track-not-published", level: null };
  }

  const state = await getCanonicalTrackState(input.userId, track.trackId);
  const level = state.levels.find((candidate) => candidate.definition.id === levelId) ?? null;

  if (!level?.canOpen) {
    return { allowed: false, reason: "level-locked", level };
  }

  if (!input.userId && input.exerciseId !== track.demoExerciseId) {
    return { allowed: false, reason: "demo-exercise-only", level };
  }

  return { allowed: true, reason: "allowed", level };
}
