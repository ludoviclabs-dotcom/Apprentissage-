"use client";

import { useMemo, useState } from "react";
import type { BalanceLine } from "@finance/domain";

const CLASS_LABELS: Record<string, string> = {
  all: "Toutes les classes",
  "1": "Classe 1 — capitaux",
  "2": "Classe 2 — immobilisations",
  "3": "Classe 3 — stocks",
  "4": "Classe 4 — tiers",
  "5": "Classe 5 — financiers",
  "6": "Classe 6 — charges",
  "7": "Classe 7 — produits"
};

function formatAmount(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Balance interactive : filtrable par classe, totaux recalculés, équilibre
 * annoncé. Les montants viennent du jeu de données du dossier ; le composant
 * n'additionne que ce qu'il affiche.
 */
export function TrialBalanceView({ balance }: { balance: BalanceLine[] }) {
  const [klass, setKlass] = useState("all");
  const filtered = useMemo(
    () => (klass === "all" ? balance : balance.filter((line) => line.account.startsWith(klass))),
    [balance, klass]
  );
  const totalDebit = filtered.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const totalCredit = filtered.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  const showingAll = klass === "all";
  const balanced = totalDebit === totalCredit;

  return (
    <section className="panel" aria-label="Balance interactive">
      <div className="panel-heading">
        <div>
          <span className="section-label">Balance après inventaire</span>
          <h2>Lire la balance, classe par classe</h2>
        </div>
        {showingAll ? (
          <span className={`state-token ${balanced ? "ready" : "needs-review"}`} role="status">
            {balanced ? "Équilibrée" : "Déséquilibrée"}
          </span>
        ) : null}
      </div>

      <label className="ledger-picker">
        Filtrer
        <select value={klass} onChange={(event) => setKlass(event.target.value)}>
          {Object.entries(CLASS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="table-scroll" role="region" aria-label="Lignes de la balance" tabIndex={0}>
        <table className="journal-table">
          <caption className="sr-only">
            Balance après inventaire au 31/12/N : compte, libellé, solde débiteur, solde créditeur.
          </caption>
          <thead>
            <tr>
              <th scope="col">Compte</th>
              <th scope="col">Libellé</th>
              <th scope="col">Solde débiteur</th>
              <th scope="col">Solde créditeur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((line) => (
              <tr key={line.account}>
                <td>{line.account}</td>
                <td>{line.label}</td>
                <td>{line.debit ? formatAmount(line.debit) : ""}</td>
                <td>{line.credit ? formatAmount(line.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{showingAll ? "Totaux" : `Totaux ${CLASS_LABELS[klass]}`}</td>
              <td data-testid="balance-total-debit">{formatAmount(totalDebit)}</td>
              <td data-testid="balance-total-credit">{formatAmount(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
