import { addressKey, columnLabel, type CellAddress } from "./refs";

/**
 * The abstract syntax tree of the bounded grammar.
 *
 * The AST is the internal representation the whole feature normalises onto:
 * French and English spellings, `;` and `,` separators, redundant whitespace
 * and case all disappear at parse time, so everything downstream — evaluation,
 * dependency extraction, method analysis, canonical display — reasons about one
 * shape. `SOMME(B2;B3)` and `=sum(b2, b3)` are not "similar" formulas here;
 * they are the *same* AST.
 */

/** Canonical (English) names of the whole function library. */
export const CANONICAL_FUNCTIONS = [
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "IF",
  "SUMIF",
  "SUMIFS"
] as const;

export type CanonicalFunction = (typeof CANONICAL_FUNCTIONS)[number];

/**
 * Accepted spellings, all mapping onto the canonical name. The list is closed:
 * an identifier absent from it evaluates to `#NAME?`, it is never looked up
 * anywhere else — which is the property the security tests pin down.
 */
export const FUNCTION_ALIASES: Readonly<Record<string, CanonicalFunction>> = {
  SUM: "SUM",
  SOMME: "SUM",
  AVERAGE: "AVERAGE",
  MOYENNE: "AVERAGE",
  MIN: "MIN",
  MAX: "MAX",
  IF: "IF",
  SI: "IF",
  SUMIF: "SUMIF",
  "SOMME.SI": "SUMIF",
  SUMIFS: "SUMIFS",
  "SOMME.SI.ENS": "SUMIFS"
};

export type ComparisonOperator = "=" | "<>" | "<" | "<=" | ">" | ">=";
export type ArithmeticOperator = "+" | "-" | "*" | "/";
export type BinaryOperator = ArithmeticOperator | ComparisonOperator;

export interface RefNode {
  readonly kind: "ref";
  readonly address: CellAddress;
  /** `$B$12`: markers preserved for display, ignored by the graph. */
  readonly absoluteColumn: boolean;
  readonly absoluteRow: boolean;
}

export interface RangeNode {
  readonly kind: "range";
  /** Normalised: start is the top-left corner whatever order was typed. */
  readonly start: RefNode;
  readonly end: RefNode;
}

export type FormulaNode =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | RefNode
  | RangeNode
  | {
      readonly kind: "call";
      /** Canonical name, or the raw identifier when unknown (→ `#NAME?`). */
      readonly name: string;
      readonly known: CanonicalFunction | null;
      readonly args: readonly FormulaNode[];
    }
  | {
      readonly kind: "binary";
      readonly op: BinaryOperator;
      readonly left: FormulaNode;
      readonly right: FormulaNode;
    }
  | { readonly kind: "unary"; readonly op: "+" | "-"; readonly operand: FormulaNode };

/** Canonical key of a range, e.g. "B2:B13". */
export function rangeKey(range: RangeNode): string {
  return `${addressKey(range.start.address)}:${addressKey(range.end.address)}`;
}

function formatRef(ref: RefNode): string {
  return (
    (ref.absoluteColumn ? "$" : "") +
    columnLabel(ref.address.column) +
    (ref.absoluteRow ? "$" : "") +
    String(ref.address.row)
  );
}

function formatNumber(value: number): string {
  // toString keeps integers bare and floats exact enough to re-parse; the
  // canonical text is an interchange form, not a display format.
  return String(value);
}

/**
 * Canonical rendering: English names, uppercase references, `,` separators, no
 * whitespace, parentheses kept only where the tree requires them. Two formulas
 * with the same canonical text are the same formula.
 */
export function formatFormula(node: FormulaNode): string {
  return `=${formatNode(node, 0)}`;
}

const PRECEDENCE: Record<BinaryOperator, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  "<=": 1,
  ">": 1,
  ">=": 1,
  "+": 2,
  "-": 2,
  "*": 3,
  "/": 3
};

function formatNode(node: FormulaNode, parentPrecedence: number): string {
  switch (node.kind) {
    case "number":
      return formatNumber(node.value);
    case "string":
      return `"${node.value.replace(/"/g, '""')}"`;
    case "ref":
      return formatRef(node);
    case "range":
      return `${formatRef(node.start)}:${formatRef(node.end)}`;
    case "call":
      return `${node.known ?? node.name}(${node.args.map((arg) => formatNode(arg, 0)).join(",")})`;
    case "unary":
      return `${node.op}${formatNode(node.operand, 4)}`;
    case "binary": {
      const precedence = PRECEDENCE[node.op];
      // The right side re-parenthesises at equal precedence because `-` and `/`
      // are left-associative: a-(b-c) must not print as a-b-c.
      const text =
        formatNode(node.left, precedence) +
        node.op +
        formatNode(node.right, precedence + 1);

      return precedence < parentPrecedence ? `(${text})` : text;
    }
  }
}

/** What a formula touches, for the dependency graph and the method checks. */
export interface FormulaProfile {
  /** Direct single-cell references, canonical keys, deduplicated and sorted. */
  readonly cellRefs: string[];
  /** Ranges as canonical "A1:B3" keys, deduplicated and sorted. */
  readonly rangeRefs: string[];
  /** Canonical names of the known functions called. */
  readonly functions: CanonicalFunction[];
  /** Raw names of unknown functions (they will evaluate to `#NAME?`). */
  readonly unknownFunctions: string[];
  /** Numeric literals appearing anywhere in the formula. */
  readonly numberLiterals: number[];
  /** True when the formula reads at least one cell or range. */
  readonly referencesData: boolean;
}

export function profileFormula(root: FormulaNode): FormulaProfile {
  const cellRefs = new Set<string>();
  const rangeRefs = new Set<string>();
  const functions = new Set<CanonicalFunction>();
  const unknownFunctions = new Set<string>();
  const numberLiterals: number[] = [];

  const visit = (node: FormulaNode): void => {
    switch (node.kind) {
      case "number":
        numberLiterals.push(node.value);
        return;
      case "string":
        return;
      case "ref":
        cellRefs.add(addressKey(node.address));
        return;
      case "range":
        rangeRefs.add(rangeKey(node));
        return;
      case "call":
        if (node.known) {
          functions.add(node.known);
        } else {
          unknownFunctions.add(node.name);
        }

        node.args.forEach(visit);
        return;
      case "unary":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
    }
  };

  visit(root);

  return {
    cellRefs: [...cellRefs].sort(),
    rangeRefs: [...rangeRefs].sort(),
    functions: [...functions].sort(),
    unknownFunctions: [...unknownFunctions].sort(),
    numberLiterals,
    referencesData: cellRefs.size > 0 || rangeRefs.size > 0
  };
}
