/**
 * The bounded spreadsheet formula engine (PR-12b).
 *
 * One import surface for the whole feature: parse, evaluate, inspect. The
 * grammar is closed (seven functions, four operators, comparisons, references,
 * ranges), every limit is a named constant, and nothing in here can reach the
 * network, the filesystem, or the JavaScript runtime — see
 * `docs/adr/009-excel-formula-engine.md` for the reasoning and the exact
 * limits.
 */

export {
  CANONICAL_FUNCTIONS,
  FUNCTION_ALIASES,
  formatFormula,
  profileFormula,
  rangeKey,
  type BinaryOperator,
  type CanonicalFunction,
  type FormulaNode,
  type FormulaProfile,
  type RangeNode,
  type RefNode
} from "./ast";
export {
  ERROR_CODES,
  FormulaParseError,
  WorkbookLimitError,
  isSpreadsheetError,
  spreadsheetError,
  type SpreadsheetErrorCode,
  type SpreadsheetErrorValue
} from "./errors";
export { compileCriteria, type Scalar } from "./evaluate";
export {
  MAX_AST_DEPTH,
  MAX_CALL_ARGS,
  MAX_COLUMNS,
  MAX_EVAL_STEPS,
  MAX_FORMULA_LENGTH,
  MAX_RANGE_CELLS,
  MAX_ROWS,
  MAX_WORKBOOK_CELLS
} from "./limits";
export { parseFormula } from "./parser";
export {
  addressKey,
  columnIndex,
  columnLabel,
  compareCellKeys,
  isWithinSheet,
  parseCellKey,
  type CellAddress
} from "./refs";
export {
  evaluateWorkbook,
  formatScalar,
  getDependents,
  getPrecedents,
  type EvaluatedCell,
  type EvaluatedWorkbook,
  type WorkbookCellInput,
  type WorkbookInput
} from "./workbook";
