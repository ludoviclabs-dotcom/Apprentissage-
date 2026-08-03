import { journalEntryEvaluator } from "./journal-entry";
import { multipleChoiceEvaluator } from "./multiple-choice";
import { numericEvaluator } from "./numeric";
import { shortTextRubricEvaluator } from "./short-text-rubric";
import { spreadsheetEvaluator } from "./spreadsheet";
import { spreadsheetFormulaEvaluator } from "./spreadsheet-formula";
import { InvalidEvaluationSpecError, type EvaluationType, type Evaluator } from "./types";

export * from "./types";
export * from "./numeric";
export * from "./multiple-choice";
export * from "./journal-entry";
export * from "./short-text-rubric";
export * from "./spreadsheet";
export * from "./spreadsheet-formula";
export * from "./to-correction";

/**
 * Registry of the evaluators that own their own specification format.
 *
 * `legacy_rubric` is deliberately absent: it wraps the previous grader, which
 * needs the whole `Exercise` rather than a spec, so it cannot satisfy this
 * interface. It lives in `packages/db` next to that grader and is selected by the
 * submission service. Keeping it out means nothing new can be authored against
 * it by accident.
 */
const REGISTRY = {
  numeric: numericEvaluator,
  multiple_choice: multipleChoiceEvaluator,
  journal_entry: journalEntryEvaluator,
  short_text_rubric: shortTextRubricEvaluator,
  spreadsheet: spreadsheetEvaluator,
  spreadsheet_formula: spreadsheetFormulaEvaluator
} as const satisfies Partial<Record<EvaluationType, Evaluator<never, never>>>;

export type SpecEvaluationType = keyof typeof REGISTRY;

export const SPEC_EVALUATION_TYPES = Object.keys(REGISTRY) as SpecEvaluationType[];

export function isSpecEvaluationType(value: string): value is SpecEvaluationType {
  return Object.hasOwn(REGISTRY, value);
}

export function getEvaluator<T extends SpecEvaluationType>(type: T): (typeof REGISTRY)[T] {
  return REGISTRY[type];
}

/**
 * Validates an authored specification against its evaluator.
 *
 * Used by the seed and by the content tests so a malformed exercise fails where
 * it is written, rather than at the moment a learner submits an answer to it.
 */
export function assertValidEvaluationSpec(type: string, spec: unknown): void {
  if (!isSpecEvaluationType(type)) {
    throw new InvalidEvaluationSpecError(`Unknown evaluation type "${type}".`);
  }

  const evaluator = REGISTRY[type] as Evaluator<unknown, unknown>;

  evaluator.assertValidSpec(spec);
}
