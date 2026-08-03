"use client";

import { useMemo, useState } from "react";
import type { LedgerAccountView } from "@finance/domain";

function formatAmount(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSigned(value: number): string {
  return value >= 0 ? `${formatAmount(value)} (débiteur)` : `${formatAmount(-value)} (créditeur)`;
}

/**
 * Grand livre interactif du dossier de clôture.
 *
 * Un compte à la fois : solde avant inventaire, chaque écriture d'inventaire
 * qui le mouvemente, solde après inventaire. Tout est dérivé du jeu de données
 * du dossier — l'outil montre la mécanique, il n'invente aucun chiffre.
 */
export function LedgerView({ accounts }: { accounts: LedgerAccountView[] }) {
  const withMovements = useMemo(
    () => accounts.filter((account) => account.movements.length > 0),
    [accounts]
  );
  const [selected, setSelected] = useState(withMovements[0]?.account ?? "");
  const current = withMovements.find((account) => account.account === selected) ?? null;

  return (
    <section className="panel" aria-label="Grand livre interactif">
      <div className="panel-heading">
        <div>
          <span className="section-label">Grand livre</span>
          <h2>Rejouer l'inventaire compte par compte</h2>
        </div>
      </div>

      <label className="ledger-picker">
        Compte
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {withMovements.map((account) => (
            <option key={account.account} value={account.account}>
              {account.account} — {account.label}
            </option>
          ))}
        </select>
      </label>

      {current ? (
        <div className="table-scroll" role="region" aria-label={`Mouvements du compte ${current.account}`} tabIndex={0}>
          <table className="journal-table ledger-table">
            <caption className="sr-only">
              Compte {current.account} : solde avant inventaire, mouvements d'inventaire, solde après
              inventaire.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Libellé</th>
                <th scope="col">Débit</th>
                <th scope="col">Crédit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>31/12/N</td>
                <td>Solde avant inventaire</td>
                <td>{current.openingBalance > 0 ? formatAmount(current.openingBalance) : ""}</td>
                <td>{current.openingBalance < 0 ? formatAmount(-current.openingBalance) : ""}</td>
              </tr>
              {current.movements.map((movement, index) => (
                <tr key={`${movement.entryId}-${index}`}>
                  <td>{movement.date}</td>
                  <td>{movement.entryLabel}</td>
                  <td>{movement.debit > 0 ? formatAmount(movement.debit) : ""}</td>
                  <td>{movement.credit > 0 ? formatAmount(movement.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Solde après inventaire</td>
                <td colSpan={2}>{formatSigned(current.closingBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="muted">Aucun compte mouvementé par l'inventaire.</p>
      )}
    </section>
  );
}
