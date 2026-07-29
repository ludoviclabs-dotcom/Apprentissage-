import {
  activeCurriculum,
  evaluateTrack,
  getTrackLevels,
  type CurriculumVersion,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";
import { getFeatures } from "@/lib/features";

export interface LevelTrackModel {
  trackId: string;
  levels: ModuleLevelDefinition[];
  snapshots: LevelSnapshot[];
  passingScore: number;
  rulesLabel: string;
  /** False when progression is not being stored, so the UI can say so. */
  persisted: boolean;
}

/**
 * Progression for one track.
 *
 * Level definitions always come from the domain curriculum, so the track renders
 * identically in the seeded demo and with a database. Only the snapshots differ:
 * signed in with persistence on they are the learner's real state; otherwise they
 * are the evaluation of an empty event list, which correctly shows level 1 as
 * available and the rest as locked instead of inventing progress.
 */
export async function getLevelTrackModel(
  userId?: string | null,
  trackId = "track-compta-generale"
): Promise<LevelTrackModel> {
  const features = getFeatures();
  const toBase = (curriculum: CurriculumVersion): Omit<LevelTrackModel, "snapshots" | "persisted"> => ({
    trackId,
    levels: getTrackLevels(curriculum, trackId),
    passingScore: curriculum.rules.passingScore,
    rulesLabel: curriculum.label
  });

  const evaluateEmpty = (curriculum: CurriculumVersion) =>
    evaluateTrack(
      getTrackLevels(curriculum, trackId).map((level) => ({ levelId: level.id, criticalCompetencies: [] })),
      { events: [], acquiredLevelIds: [] },
      curriculum.rules
    );

  if (!userId || !features.persistence.enabled) {
    return { ...toBase(activeCurriculum), snapshots: evaluateEmpty(activeCurriculum), persisted: false };
  }

  try {
    const { getTrackCurriculum, refreshTrackProgress } = await import("@finance/db");
    const curriculum = await getTrackCurriculum(userId, trackId);

    if (!curriculum) {
      return { ...toBase(activeCurriculum), snapshots: evaluateEmpty(activeCurriculum), persisted: false };
    }

    const snapshots = await refreshTrackProgress(userId, trackId);

    // An empty result means the curriculum catalogue has not been seeded, not
    // that the learner is at zero. Rendering it would gate every level including
    // the first, with no explanation — so fall back to the honest starting state.
    if (snapshots.length === 0) {
      return { ...toBase(curriculum), snapshots: evaluateEmpty(curriculum), persisted: false };
    }

    return { ...toBase(curriculum), snapshots, persisted: true };
  } catch {
    // A progression read must never take the page down. Falling back to the
    // empty evaluation is visibly "nothing done yet" rather than wrong data.
    return { ...toBase(activeCurriculum), snapshots: evaluateEmpty(activeCurriculum), persisted: false };
  }
}
