import {
  COMPTA_GENERALE_V1_TRACK,
  activeCurriculum,
  comptaCaseStudies,
  comptaGeneraleClotureExercises,
  comptaGeneraleV1Exercises,
  comptaGeneraleV1MiniCase,
  getComptaCaseStudyBySlug,
  getModuleLevelForExercise,
  getTrackLevels,
  type ComptaCaseStudy,
  type Exercise,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";
import type { ChoiceOption, ModuleExerciseKind } from "@/components/forms/module-exercise-form";
import { getCanonicalTrackState, type CanonicalLevelState } from "@/lib/learning-progression";
import { choiceOptions, exerciseKind } from "@/lib/typed-exercise";

/**
 * View model for the comptabilité générale v1 module.
 *
 * The level definitions and the evaluation type of each exercise come from
 * `@finance/domain`, so every page renders with no database — which is what
 * makes the module usable in the public demo and testable in the default
 * Playwright project. Only the *learner's* progression needs persistence, and it
 * degrades to "nothing acquired yet" rather than to an error.
 */

export const COMPTA_MODULE_BASE = "/modules/comptabilite-generale";

export interface ModuleExerciseView {
  exercise: Exercise;
  kind: ModuleExerciseKind;
  options: ChoiceOption[];
  levelId: string | null;
  href: string;
}

// Partagés avec les pages génériques depuis PR-12a (lib/typed-exercise.ts).
export { exerciseKind };

/** Tous les exercices du module : N1/N2 (v1) et N3/N4 (clôture). */
const moduleExercises: Exercise[] = [...comptaGeneraleV1Exercises, ...comptaGeneraleClotureExercises];

export function toExerciseView(exercise: Exercise): ModuleExerciseView {
  return {
    exercise,
    kind: exerciseKind(exercise.id),
    options: choiceOptions(exercise.id),
    levelId: getModuleLevelForExercise(exercise.id),
    href: `${COMPTA_MODULE_BASE}/exercices/${exercise.id}`
  };
}

export function getModuleExercise(exerciseId: string): ModuleExerciseView | null {
  const exercise = moduleExercises.find((candidate) => candidate.id === exerciseId);

  return exercise ? toExerciseView(exercise) : null;
}

export function getModuleLevels(): ModuleLevelDefinition[] {
  return getTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK);
}

export function getModuleLevel(position: number): ModuleLevelDefinition | null {
  return getModuleLevels().find((level) => level.level === position) ?? null;
}

/** Parses the `[level]` segment. Anything but 1..n is a 404, never a silent 1. */
export function parseLevelParam(raw: string): number | null {
  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

export interface ComptaModuleModel {
  levels: ModuleLevelDefinition[];
  levelStates: CanonicalLevelState[];
  snapshots: LevelSnapshot[];
  exercisesByLevel: Map<string, ModuleExerciseView[]>;
  miniCase: typeof comptaGeneraleV1MiniCase;
  caseStudies: ComptaCaseStudy[];
  score: number | null;
  passingScore: number;
  rulesLabel: string;
  /** False when progression cannot be stored, so the UI can say so. */
  progressionTracked: boolean;
}

export async function getComptaModuleModel(userId?: string | null): Promise<ComptaModuleModel> {
  const progression = await getCanonicalTrackState(userId, COMPTA_GENERALE_V1_TRACK);
  const levels = progression.publishedLevels.map((level) => level.definition);
  const snapshots = progression.publishedLevels.map((level) => level.snapshot);
  const exercisesByLevel = new Map<string, ModuleExerciseView[]>();

  for (const level of levels) {
    exercisesByLevel.set(
      level.id,
      moduleExercises.filter((exercise) => exercise.level === level.level).map(toExerciseView)
    );
  }

  return {
    levels,
    levelStates: progression.publishedLevels,
    snapshots,
    exercisesByLevel,
    miniCase: comptaGeneraleV1MiniCase,
    caseStudies: comptaCaseStudies,
    score: progression.score,
    passingScore: progression.passingScore,
    rulesLabel: progression.sourceLabel,
    progressionTracked: progression.mode === "enrolled"
  };
}

// --- Case studies N3/N4 ------------------------------------------------------

export interface CaseStudyStepView {
  caseStudy: ComptaCaseStudy;
  index: number;
  total: number;
  instruction: string;
  document: ComptaCaseStudy["documents"][number];
  exercise: ModuleExerciseView;
  nextHref: string | null;
}

export function listCaseStudies(): ComptaCaseStudy[] {
  return comptaCaseStudies;
}

export function getCaseStudy(slug: string): ComptaCaseStudy | null {
  return getComptaCaseStudyBySlug(slug);
}

export function caseStudyHref(caseStudy: ComptaCaseStudy): string {
  return `${COMPTA_MODULE_BASE}/cas/${caseStudy.slug}`;
}

/**
 * Une étape d'un case study N3/N4, résolue contre son dossier. Même règle que
 * le mini-cas : un index hors du cas est null, jamais rabattu sur l'étape 1.
 */
export function getCaseStudyStep(slug: string, position: number): CaseStudyStepView | null {
  const caseStudy = getComptaCaseStudyBySlug(slug);

  if (!caseStudy) {
    return null;
  }

  const step = caseStudy.steps[position - 1];

  if (!step) {
    return null;
  }

  const exercise = getModuleExercise(step.exerciseId);
  const document = caseStudy.documents.find((item) => item.id === step.documentId);

  if (!exercise || !document) {
    return null;
  }

  return {
    caseStudy,
    index: position,
    total: caseStudy.steps.length,
    instruction: step.instruction,
    document,
    exercise,
    nextHref:
      position < caseStudy.steps.length
        ? `${COMPTA_MODULE_BASE}/cas/${caseStudy.slug}/${position + 1}`
        : null
  };
}

export interface MiniCaseStepView {
  index: number;
  total: number;
  instruction: string;
  document: (typeof comptaGeneraleV1MiniCase.documents)[number];
  exercise: ModuleExerciseView;
  nextHref: string | null;
}

/**
 * One step of the mini-case, resolved against the dossier.
 *
 * Returns null for a step that does not exist rather than clamping to the first
 * one: a wrong index in the URL is a broken link, and silently showing step 1
 * would make the case look complete while a step was never done.
 */
export function getMiniCaseStep(position: number): MiniCaseStepView | null {
  const steps = comptaGeneraleV1MiniCase.steps;
  const step = steps[position - 1];

  if (!step) {
    return null;
  }

  const exercise = getModuleExercise(step.exerciseId);
  const document = comptaGeneraleV1MiniCase.documents.find((item) => item.id === step.documentId);

  if (!exercise || !document) {
    return null;
  }

  return {
    index: position,
    total: steps.length,
    instruction: step.instruction,
    document,
    exercise,
    nextHref:
      position < steps.length ? `${COMPTA_MODULE_BASE}/cas-pratique/${position + 1}` : null
  };
}
