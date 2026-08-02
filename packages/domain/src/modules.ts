import { getComptaGeneraleV1Level } from "./compta-generale-v1";
import { getExcelLabLevel } from "./excel-lab";

/**
 * Which curriculum level a module exercise feeds.
 *
 * One registry rather than a lookup per module, because the caller is
 * `submitAttempt`: it has an exercise id and needs the level to record a mastery
 * event against, and it should not have to learn the name of every module that
 * will ever exist. Adding a module is an entry here; the grading path does not
 * change.
 *
 * Returns null for an exercise that belongs to no module — most of the seeded
 * catalogue — which is a normal outcome, not an error: those exercises are
 * graded and reviewed, they simply feed no level.
 */
const LEVEL_RESOLVERS: Array<(exerciseId: string) => string | null> = [
  getComptaGeneraleV1Level,
  getExcelLabLevel
];

export function getModuleLevelForExercise(exerciseId: string): string | null {
  for (const resolve of LEVEL_RESOLVERS) {
    const levelId = resolve(exerciseId);

    if (levelId) {
      return levelId;
    }
  }

  return null;
}
