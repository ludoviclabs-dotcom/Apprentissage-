/**
 * Spreadsheet error values.
 *
 * An error is a *value* that flows through the calculation, exactly as in
 * Excel: `=1/0` does not throw, it evaluates to `#DIV/0!`, and `=A1+1` over
 * that cell evaluates to `#DIV/0!` too. Only two things are thrown in the whole
 * engine — a formula that cannot be parsed at all, and a workbook that exceeds
 * the engine's hard limits — because those are refusals, not results.
 */

export const ERROR_CODES = [
  "#DIV/0!",
  "#REF!",
  "#VALUE!",
  "#NAME?",
  "#CYCLE!",
  "#LIMIT!"
] as const;

export type SpreadsheetErrorCode = (typeof ERROR_CODES)[number];

/**
 * `#CYCLE!` and `#LIMIT!` are ours, not Excel's. Excel resolves a circular
 * reference to 0 behind a warning dialog, which is exactly the silent wrong
 * number a learner must never be handed; a cycle here is a named error on every
 * cell of the loop. `#LIMIT!` marks a formula the engine refused mid-way — its
 * evaluation budget ran out — so an aborted calculation can never be mistaken
 * for a finished one.
 */
export interface SpreadsheetErrorValue {
  readonly kind: "error";
  readonly code: SpreadsheetErrorCode;
  /** French, shown to the learner next to the code. */
  readonly message: string;
}

export function spreadsheetError(
  code: SpreadsheetErrorCode,
  message: string
): SpreadsheetErrorValue {
  return { kind: "error", code, message };
}

export function isSpreadsheetError(value: unknown): value is SpreadsheetErrorValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "error"
  );
}

/** A formula whose source text cannot be parsed. Position is zero-based. */
export class FormulaParseError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = "FormulaParseError";
    this.position = position;
  }
}

/**
 * A workbook the engine refuses to evaluate at all: too many cells, or an
 * input so malformed no per-cell error could carry the diagnosis.
 */
export class WorkbookLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookLimitError";
  }
}
