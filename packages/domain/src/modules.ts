import type { EntitlementFeature } from "./billing";
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
  /**
   * The entitlement a learner must hold to work on this module, or null when it
   * is part of the free core. Declared here rather than checked at each call
   * site so the paywall cannot disagree with itself: the page, the level route
   * and the submission endpoint all ask the same registry.
   */
  premiumFeature: EntitlementFeature | null;
}

const MODULES: ModuleRegistration[] = [
  // The accounting core stays free: it is the track that has to be finishable
  // before anybody is asked to pay for anything.
  { level: getComptaGeneraleV1Level, sources: comptaGeneraleV1Sources, premiumFeature: null },
  { level: getExcelLabLevel, sources: excelLabSources, premiumFeature: "excel-finance-lab" }
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

/**
 * The entitlement required to attempt an exercise, or null when it is free.
 *
 * Exercises outside every module — the seeded catalogue — are free, which is why
 * "belongs to no module" and "needs nothing" give the same answer here.
 */
export function getRequiredEntitlement(exerciseId: string): EntitlementFeature | null {
  for (const module of MODULES) {
    if (module.level(exerciseId)) {
      return module.premiumFeature;
    }
  }

  return null;
}
