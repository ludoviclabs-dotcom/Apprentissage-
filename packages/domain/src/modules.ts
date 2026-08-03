import { comptaGeneraleV1Sources, getComptaGeneraleV1Level } from "./compta-generale-v1";
import { excelLabSources, getExcelLabLevel } from "./excel-lab";
import type { SourceReference } from "./types";

/**
 * What a module exercise is attached to: its curriculum level, and its sources.
 *
 * One registry rather than a lookup per module, because the caller is
 * `submitAttempt`: it has an exercise id and needs both, and it should not have
 * to learn the name of every module that will ever exist. Adding a module is an
 * entry here; the grading path does not change.
 *
 * Returns null for an exercise that belongs to no module — most of the seeded
 * catalogue — which is a normal outcome, not an error: those exercises are
 * graded and reviewed, they simply feed no level and resolve their sources the
 * old way, through the lessons that link to them.
 */
interface ModuleRegistration {
  level: (exerciseId: string) => string | null;
  sources: SourceReference[];
}

const MODULES: ModuleRegistration[] = [
  { level: getComptaGeneraleV1Level, sources: comptaGeneraleV1Sources },
  { level: getExcelLabLevel, sources: excelLabSources }
];

export function getModuleLevelForExercise(exerciseId: string): string | null {
  for (const module of MODULES) {
    const levelId = module.level(exerciseId);

    if (levelId) {
      return levelId;
    }
  }

  return null;
}

/**
 * The sources a module's corrections should cite.
 *
 * `getExerciseSourceReferences` resolves references through the *lessons* that
 * link to an exercise, or failing that any lesson in the same domain. The Excel
 * lab has neither — there are no `finance` lessons at all — so its corrections
 * came back with an empty citation list and the panel said "aucune source
 * attachée", while the exercise page displayed the module's own sources right
 * below. A module that declares its sources is asked here first.
 */
export function getModuleSourceReferences(exerciseId: string): SourceReference[] | null {
  for (const module of MODULES) {
    if (module.level(exerciseId)) {
      return module.sources;
    }
  }

  return null;
}
