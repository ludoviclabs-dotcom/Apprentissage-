"use client";

import { useDeferredValue, useMemo, useRef } from "react";
import {
  columnLetter,
  evaluateWorkbook,
  formatScalar,
  getPrecedents,
  isSpreadsheetError,
  type EvaluatedWorkbook,
  type LabGrid,
  type WorkbookCellInput
} from "@finance/domain";
import { parseCellNumber } from "@/components/forms/lab-grid";

/**
 * La grille du moteur (PR-12b) : elle recalcule vraiment.
 *
 * Chaque frappe reconstruit le classeur — données de l'énoncé plus saisies —
 * et le passe à `evaluateWorkbook`, le même moteur pur qui note la soumission
 * côté serveur. Ce que la grille affiche est donc exactement ce que
 * l'évaluateur verra : il n'existe pas de deuxième implémentation qui pourrait
 * en diverger.
 *
 * Le recalcul est total et synchrone (quelques dizaines de cellules) ; il passe
 * par `useDeferredValue` pour que la saisie ne bloque jamais, et l'intervalle
 * où l'affichage retarde sur la frappe est annoncé comme « recalcul en cours »
 * — un état honnête, pas un ornement.
 *
 * CLAVIER. Les cellules éditables sont de vrais champs : Tab circule
 * nativement. Flèches haut/bas passent d'une cellule éditable à l'autre ;
 * Entrée valide et descend ; Échap vide la cellule. La barre de formule édite
 * la cellule sélectionnée. Les cellules données sont focusables en lecture
 * seule : les sélectionner montre leurs valeurs dans la barre et surligne, pour
 * une cellule calculée, les cellules dont elle dépend.
 */

export type FormulaGridValues = Record<string, string>;

/** Raw inputs → the engine's workbook shape, layered over the grid's givens. */
export function buildWorkbookCells(
  grid: LabGrid,
  values: FormulaGridValues
): Record<string, WorkbookCellInput> {
  const cells: Record<string, WorkbookCellInput> = {};

  grid.columns.forEach((label, columnIndex) => {
    if (label !== "") {
      cells[`${columnLetter(columnIndex)}1`] = label;
    }
  });

  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const ref = `${columnLetter(columnIndex)}${rowIndex + 2}`;

      if (cell.kind === "label") {
        cells[ref] = cell.text;
      } else if (cell.kind === "given") {
        cells[ref] = cell.value;
      }
    });
  });

  for (const [ref, raw] of Object.entries(values)) {
    const text = raw.trim();

    if (text === "") {
      continue;
    }

    if (text.startsWith("=")) {
      cells[ref] = text;
      continue;
    }

    const numeric = parseCellNumber(text);
    // Un texte qui n'est ni une formule ni un nombre est gardé tel quel :
    // le moteur le traite comme un littéral texte, comme Excel.
    cells[ref] = numeric ?? text;
  }

  return cells;
}

/** La soumission : chaque cellule saisie part comme formule ou comme valeur. */
export function toEngineCells(
  values: FormulaGridValues
): Record<string, { value?: number; formula?: string }> {
  const cells: Record<string, { value?: number; formula?: string }> = {};

  for (const [ref, raw] of Object.entries(values)) {
    const text = raw.trim();

    if (text === "") {
      continue;
    }

    if (text.startsWith("=")) {
      cells[ref] = { formula: text };
      continue;
    }

    const numeric = parseCellNumber(text);
    cells[ref] = numeric === null ? { formula: text } : { value: numeric };
  }

  return cells;
}

export function hasAnyEngineEntry(values: FormulaGridValues): boolean {
  return Object.keys(toEngineCells(values)).length > 0;
}

function inputRefs(grid: LabGrid): string[] {
  const refs: string[] = [];

  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell.kind === "input") {
        refs.push(`${columnLetter(columnIndex)}${rowIndex + 2}`);
      }
    });
  });

  return refs;
}

function describeCell(ref: string, workbook: EvaluatedWorkbook): string {
  const cell = workbook.cells.get(ref);

  if (!cell) {
    return `${ref} : cellule vide.`;
  }

  if (cell.formula?.parseError) {
    return `${ref} : formule illisible — ${cell.formula.parseError}`;
  }

  if (isSpreadsheetError(cell.value)) {
    return `${ref} : ${cell.value.code} — ${cell.value.message}`;
  }

  return `${ref} = ${formatScalar(cell.value)}`;
}

export function FormulaGridView({
  grid,
  values,
  onChange,
  selected,
  onSelect,
  disabled = false
}: {
  grid: LabGrid;
  values: FormulaGridValues;
  onChange: (values: FormulaGridValues) => void;
  selected: string | null;
  onSelect: (ref: string) => void;
  disabled?: boolean;
}) {
  const editableRefs = useMemo(() => inputRefs(grid), [grid]);
  const inputsByRef = useRef(new Map<string, HTMLInputElement>());

  // Le recalcul suit la frappe avec une valeur différée : la saisie reste
  // fluide, et l'écart entre les deux est l'état « recalcul en cours ».
  const deferredValues = useDeferredValue(values);
  const recalculating = deferredValues !== values;
  const workbook = useMemo(
    () => evaluateWorkbook({ cells: buildWorkbookCells(grid, deferredValues) }),
    [grid, deferredValues]
  );

  const precedents = useMemo(
    () => new Set(selected ? getPrecedents(workbook, selected) : []),
    [workbook, selected]
  );

  function update(ref: string, raw: string) {
    onChange({ ...values, [ref]: raw });
  }

  function moveFocus(ref: string, delta: number) {
    const index = editableRefs.indexOf(ref);
    const target = editableRefs[index + delta];

    if (target) {
      inputsByRef.current.get(target)?.focus();
      onSelect(target);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, ref: string) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(ref, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(ref, -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      moveFocus(ref, 1);
    } else if (event.key === "Escape") {
      update(ref, "");
    }
  }

  const selectedCell = selected ? workbook.cells.get(selected) : undefined;
  const cycleRefs = new Set(workbook.cycles.flat());

  return (
    <div className="formula-grid" data-recalc-state={recalculating ? "pending" : "idle"}>
      {/* Barre de formule : édite la cellule sélectionnée quand elle est
          éditable, montre son contenu sinon. */}
      <div className="formula-bar">
        <span className="formula-bar-ref" aria-hidden="true">
          {selected ?? "—"}
        </span>
        <input
          aria-label={
            selected ? `Barre de formule, cellule ${selected}` : "Barre de formule, aucune cellule sélectionnée"
          }
          value={
            selected
              ? selected in values
                ? values[selected]
                : selectedCell
                  ? String(selectedCell.input)
                  : ""
              : ""
          }
          placeholder={selected ? "=…" : "Sélectionnez une cellule"}
          spellCheck={false}
          readOnly={disabled || !selected || !editableRefs.includes(selected)}
          onChange={(event) => {
            if (selected && editableRefs.includes(selected)) {
              update(selected, event.target.value);
            }
          }}
        />
      </div>

      <div
        className="lab-grid-wrapper table-scroll"
        role="region"
        aria-label="Grille de calcul recalculée, défilement horizontal possible"
        tabIndex={0}
      >
        <table className="lab-grid">
          <caption className="sr-only">
            Grille recalcul&eacute;e par le moteur : les donn&eacute;es sont prot&eacute;g&eacute;es, les cellules de
            r&eacute;ponse acceptent une formule commen&ccedil;ant par =.
          </caption>
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
              const rowNumber = rowIndex + 2;

              return (
                <tr key={rowNumber}>
                  <th scope="row" className="lab-gutter">
                    {rowNumber}
                  </th>
                  {row.map((cell, columnIndex) => {
                    const ref = `${columnLetter(columnIndex)}${rowNumber}`;
                    const isSelected = selected === ref;
                    const isPrecedent = precedents.has(ref);
                    const classNames = [
                      isSelected ? "lab-selected" : "",
                      isPrecedent ? "lab-dep" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");

                    if (cell.kind === "label") {
                      return (
                        <td key={ref} className={classNames || undefined} onClick={() => onSelect(ref)}>
                          {cell.text}
                        </td>
                      );
                    }

                    if (cell.kind === "given") {
                      // Cellule protégée : focusable pour être inspectée dans la
                      // barre de formule, jamais éditable.
                      return (
                        <td
                          key={ref}
                          className={`lab-given ${classNames}`.trim()}
                          data-cell={ref}
                          tabIndex={0}
                          role="button"
                          aria-label={`Cellule protégée ${ref} : ${formatScalar(cell.value)}`}
                          onClick={() => onSelect(ref)}
                          onFocus={() => onSelect(ref)}
                        >
                          {formatScalar(cell.value)}
                        </td>
                      );
                    }

                    if (cell.kind === "blank") {
                      return <td key={ref} className={`lab-blank ${classNames}`.trim()} />;
                    }

                    const raw = values[ref] ?? "";
                    const evaluated = workbook.cells.get(ref);
                    const isError =
                      evaluated !== undefined &&
                      (isSpreadsheetError(evaluated.value) || Boolean(evaluated.formula?.parseError));
                    const display =
                      raw.trim() === ""
                        ? ""
                        : evaluated
                          ? formatScalar(evaluated.value)
                          : "";

                    return (
                      <td
                        key={ref}
                        className={`lab-input ${isError ? "lab-error" : ""} ${
                          cycleRefs.has(ref) ? "lab-cycle" : ""
                        } ${classNames}`.trim()}
                        data-cell={ref}
                      >
                        <span id={`${ref}-help`} className="sr-only">
                          Cellule {ref} : saisissez une formule commen&ccedil;ant par = ou une valeur.
                        </span>
                        <input
                          ref={(element) => {
                            if (element) {
                              inputsByRef.current.set(ref, element);
                            } else {
                              inputsByRef.current.delete(ref);
                            }
                          }}
                          aria-label={`Cellule ${ref}`}
                          aria-describedby={`${ref}-help`}
                          aria-invalid={isError || undefined}
                          value={raw}
                          placeholder="=…"
                          spellCheck={false}
                          disabled={disabled}
                          onFocus={() => onSelect(ref)}
                          onClick={() => onSelect(ref)}
                          onKeyDown={(event) => onKeyDown(event, ref)}
                          onChange={(event) => update(ref, event.target.value)}
                        />
                        {/* Le résultat calculé, sous la saisie : la formule reste
                            visible pendant que sa valeur est affichée. */}
                        <output
                          className="lab-computed"
                          aria-label={`Valeur calculée de ${ref}`}
                          data-cell-value={ref}
                        >
                          {display}
                        </output>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* État du recalcul et diagnostic de la cellule sélectionnée. Un seul
          role=status, mis à jour en bloc, pour un lecteur d'écran. */}
      <p className="formula-status" role="status" aria-atomic="true" data-testid="formula-status">
        {recalculating
          ? "Recalcul en cours…"
          : selected
            ? describeCell(selected, workbook)
            : "Feuille à jour."}
      </p>

      {workbook.cycles.length > 0 ? (
        <p className="formula-cycles" role="alert">
          Référence circulaire : {workbook.cycles.map((cycle) => cycle.join(" → ")).join(" ; ")}. Les
          cellules concernées affichent #CYCLE!.
        </p>
      ) : null}
    </div>
  );
}
