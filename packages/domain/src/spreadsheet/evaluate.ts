import type { CanonicalFunction, FormulaNode, RangeNode } from "./ast";
import {
  isSpreadsheetError,
  spreadsheetError,
  type SpreadsheetErrorValue
} from "./errors";
import { MAX_RANGE_CELLS } from "./limits";
import { addressKey } from "./refs";

/**
 * Expression evaluation.
 *
 * A scalar is what a cell can hold: a number, a text, a boolean, `null` for an
 * empty cell, or an error value. Errors are ordinary values that propagate —
 * `=1/0` *returns* `#DIV/0!` — so no formula can throw its way out of the
 * evaluator. The only exception is the step budget: exhausting it raises
 * `BudgetExhausted`, which the workbook catches per cell and records as
 * `#LIMIT!`, because an aborted calculation must never look like a result.
 *
 * Everything here is pure and deterministic: no clock, no randomness, no I/O,
 * and every loop is bounded by the limits in `limits.ts`.
 */

export type Scalar = number | string | boolean | null | SpreadsheetErrorValue;

/** Raised internally when the evaluation budget runs out. Never escapes the workbook. */
export class BudgetExhausted extends Error {
  constructor() {
    super("Budget d'évaluation épuisé.");
    this.name = "BudgetExhausted";
  }
}

export interface EvalContext {
  /** Value of a cell by canonical key; `null` when the cell is empty. */
  readCell(key: string): Scalar;
  /** One step per visited node or enumerated cell; throws `BudgetExhausted`. */
  charge(steps: number): void;
}

// --- Coercions ---------------------------------------------------------------

/** Arithmetic view of a scalar. Text must look like a number (dot decimal). */
function toNumber(value: Scalar): number | SpreadsheetErrorValue {
  if (value === null) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (isSpreadsheetError(value)) {
    return value;
  }

  const text = value.trim();
  const parsed = text === "" ? Number.NaN : Number(text);

  return Number.isFinite(parsed)
    ? parsed
    : spreadsheetError("#VALUE!", `« ${value} » n'est pas un nombre.`);
}

function toCondition(value: Scalar): boolean | SpreadsheetErrorValue {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (value === null) {
    return false;
  }

  if (isSpreadsheetError(value)) {
    return value;
  }

  return spreadsheetError("#VALUE!", "La condition d'un SI doit être un nombre ou un booléen.");
}

/** A finite number, or `#VALUE!` when an operation left the representable range. */
function finite(value: number): number | SpreadsheetErrorValue {
  return Number.isFinite(value)
    ? value
    : spreadsheetError("#VALUE!", "Résultat non représentable.");
}

// --- Comparison --------------------------------------------------------------

/**
 * Excel's ordering across types: number < text < boolean, text compared
 * case-insensitively. Empty compares as 0 against numbers, "" against text and
 * FALSE against booleans. Equality across types is false — `1="1"` is FALSE in
 * Excel, and the distinction matters in the ERP-cleaning exercises where a
 * figure stored as text is precisely the defect being hunted.
 */
function typeRank(value: number | string | boolean): number {
  return typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2;
}

function compareScalars(
  left: Scalar,
  right: Scalar
): number | SpreadsheetErrorValue {
  if (isSpreadsheetError(left)) {
    return left;
  }

  if (isSpreadsheetError(right)) {
    return right;
  }

  let a: number | string | boolean = left ?? 0;
  let b: number | string | boolean = right ?? 0;

  // An empty cell mirrors the other side's type, so `A1=""` and `A1=0` are
  // both true of an empty A1, as in Excel.
  if (left === null) {
    a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
  }

  if (right === null) {
    b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
  }

  const rankDiff = typeRank(a) - typeRank(b);

  if (rankDiff !== 0) {
    return rankDiff < 0 ? -1 : 1;
  }

  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1;
  }

  if (typeof a === "string" && typeof b === "string") {
    const lower = a.toLowerCase();
    const other = b.toLowerCase();
    return lower === other ? 0 : lower < other ? -1 : 1;
  }

  const aBool = a as boolean;
  const bBool = b as boolean;
  return aBool === bBool ? 0 : aBool ? 1 : -1;
}

// --- SUMIF criteria ----------------------------------------------------------

type CriteriaTest = (value: Scalar) => boolean;

const CRITERIA_OPERATORS = [">=", "<=", "<>", ">", "<", "="] as const;

/**
 * Compiles a SUMIF / SUMIFS criterion. `">100"`, `"<>Ventes"`, a bare number,
 * a bare text (equality, case-insensitive) or `""` (matches empty cells).
 * Wildcards (`*`, `?`) are not supported — a documented limit, not an oversight:
 * they would add a pattern language to a grammar meant to stay enumerable.
 */
export function compileCriteria(criteria: Scalar): CriteriaTest | SpreadsheetErrorValue {
  if (isSpreadsheetError(criteria)) {
    return criteria;
  }

  if (criteria === null) {
    return (value) => value === null;
  }

  if (typeof criteria === "number" || typeof criteria === "boolean") {
    return (value) => typeof value === typeof criteria && value === criteria;
  }

  const text = criteria;
  const operator = CRITERIA_OPERATORS.find((candidate) => text.startsWith(candidate));
  const operand = operator ? text.slice(operator.length) : text;
  const op = operator ?? "=";

  if (operand === "") {
    // "" matches empties; "<>" matches non-empties.
    if (op === "=") {
      return (value) => value === null || value === "";
    }

    if (op === "<>") {
      return (value) => value !== null && value !== "";
    }
  }

  const asNumber = operand.trim() === "" ? Number.NaN : Number(operand.trim());

  if (Number.isFinite(asNumber)) {
    return (value) => {
      if (typeof value !== "number") {
        return op === "<>";
      }

      return applyComparison(op, value === asNumber ? 0 : value < asNumber ? -1 : 1);
    };
  }

  const lowered = operand.toLowerCase();

  return (value) => {
    if (typeof value !== "string") {
      return op === "<>";
    }

    const cmp = value.toLowerCase() === lowered ? 0 : value.toLowerCase() < lowered ? -1 : 1;
    return applyComparison(op, cmp);
  };
}

function applyComparison(op: (typeof CRITERIA_OPERATORS)[number], cmp: number): boolean {
  switch (op) {
    case "=":
      return cmp === 0;
    case "<>":
      return cmp !== 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
  }
}

// --- Ranges ------------------------------------------------------------------

export function rangeSize(range: RangeNode): number {
  return (
    (range.end.address.column - range.start.address.column + 1) *
    (range.end.address.row - range.start.address.row + 1)
  );
}

/**
 * The cells of a range, row-major, `null` for empties. Positional, because
 * SUMIFS pairs the Nth cell of each of its ranges. Charged one step per cell,
 * and refused outright beyond `MAX_RANGE_CELLS`.
 */
function readRange(range: RangeNode, context: EvalContext): Scalar[] | SpreadsheetErrorValue {
  const size = rangeSize(range);

  if (size > MAX_RANGE_CELLS) {
    return spreadsheetError(
      "#REF!",
      `Plage trop grande (${size} cellules, maximum ${MAX_RANGE_CELLS}).`
    );
  }

  const values: Scalar[] = [];

  for (let row = range.start.address.row; row <= range.end.address.row; row += 1) {
    for (let column = range.start.address.column; column <= range.end.address.column; column += 1) {
      context.charge(1);
      values.push(context.readCell(addressKey({ column, row })));
    }
  }

  return values;
}

// --- Functions ---------------------------------------------------------------

/**
 * An argument, evaluated: a scalar, or the cell list of a range. Ranges stay
 * distinct from scalars because the aggregation functions treat them
 * differently — text inside a range is skipped, text passed directly is a
 * `#VALUE!` — mirroring Excel.
 */
type ArgValue = { kind: "scalar"; value: Scalar } | { kind: "list"; values: Scalar[] };

function numericItems(args: ArgValue[]): number[] | SpreadsheetErrorValue {
  const numbers: number[] = [];

  for (const arg of args) {
    if (arg.kind === "scalar") {
      const value = toNumber(arg.value);

      if (isSpreadsheetError(value)) {
        return value;
      }

      numbers.push(value);
      continue;
    }

    for (const value of arg.values) {
      if (isSpreadsheetError(value)) {
        return value;
      }

      if (typeof value === "number") {
        numbers.push(value);
      }
      // Text, booleans and empties inside a range are ignored, as in Excel.
    }
  }

  return numbers;
}

function callSum(args: ArgValue[]): Scalar {
  const numbers = numericItems(args);

  if (isSpreadsheetError(numbers)) {
    return numbers;
  }

  return finite(numbers.reduce((sum, value) => sum + value, 0));
}

function callAverage(args: ArgValue[]): Scalar {
  const numbers = numericItems(args);

  if (isSpreadsheetError(numbers)) {
    return numbers;
  }

  if (numbers.length === 0) {
    return spreadsheetError("#DIV/0!", "MOYENNE sans aucune valeur numérique.");
  }

  return finite(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function callMinMax(args: ArgValue[], pick: (a: number, b: number) => number): Scalar {
  const numbers = numericItems(args);

  if (isSpreadsheetError(numbers)) {
    return numbers;
  }

  if (numbers.length === 0) {
    return 0; // Excel's MIN()/MAX() over no numbers.
  }

  return finite(numbers.reduce((best, value) => pick(best, value)));
}

function expectList(arg: ArgValue | undefined, name: string): Scalar[] | SpreadsheetErrorValue {
  if (!arg || arg.kind !== "list") {
    return spreadsheetError("#VALUE!", `${name} attend une plage (ex. B2:B10).`);
  }

  return arg.values;
}

function expectScalar(arg: ArgValue | undefined, name: string): Scalar | SpreadsheetErrorValue {
  if (!arg || arg.kind !== "scalar") {
    return spreadsheetError("#VALUE!", `${name} attend une valeur simple, pas une plage.`);
  }

  return arg.value;
}

function callSumIf(args: ArgValue[]): Scalar {
  if (args.length < 2 || args.length > 3) {
    return spreadsheetError("#VALUE!", "SOMME.SI attend 2 ou 3 arguments.");
  }

  const testRange = expectList(args[0], "SOMME.SI");

  if (isSpreadsheetError(testRange)) {
    return testRange;
  }

  const criteria = expectScalar(args[1], "SOMME.SI");

  if (isSpreadsheetError(criteria)) {
    return criteria;
  }

  const sumRange = args[2] ? expectList(args[2], "SOMME.SI") : testRange;

  if (isSpreadsheetError(sumRange)) {
    return sumRange;
  }

  if (sumRange.length !== testRange.length) {
    return spreadsheetError(
      "#VALUE!",
      "SOMME.SI : la plage à sommer doit avoir la taille de la plage testée."
    );
  }

  const test = compileCriteria(criteria);

  if (isSpreadsheetError(test)) {
    return test;
  }

  let sum = 0;

  for (let index = 0; index < testRange.length; index += 1) {
    const probe = testRange[index];

    if (isSpreadsheetError(probe)) {
      return probe;
    }

    if (test(probe)) {
      const value = sumRange[index];

      if (isSpreadsheetError(value)) {
        return value;
      }

      if (typeof value === "number") {
        sum += value;
      }
    }
  }

  return finite(sum);
}

function callSumIfs(args: ArgValue[]): Scalar {
  if (args.length < 3 || args.length % 2 === 0) {
    return spreadsheetError(
      "#VALUE!",
      "SOMME.SI.ENS attend une plage à sommer puis des paires plage/critère."
    );
  }

  const sumRange = expectList(args[0], "SOMME.SI.ENS");

  if (isSpreadsheetError(sumRange)) {
    return sumRange;
  }

  const tests: Array<{ range: Scalar[]; test: CriteriaTest }> = [];

  for (let index = 1; index < args.length; index += 2) {
    const range = expectList(args[index], "SOMME.SI.ENS");

    if (isSpreadsheetError(range)) {
      return range;
    }

    if (range.length !== sumRange.length) {
      return spreadsheetError(
        "#VALUE!",
        "SOMME.SI.ENS : toutes les plages doivent avoir la même taille."
      );
    }

    const criteria = expectScalar(args[index + 1], "SOMME.SI.ENS");

    if (isSpreadsheetError(criteria)) {
      return criteria;
    }

    const test = compileCriteria(criteria);

    if (isSpreadsheetError(test)) {
      return test;
    }

    tests.push({ range, test });
  }

  let sum = 0;

  for (let index = 0; index < sumRange.length; index += 1) {
    let matches = true;

    for (const { range, test } of tests) {
      const probe = range[index];

      if (isSpreadsheetError(probe)) {
        return probe;
      }

      if (!test(probe)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const value = sumRange[index];

      if (isSpreadsheetError(value)) {
        return value;
      }

      if (typeof value === "number") {
        sum += value;
      }
    }
  }

  return finite(sum);
}

// --- The evaluator -----------------------------------------------------------

function evaluateArg(node: FormulaNode, context: EvalContext): ArgValue | SpreadsheetErrorValue {
  if (node.kind === "range") {
    const values = readRange(node, context);

    return isSpreadsheetError(values) ? values : { kind: "list", values };
  }

  return { kind: "scalar", value: evaluateNode(node, context) };
}

function evaluateCall(
  name: CanonicalFunction,
  argNodes: readonly FormulaNode[],
  context: EvalContext
): Scalar {
  // IF evaluates lazily: only the taken branch runs, so `=SI(B1>0;1;1/0)`
  // returns 1. The *dependency graph* still sees both branches — that is a
  // static property — which is also why a self-reference in an untaken branch
  // is still a cycle, exactly as Excel flags it.
  if (name === "IF") {
    if (argNodes.length < 2 || argNodes.length > 3) {
      return spreadsheetError("#VALUE!", "SI attend 2 ou 3 arguments.");
    }

    const condition = toCondition(evaluateNode(argNodes[0], context));

    if (isSpreadsheetError(condition)) {
      return condition;
    }

    if (condition) {
      return evaluateNode(argNodes[1], context);
    }

    return argNodes[2] ? evaluateNode(argNodes[2], context) : false;
  }

  const args: ArgValue[] = [];

  for (const argNode of argNodes) {
    const arg = evaluateArg(argNode, context);

    if (isSpreadsheetError(arg)) {
      return arg;
    }

    args.push(arg);
  }

  switch (name) {
    case "SUM":
      return callSum(args);
    case "AVERAGE":
      return callAverage(args);
    case "MIN":
      return callMinMax(args, Math.min);
    case "MAX":
      return callMinMax(args, Math.max);
    case "SUMIF":
      return callSumIf(args);
    case "SUMIFS":
      return callSumIfs(args);
  }
}

export function evaluateNode(node: FormulaNode, context: EvalContext): Scalar {
  context.charge(1);

  switch (node.kind) {
    case "number":
      return node.value;

    case "string":
      return node.value;

    case "ref":
      return context.readCell(addressKey(node.address));

    case "range":
      // A bare range where a single value is expected: `=B2:B10+1` has no
      // meaning in this grammar (no implicit intersection, no spilling).
      return spreadsheetError(
        "#VALUE!",
        "Une plage ne peut être utilisée ici ; passez-la à une fonction (ex. SOMME)."
      );

    case "call": {
      if (!node.known) {
        return spreadsheetError(
          "#NAME?",
          `Fonction inconnue : ${node.name}. Fonctions disponibles : SOMME, MOYENNE, MIN, MAX, SI, SOMME.SI, SOMME.SI.ENS.`
        );
      }

      return evaluateCall(node.known, node.args, context);
    }

    case "unary": {
      const operand = toNumber(evaluateNode(node.operand, context));

      if (isSpreadsheetError(operand)) {
        return operand;
      }

      return node.op === "-" ? finite(-operand) : operand;
    }

    case "binary": {
      const leftValue = evaluateNode(node.left, context);

      if (isSpreadsheetError(leftValue)) {
        return leftValue;
      }

      const rightValue = evaluateNode(node.right, context);

      if (isSpreadsheetError(rightValue)) {
        return rightValue;
      }

      switch (node.op) {
        case "+":
        case "-":
        case "*":
        case "/": {
          const left = toNumber(leftValue);

          if (isSpreadsheetError(left)) {
            return left;
          }

          const right = toNumber(rightValue);

          if (isSpreadsheetError(right)) {
            return right;
          }

          if (node.op === "/") {
            if (right === 0) {
              return spreadsheetError("#DIV/0!", "Division par zéro.");
            }

            return finite(left / right);
          }

          if (node.op === "+") {
            return finite(left + right);
          }

          if (node.op === "-") {
            return finite(left - right);
          }

          return finite(left * right);
        }

        default: {
          const cmp = compareScalars(leftValue, rightValue);

          if (isSpreadsheetError(cmp)) {
            return cmp;
          }

          return applyComparison(node.op, cmp);
        }
      }
    }
  }
}
