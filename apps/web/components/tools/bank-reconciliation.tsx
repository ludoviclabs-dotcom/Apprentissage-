"use client";

import { useState } from "react";

export interface ReconciliationItem {
  id: string;
  label: string;
  /** Signé : négatif quand l'élément diminue le solde qu'il corrige. */
  amount: number;
  /** Quel solde l'élément corrige — le relevé de la banque ou le compte 512. */
  side: "releve" | "compte";
}

function formatAmount(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Rapprochement bancaire interactif.
 *
 * Le learner pointe chaque élément en rapprochement ; les deux colonnes se
 * recalculent et convergent vers le solde rapproché quand tout est pointé.
 * L'état est annoncé (aria-live) et rien n'est noté ici : la note vient de
 * l'exercice d'écritures qui suit.
 */
export function BankReconciliation({
  statementBalance,
  bookBalance,
  items
}: {
  /** Solde du relevé bancaire avant rapprochement. */
  statementBalance: number;
  /** Solde du compte 512 avant régularisations. */
  bookBalance: number;
  items: ReconciliationItem[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  const adjustedStatement = items
    .filter((item) => item.side === "releve" && ticked.has(item.id))
    .reduce((sum, item) => sum + item.amount, statementBalance);
  const adjustedBook = items
    .filter((item) => item.side === "compte" && ticked.has(item.id))
    .reduce((sum, item) => sum + item.amount, bookBalance);
  const allTicked = ticked.size === items.length;
  const converged = allTicked && adjustedStatement === adjustedBook;

  return (
    <section className="panel" aria-label="Rapprochement bancaire interactif">
      <div className="panel-heading">
        <div>
          <span className="section-label">Rapprochement bancaire</span>
          <h2>Pointer les écarts jusqu'à la convergence</h2>
        </div>
      </div>

      <fieldset className="reconciliation-items">
        <legend className="sr-only">Éléments en rapprochement à pointer</legend>
        {items.map((item) => (
          <label key={item.id} className="reconciliation-item">
            <input type="checkbox" checked={ticked.has(item.id)} onChange={() => toggle(item.id)} />
            <span>
              {item.label}
              <small className="muted">
                {item.side === "releve" ? "corrige le relevé" : "corrige le compte 512"} ·{" "}
                {item.amount >= 0 ? "+" : "−"}
                {formatAmount(Math.abs(item.amount))} €
              </small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="stat-strip reconciliation-totals">
        <article className="stat-card">
          <span className="stat-card-label">Relevé ajusté</span>
          <strong className="stat-card-value" data-testid="reconciliation-statement">
            {formatAmount(adjustedStatement)} €
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-card-label">Compte 512 ajusté</span>
          <strong className="stat-card-value" data-testid="reconciliation-book">
            {formatAmount(adjustedBook)} €
          </strong>
        </article>
      </div>

      <p role="status" aria-atomic="true" className={converged ? "result-inline" : "muted"}>
        {converged
          ? `Rapprochement établi : les deux soldes convergent à ${formatAmount(adjustedStatement)} €.`
          : allTicked
            ? "Tout est pointé mais les soldes divergent : un élément est mal classé."
            : `${ticked.size}/${items.length} élément(s) pointé(s). Les deux soldes doivent converger.`}
      </p>
    </section>
  );
}
