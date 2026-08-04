/**
 * Hard bounds of the formula engine.
 *
 * Every limit here exists so the engine can refuse work instead of doing an
 * unbounded amount of it. The engine runs inside a request handler and inside
 * the browser on every keystroke; a formula must never be able to make either
 * spin. The budget is counted in *steps*, not milliseconds, so the same
 * submission is accepted or refused identically on every machine — a wall-clock
 * limit would make grading depend on the grader's CPU.
 */

/** Longest accepted formula source, in characters. */
export const MAX_FORMULA_LENGTH = 512;

/** Deepest accepted expression nesting. `=((((…))))` beyond this is refused. */
export const MAX_AST_DEPTH = 32;

/** Most arguments a single function call may carry. */
export const MAX_CALL_ARGS = 64;

/**
 * Sheet bounds. A reference outside them is `#REF!`: the sheet is finite so a
 * range can never be asked to enumerate more cells than `MAX_RANGE_CELLS`
 * allows, whatever its syntax says.
 */
export const MAX_COLUMNS = 64; // A..BL
export const MAX_ROWS = 9999;

/** Most cells a single range may span before evaluation refuses it. */
export const MAX_RANGE_CELLS = 4096;

/** Most cells a workbook may hold. The largest authored grid is far below. */
export const MAX_WORKBOOK_CELLS = 2000;

/**
 * Evaluation budget for one full workbook recalculation. Each visited AST node
 * and each cell read out of a range costs one step. The budget is generous —
 * the biggest authored model costs a few thousand steps — and exists purely so
 * a pathological workbook fails with a named error instead of hanging.
 */
export const MAX_EVAL_STEPS = 200_000;
