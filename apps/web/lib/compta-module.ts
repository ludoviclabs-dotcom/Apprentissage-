import {
  COMPTA_GENERALE_V1_TRACK,
  activeCurriculum,
  authoredExerciseVersions,
  comptaGeneraleV1Exercises,
  comptaGeneraleV1MiniCase,
  getComptaGeneraleV1Exercises,
  getComptaGeneraleV1Level,
  getTrackLevels,
  type Exercise,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";
import type { ChoiceOption, ModuleExerciseKind } from "@/components/forms/module-exercise-form";
import { getCanonicalTrackState, type CanonicalLevelState } from "@/lib/learning-progression";

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

/**
 * Which input an exercise is answered with.
 *
 * Read off the authored specification rather than `Exercise.type`, for the same
 * reason `submitAttempt` selects its evaluator that way: the display type and
 * the graded type disagree across the existing catalogue, and rendering a
 * number field for something graded as prose would guarantee a zero.
 */
export function exerciseKind(exerciseId: string): ModuleExerciseKind {
  const authored = authoredExerciseVersions.find((version) => version.exerciseId === exerciseId);

  switch (authored?.evaluationType) {
    case "journal_entry":
      return "journal_entry";
    case "numeric":
      return "numeric";
    case "multiple_choice":
      return "multiple_choice";
    default:
      // Includes `legacy_rubric` and an unauthored exercise: prose is the only
      // input the rubric matcher can read.
      return "text";
  }
}

function choiceOptions(exerciseId: string): ChoiceOption[] {
  const authored = authoredExerciseVersions.find((version) => version.exerciseId === exerciseId);

  if (authored?.evaluationType !== "multiple_choice") {
    return [];
  }

  const spec = authored.spec as { options?: ChoiceOption[] };

  return spec.options ?? [];
}

export function toExerciseView(exercise: Exercise): ModuleExerciseView {
  return {
    exercise,
    kind: exerciseKind(exercise.id),
    options: choiceOptions(exercise.id),
    levelId: getComptaGeneraleV1Level(exercise.id),
    href: `${COMPTA_MODULE_BASE}/exercices/${exercise.id}`
  };
}

export function getModuleExercise(exerciseId: string): ModuleExerciseView | null {
  const exercise = comptaGeneraleV1Exercises.find((candidate) => candidate.id === exerciseId);

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
      getComptaGeneraleV1Exercises(level.level === 1 ? 1 : 2).map(toExerciseView)
    );
  }

  return {
    levels,
    levelStates: progression.publishedLevels,
    snapshots,
    exercisesByLevel,
    miniCase: comptaGeneraleV1MiniCase,
    score: progression.score,
    passingScore: progression.passingScore,
    rulesLabel: progression.sourceLabel,
    progressionTracked: progression.mode === "enrolled"
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
