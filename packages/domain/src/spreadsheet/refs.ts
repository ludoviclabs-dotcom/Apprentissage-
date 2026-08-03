import { MAX_COLUMNS, MAX_ROWS } from "./limits";

/**
 * A1-style cell addresses.
 *
 * Internally a cell is `{ column, row }`, both one-based, because that is how a
 * learner reads the sheet ("colonne B, ligne 12"). The absolute markers (`$`)
 * live on the *reference*, not the address: `$B$12` and `B12` name the same
 * cell and must compare equal in the dependency graph, while the canonical
 * rendering of the formula keeps the `$` the learner wrote.
 */

export interface CellAddress {
  /** One-based: column A is 1. */
  readonly column: number;
  /** One-based: the row printed in the sheet margin. */
  readonly row: number;
}

export function columnLabel(column: number): string {
  let remaining = column;
  let label = "";

  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    label = String.fromCharCode(65 + digit) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

export function columnIndex(label: string): number {
  let index = 0;

  for (const letter of label.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index;
}

/** Canonical key of an address, e.g. "B12". Absolute markers never appear. */
export function addressKey(address: CellAddress): string {
  return `${columnLabel(address.column)}${address.row}`;
}

export function isWithinSheet(address: CellAddress): boolean {
  return (
    address.column >= 1 &&
    address.column <= MAX_COLUMNS &&
    address.row >= 1 &&
    address.row <= MAX_ROWS
  );
}

const CELL_KEY_PATTERN = /^([A-Z]+)([0-9]+)$/;

/**
 * Reads a bare cell key ("B12", "b12", "$B$12"), or null when the text is not
 * one. Used for workbook input keys and spec fields, not for formula parsing —
 * the tokenizer has its own reference scanning with positions.
 */
export function parseCellKey(text: string): CellAddress | null {
  const cleaned = text.trim().toUpperCase().replace(/\$/g, "");
  const match = CELL_KEY_PATTERN.exec(cleaned);

  if (!match) {
    return null;
  }

  const address = { column: columnIndex(match[1]), row: Number(match[2]) };

  return isWithinSheet(address) ? address : null;
}

/**
 * Deterministic ordering: row-major, the order a reader scans the sheet.
 * Every iteration the engine does over cells sorts with this first, which is
 * what makes recalculation order — and therefore error reporting order —
 * reproducible run after run.
 */
export function compareAddresses(a: CellAddress, b: CellAddress): number {
  return a.row - b.row || a.column - b.column;
}

export function compareCellKeys(a: string, b: string): number {
  const left = parseCellKey(a);
  const right = parseCellKey(b);

  if (!left || !right) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  return compareAddresses(left, right);
}
