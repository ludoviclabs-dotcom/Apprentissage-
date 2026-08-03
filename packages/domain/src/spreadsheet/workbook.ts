import { profileFormula, type FormulaNode, type FormulaProfile } from "./ast";
import {
  FormulaParseError,
  WorkbookLimitError,
  isSpreadsheetError,
  spreadsheetError
} from "./errors";
import { BudgetExhausted, evaluateNode, type Scalar } from "./evaluate";
import { MAX_EVAL_STEPS, MAX_WORKBOOK_CELLS } from "./limits";
import { addressKey, compareCellKeys, parseCellKey } from "./refs";
import { parseFormula } from "./parser";

/**
 * The workbook: parse every formula once, build the dependency graph, detect
 * cycles statically, then evaluate every cell in one deterministic pass.
 *
 * RECALCULATION IS TOTAL, NOT INCREMENTAL. Every edit re-evaluates the whole
 * workbook. At the authored scale (tens of cells, occasionally hundreds) a full
 * pass costs well under a millisecond, and it buys the property that matters
 * most for a teaching tool: the displayed state is always the state a from-
 * scratch evaluation produces. There is no stale-propagation bug class because
 * there is no propagation.
 *
 * CYCLES ARE DETECTED ON THE STATIC GRAPH — every reference the formula text
 * contains, both branches of a SI included — not on the references evaluation
 * happens to read. `=SI(VRAI;1;A1)` in A1 is flagged, exactly as Excel flags
 * it, and the learner is told which cells form the loop rather than being
 * handed a silent 0.
 */

export type WorkbookCellInput = number | string | boolean;

export interface WorkbookInput {
  /**
   * Keyed by A1 reference. A string starting with `=` is a formula; anything
   * else is a literal value, exactly as typing into Excel.
   */
  readonly cells: Readonly<Record<string, WorkbookCellInput>>;
}

export interface EvaluatedCell {
  /** What was typed: the formula source or the literal. */
  readonly input: WorkbookCellInput;
  readonly value: Scalar;
  /** Present when the input was a formula, parsed successfully or not. */
  readonly formula?: {
    readonly source: string;
    readonly ast: FormulaNode | null;
    readonly profile: FormulaProfile | null;
    /** French parse diagnostic, when the source could not be parsed. */
    readonly parseError: string | null;
  };
}

export interface EvaluatedWorkbook {
  /** Every populated cell, evaluated. */
  readonly cells: ReadonlyMap<string, EvaluatedCell>;
  /** Cell keys in the deterministic evaluation order (row-major). */
  readonly order: readonly string[];
  /**
   * Each detected dependency cycle, as the sorted list of the formula cells
   * that form it. Every member holds `#CYCLE!`.
   */
  readonly cycles: readonly string[][];
  /** Steps actually spent, out of `MAX_EVAL_STEPS`. */
  readonly stepsUsed: number;
}

interface ParsedCell {
  input: WorkbookCellInput;
  literal: Scalar;
  formulaSource: string | null;
  ast: FormulaNode | null;
  profile: FormulaProfile | null;
  parseError: string | null;
  /** Direct precedents that are populated cells, deduplicated, sorted. */
  precedents: string[];
}

function isFormulaInput(input: WorkbookCellInput): input is string {
  return typeof input === "string" && input.trim().startsWith("=");
}

/**
 * Populated-cell precedents of a formula. Range members are intersected with
 * the populated set: an empty cell is a constant (it reads as empty forever),
 * so it can neither require evaluation first nor take part in a cycle.
 */
function computePrecedents(profile: FormulaProfile, populated: ReadonlySet<string>): string[] {
  const precedents = new Set<string>();

  for (const ref of profile.cellRefs) {
    if (populated.has(ref)) {
      precedents.add(ref);
    }
  }

  if (profile.rangeRefs.length > 0) {
    for (const key of populated) {
      if (precedents.has(key)) {
        continue;
      }

      const address = parseCellKey(key);

      if (!address) {
        continue;
      }

      for (const rangeRef of profile.rangeRefs) {
        const [startKey, endKey] = rangeRef.split(":");
        const start = parseCellKey(startKey);
        const end = parseCellKey(endKey);

        if (
          start &&
          end &&
          address.column >= start.column &&
          address.column <= end.column &&
          address.row >= start.row &&
          address.row <= end.row
        ) {
          precedents.add(key);
          break;
        }
      }
    }
  }

  return [...precedents].sort(compareCellKeys);
}

/**
 * Strongly connected components with more than one member — or a self-loop —
 * are cycles. Iterative Tarjan, so a 2000-cell chain cannot overflow the call
 * stack.
 */
function findCycles(
  keys: readonly string[],
  precedentsByKey: ReadonlyMap<string, readonly string[]>
): string[][] {
  const indexByKey = new Map<string, number>();
  const lowByKey = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;

  for (const rootKey of keys) {
    if (indexByKey.has(rootKey)) {
      continue;
    }

    // Explicit work stack: [key, next precedent index to visit].
    const work: Array<[string, number]> = [[rootKey, 0]];

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [key, childIndex] = frame;

      if (childIndex === 0) {
        indexByKey.set(key, counter);
        lowByKey.set(key, counter);
        counter += 1;
        stack.push(key);
        onStack.add(key);
      }

      const precedents = precedentsByKey.get(key) ?? [];

      if (childIndex < precedents.length) {
        frame[1] += 1;
        const child = precedents[childIndex];

        if (!indexByKey.has(child)) {
          work.push([child, 0]);
        } else if (onStack.has(child)) {
          lowByKey.set(key, Math.min(lowByKey.get(key) as number, indexByKey.get(child) as number));
        }

        continue;
      }

      work.pop();

      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        lowByKey.set(
          parent,
          Math.min(lowByKey.get(parent) as number, lowByKey.get(key) as number)
        );
      }

      if (lowByKey.get(key) === indexByKey.get(key)) {
        const component: string[] = [];

        for (;;) {
          const member = stack.pop() as string;
          onStack.delete(member);
          component.push(member);

          if (member === key) {
            break;
          }
        }

        const selfLoop =
          component.length === 1 && (precedentsByKey.get(key) ?? []).includes(key);

        if (component.length > 1 || selfLoop) {
          cycles.push(component.sort(compareCellKeys));
        }
      }
    }
  }

  // Deterministic report order whatever the traversal order was.
  return cycles.sort((a, b) => compareCellKeys(a[0], b[0]));
}

/**
 * Parses and evaluates a whole workbook. Deterministic: same input, same
 * output, same step count — the only state is the input.
 *
 * Throws `WorkbookLimitError` when the workbook itself is out of bounds (too
 * many cells, or a key that is not a cell reference). Everything else — parse
 * errors, evaluation errors, cycles, an exhausted budget — is reported *per
 * cell*, because those belong to the learner's formulas, not to the caller.
 */
export function evaluateWorkbook(input: WorkbookInput): EvaluatedWorkbook {
  const entries = Object.entries(input.cells);

  if (entries.length > MAX_WORKBOOK_CELLS) {
    throw new WorkbookLimitError(
      `Classeur trop grand (${entries.length} cellules, maximum ${MAX_WORKBOOK_CELLS}).`
    );
  }

  const parsed = new Map<string, ParsedCell>();

  for (const [rawKey, cellInput] of entries) {
    const address = parseCellKey(rawKey);

    if (!address) {
      throw new WorkbookLimitError(`« ${rawKey} » n'est pas une référence de cellule valide.`);
    }

    const key = `${rawKey.trim().toUpperCase().replace(/\$/g, "")}`;

    if (parsed.has(key)) {
      throw new WorkbookLimitError(`Cellule « ${key} » définie deux fois.`);
    }

    if (isFormulaInput(cellInput)) {
      let ast: FormulaNode | null = null;
      let parseError: string | null = null;

      try {
        ast = parseFormula(cellInput);
      } catch (error) {
        if (error instanceof FormulaParseError) {
          parseError = error.message;
        } else {
          throw error;
        }
      }

      parsed.set(key, {
        input: cellInput,
        literal: null,
        formulaSource: cellInput.trim(),
        ast,
        profile: ast ? profileFormula(ast) : null,
        parseError,
        precedents: []
      });
    } else {
      parsed.set(key, {
        input: cellInput,
        literal: cellInput,
        formulaSource: null,
        ast: null,
        profile: null,
        parseError: null,
        precedents: []
      });
    }
  }

  const populated = new Set(parsed.keys());

  for (const cell of parsed.values()) {
    if (cell.profile) {
      cell.precedents = computePrecedents(cell.profile, populated);
    }
  }

  const order = [...parsed.keys()].sort(compareCellKeys);
  const precedentsByKey = new Map<string, readonly string[]>(
    order.map((key) => [key, (parsed.get(key) as ParsedCell).precedents])
  );

  const cycles = findCycles(order, precedentsByKey);
  const inCycle = new Set<string>(cycles.flat());

  // --- Evaluation ------------------------------------------------------------

  let steps = 0;
  const values = new Map<string, Scalar>();
  const evaluating = new Set<string>();

  const context = {
    charge(cost: number): void {
      // Checked before adding, so `stepsUsed` can never report more than the
      // budget: an aborted recalculation says exactly where it stopped.
      if (steps + cost > MAX_EVAL_STEPS) {
        steps = MAX_EVAL_STEPS;
        throw new BudgetExhausted();
      }

      steps += cost;
    },
    readCell(key: string): Scalar {
      const cell = parsed.get(key);

      if (!cell) {
        return null; // An empty cell reads as empty; that is not an error.
      }

      return evaluateCell(key, cell);
    }
  };

  function evaluateCell(key: string, cell: ParsedCell): Scalar {
    const memoized = values.get(key);

    if (memoized !== undefined) {
      return memoized;
    }

    let value: Scalar;

    if (inCycle.has(key)) {
      const cycle = cycles.find((component) => component.includes(key)) ?? [key];
      value = spreadsheetError(
        "#CYCLE!",
        `Référence circulaire entre ${cycle.join(", ")}.`
      );
    } else if (cell.formulaSource !== null) {
      if (!cell.ast) {
        value = spreadsheetError("#VALUE!", cell.parseError ?? "Formule illisible.");
      } else if (evaluating.has(key)) {
        // Unreachable when the static cycle detection is correct; kept as a
        // hard stop so a graph bug degrades into an error value, not a hang.
        value = spreadsheetError("#CYCLE!", `Référence circulaire via ${key}.`);
      } else {
        evaluating.add(key);

        try {
          value = evaluateNode(cell.ast, context);
        } catch (error) {
          if (error instanceof BudgetExhausted) {
            value = spreadsheetError(
              "#LIMIT!",
              "Calcul interrompu : budget d'évaluation dépassé."
            );
          } else {
            throw error;
          }
        } finally {
          evaluating.delete(key);
        }
      }
    } else {
      value = cell.literal;
    }

    values.set(key, value);
    return value;
  }

  for (const key of order) {
    evaluateCell(key, parsed.get(key) as ParsedCell);
  }

  const cells = new Map<string, EvaluatedCell>();

  for (const key of order) {
    const cell = parsed.get(key) as ParsedCell;
    const evaluated: EvaluatedCell = {
      input: cell.input,
      value: values.get(key) as Scalar,
      ...(cell.formulaSource !== null
        ? {
            formula: {
              source: cell.formulaSource,
              ast: cell.ast,
              profile: cell.profile,
              parseError: cell.parseError
            }
          }
        : {})
    };

    cells.set(key, evaluated);
  }

  return { cells, order, cycles, stepsUsed: steps };
}

/** Direct precedents of a cell (the cells its formula reads), for highlighting. */
export function getPrecedents(workbook: EvaluatedWorkbook, key: string): string[] {
  const cell = workbook.cells.get(key.toUpperCase());

  if (!cell?.formula?.profile) {
    return [];
  }

  const refs = new Set<string>(cell.formula.profile.cellRefs);

  for (const rangeRef of cell.formula.profile.rangeRefs) {
    const [startKey, endKey] = rangeRef.split(":");
    const start = parseCellKey(startKey);
    const end = parseCellKey(endKey);

    if (!start || !end) {
      continue;
    }

    for (let row = start.row; row <= end.row; row += 1) {
      for (let column = start.column; column <= end.column; column += 1) {
        refs.add(addressKey({ column, row }));
      }
    }
  }

  return [...refs].sort(compareCellKeys);
}

/** Direct dependents of a cell (the formulas that read it). */
export function getDependents(workbook: EvaluatedWorkbook, key: string): string[] {
  const target = key.toUpperCase();
  const dependents: string[] = [];

  for (const [candidate] of workbook.cells) {
    if (candidate !== target && getPrecedents(workbook, candidate).includes(target)) {
      dependents.push(candidate);
    }
  }

  return dependents.sort(compareCellKeys);
}

/** Renders a scalar for display: French decimal comma, error codes verbatim. */
export function formatScalar(value: Scalar): string {
  if (value === null) {
    return "";
  }

  if (isSpreadsheetError(value)) {
    return value.code;
  }

  if (typeof value === "boolean") {
    return value ? "VRAI" : "FAUX";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  }

  return value;
}
