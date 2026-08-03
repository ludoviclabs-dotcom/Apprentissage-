"use client";

import { useState } from "react";

/**
 * Checklist de clôture.
 *
 * Un aide-mémoire de travail, pas un juge : cocher ne note rien et n'est pas
 * persisté — la progression réelle vient des exercices corrigés. L'avancement
 * est annoncé pour les lecteurs d'écran.
 */
export function ClosingChecklist({ items, title }: { items: string[]; title: string }) {
  const [done, setDone] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setDone((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  return (
    <section className="panel" aria-label={title}>
      <div className="panel-heading">
        <div>
          <span className="section-label">Checklist de clôture</span>
          <h2>{title}</h2>
        </div>
        <span className="state-token" role="status" aria-atomic="true">
          {done.size}/{items.length} étapes
        </span>
      </div>

      <fieldset className="closing-checklist">
        <legend className="sr-only">Étapes de la clôture</legend>
        {items.map((item, index) => (
          <label key={item} className="reconciliation-item">
            <input type="checkbox" checked={done.has(index)} onChange={() => toggle(index)} />
            <span>{item}</span>
          </label>
        ))}
      </fieldset>

      <p className="muted">
        Aide-mémoire de travail : rien n'est enregistré ni noté ici — la progression vient des
        exercices corrigés du niveau.
      </p>
    </section>
  );
}
