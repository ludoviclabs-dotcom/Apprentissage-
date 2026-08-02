"use client";

import { useMemo } from "react";

/**
 * The interactive journal.
 *
 * A controlled table of `{ compte, libellé, débit, crédit }` rows and nothing
 * more. It is deliberately not an accounting editor: no account lookup, no
 * auto-balancing, no VAT computed for the learner. Every one of those would do
 * the part of the work the exercise is asking about, and a grid that balances
 * itself cannot tell anybody they made an unbalanced entry.
 *
 * What it does provide is the feedback a paper journal gives for free: running
 * totals and whether débit equals crédit, updated as you type. That is a
 * property of the entry the learner can already see on their own page, so
 * showing it withholds nothing — and an entry that visibly does not balance is a
 * mistake caught before submitting rather than a mark lost after.
 */

export interface JournalLineInput {
  /** Stable UI identity: a row keeps its DOM node when a neighbour is removed. */
  id: string;
  account: string;
  label: string;
  debit: string;
  credit: string;
}

export interface JournalSubmissionLine {
  account: string;
  debit?: number;
  credit?: number;
}

function emptyLine(): JournalLineInput {
  return { id: crypto.randomUUID(), account: "", label: "", debit: "", credit: "" };
}

/**
 * Reads a French-formatted amount.
 *
 * A comma decimal separator and spaces between thousands are how the amounts are
 * written in every statement in this module, so refusing them would fail
 * learners for transcribing the figure exactly as they were given it.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\u00A0/g, " ").replace(/\s/g, "").replace(",", ".");

  // Do not let Number coerce hexadecimal or exponent notation: accounting cells
  // accept amounts as written in the statement, not every JavaScript literal.
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const value = Number(cleaned);

  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function toSubmissionLines(lines: JournalLineInput[]): JournalSubmissionLine[] {
  return lines
    .map((line) => {
      const debit = parseAmount(line.debit);
      const credit = parseAmount(line.credit);

      return {
        account: line.account.trim(),
        ...(debit !== null && debit > 0 ? { debit } : {}),
        ...(credit !== null && credit > 0 ? { credit } : {})
      };
    })
    .filter((line) => line.account !== "");
}

export function totalsOf(lines: JournalLineInput[]): { debit: number; credit: number } {
  return lines.reduce(
    (totals, line) => ({
      debit: Math.round((totals.debit + (parseAmount(line.debit) ?? 0)) * 100) / 100,
      credit: Math.round((totals.credit + (parseAmount(line.credit) ?? 0)) * 100) / 100
    }),
    { debit: 0, credit: 0 }
  );
}

function formatAmount(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function JournalEntryForm({
  lines,
  onChange,
  disabled = false
}: {
  lines: JournalLineInput[];
  onChange: (lines: JournalLineInput[]) => void;
  disabled?: boolean;
}) {
  const totals = useMemo(() => totalsOf(lines), [lines]);
  const difference = Math.round((totals.debit - totals.credit) * 100) / 100;
  const hasAmounts = totals.debit > 0 || totals.credit > 0;
  const balanced = hasAmounts && difference === 0;

  function update(index: number, patch: Partial<JournalLineInput>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  return (
    <div className="journal-entry">
      <table className="journal-table">
        <caption className="sr-only">
          Saisir une écriture comptable : compte, libellé, débit et crédit par ligne.
        </caption>
        <thead>
          <tr>
            <th scope="col">Compte</th>
            <th scope="col">Libellé</th>
            <th scope="col">Débit</th>
            <th scope="col">Crédit</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id}>
              <td>
                <input
                  aria-label={`Compte ligne ${index + 1}`}
                  value={line.account}
                  disabled={disabled}
                  inputMode="numeric"
                  placeholder="607"
                  onChange={(event) => update(index, { account: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Libellé ligne ${index + 1}`}
                  value={line.label}
                  disabled={disabled}
                  placeholder="Achats de marchandises"
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Débit ligne ${index + 1}`}
                  value={line.debit}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(event) => update(index, { debit: event.target.value })}
                />
              </td>
              <td>
                <input
                  aria-label={`Crédit ligne ${index + 1}`}
                  value={line.credit}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(event) => update(index, { credit: event.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="secondary-action"
                  // One line must always remain, or the table disappears and
                  // there is nothing left to type into.
                  disabled={disabled || lines.length <= 1}
                  aria-label={`Supprimer la ligne ${index + 1}`}
                  onClick={() => onChange(lines.filter((_, position) => position !== index))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Totaux</td>
            <td data-testid="journal-total-debit">{formatAmount(totals.debit)}</td>
            <td data-testid="journal-total-credit">{formatAmount(totals.credit)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="journal-actions">
        <button
          type="button"
          className="secondary-action"
          disabled={disabled}
          onClick={() => onChange([...lines, emptyLine()])}
        >
          Ajouter une ligne
        </button>
        <span
          className={`state-token ${balanced ? "ready" : "needs-review"}`}
          data-testid="journal-balance"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {balanced
            ? "Équilibrée"
            : hasAmounts
              ? `Déséquilibre : ${formatAmount(Math.abs(difference))}`
              : "Aucun montant saisi"}
        </span>
      </div>
    </div>
  );
}

export function emptyJournal(lineCount = 3): JournalLineInput[] {
  return Array.from({ length: lineCount }, emptyLine);
}
