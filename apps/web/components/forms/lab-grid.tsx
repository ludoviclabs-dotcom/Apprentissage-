"use client";

import { columnLetter, type LabGrid } from "@finance/domain";

/**
 * The lab's editable grid.
 *
 * A read-only dataset with a handful of typed-in cells, and nothing else. There
 * is no formula bar, no cell selection model, no recalculation — the whole point
 * of PR-06 is that a half-working spreadsheet is worse than none, because a
 * learner cannot tell whether an odd figure is their mistake or the engine's.
 *
 * WHAT IT DOES BORROW FROM A SPREADSHEET is the part that carries the teaching:
 * row numbers and column letters, so `=B2+B3` in the statement points at
 * something the learner can see. The references shown here are the references
 * the evaluator checks, and a test asserts the grid's editable cells are exactly
 * the cells the specification grades.
 */

export interface LabCellValue {
  value: string;
  formula: string;
}

export type LabCellValues = Record<string, LabCellValue>;

export const EMPTY_CELL: LabCellValue = { value: "", formula: "" };

/**
 * Reads a French-formatted figure: comma decimals and spaces between thousands,
 * which is how every amount in the datasets and statements is written.
 */
export function parseCellNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");

  if (cleaned === "") {
    return null;
  }

  const value = Number(cleaned);

  return Number.isFinite(value) ? value : null;
}

function formatGiven(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export function LabGridView({
  grid,
  values,
  onChange,
  disabled = false
}: {
  grid: LabGrid;
  values: LabCellValues;
  onChange: (values: LabCellValues) => void;
  disabled?: boolean;
}) {
  function update(ref: string, patch: Partial<LabCellValue>) {
    onChange({ ...values, [ref]: { ...EMPTY_CELL, ...values[ref], ...patch } });
  }

  return (
    <div className="lab-grid-wrapper">
      <table className="lab-grid">
        <thead>
          <tr>
            <th scope="col" className="lab-gutter">
              <span className="sr-only">Ligne</span>
            </th>
            {grid.columns.map((column, index) => (
              <th key={column} scope="col">
                <span className="lab-column-letter">{columnLetter(index)}</span>
                <span>{column}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, rowIndex) => {
            // Row 1 is the header, so the body starts at spreadsheet row 2.
            const rowNumber = rowIndex + 2;

            return (
              <tr key={rowNumber}>
                <th scope="row" className="lab-gutter">
                  {rowNumber}
                </th>
                {row.map((cell, columnIndex) => {
                  const ref = `${columnLetter(columnIndex)}${rowNumber}`;

                  if (cell.kind === "label") {
                    return <td key={ref}>{cell.text}</td>;
                  }

                  if (cell.kind === "given") {
                    return (
                      <td key={ref} className="lab-given" data-cell={ref}>
                        {formatGiven(cell.value)}
                      </td>
                    );
                  }

                  if (cell.kind === "blank") {
                    return <td key={ref} className="lab-blank" />;
                  }

                  const current = values[ref] ?? EMPTY_CELL;

                  return (
                    <td key={ref} className="lab-input" data-cell={ref}>
                      <input
                        aria-label={`Cellule ${ref}`}
                        value={current.value}
                        inputMode="decimal"
                        placeholder="0"
                        disabled={disabled}
                        onChange={(event) => update(ref, { value: event.target.value })}
                      />
                      {cell.wantsFormula ? (
                        <input
                          aria-label={`Formule ${ref}`}
                          value={current.formula}
                          className="lab-formula"
                          // Deliberately not a worked example: "=B2+B3" is the
                          // exact answer to the first exercise, so a helpful
                          // placeholder would have handed it over.
                          placeholder="=…"
                          spellCheck={false}
                          disabled={disabled}
                          onChange={(event) => update(ref, { formula: event.target.value })}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Turns the typed strings into the evaluator's submission shape.
 *
 * A cell the learner left completely empty is omitted rather than sent as an
 * explicit blank: the evaluator reports "cellule vide" for a missing cell, and
 * sending `{ value: undefined }` would say the same thing less clearly.
 */
export function toSpreadsheetCells(
  values: LabCellValues
): Record<string, { value?: number; formula?: string }> {
  const cells: Record<string, { value?: number; formula?: string }> = {};

  for (const [ref, entry] of Object.entries(values)) {
    const value = parseCellNumber(entry.value ?? "");
    const formula = (entry.formula ?? "").trim();

    if (value === null && formula === "") {
      continue;
    }

    cells[ref] = {
      ...(value === null ? {} : { value }),
      ...(formula === "" ? {} : { formula })
    };
  }

  return cells;
}

/** True once anything has been typed, so the submit button can stay honest. */
export function hasAnyEntry(values: LabCellValues): boolean {
  return Object.keys(toSpreadsheetCells(values)).length > 0;
}
