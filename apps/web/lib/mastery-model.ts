/**
 * Compatibility export for callers created before ADR-008.
 *
 * New code imports the canonical repository directly. Keeping only this alias
 * prevents the former legacy curriculum fallback from becoming a second source
 * of progression truth again.
 */
export {
  getCanonicalLearningProgression as getLevelTrackModel,
  type CanonicalLearningProgression as LevelTrackModel
} from "./learning-progression";
