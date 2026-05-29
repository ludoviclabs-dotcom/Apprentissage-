"use client";

import { useState } from "react";
import { domains } from "@finance/domain";

interface DiagnosticResult {
  recommendedStart?: {
    domain: string;
    level: number;
    priority: string;
  };
}

export function DiagnosticForm() {
  const [levels, setLevels] = useState<Record<string, number>>(
    Object.fromEntries(domains.map((domain) => [domain.id, 50]))
  );
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submitDiagnostic() {
    setIsPending(true);
    try {
      const response = await fetch("/api/learning/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levels })
      });
      setResult((await response.json()) as DiagnosticResult);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Diagnostic initial</span>
        <h2>Calibrer le parcours</h2>
        <p>Ajuste les niveaux perçus. Le système propose le domaine de départ et le type d'effort.</p>
      </div>
      <div className="slider-grid">
        {domains.map((domain) => (
          <label key={domain.id}>
            <span>{domain.shortName}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={levels[domain.id]}
              onChange={(event) =>
                setLevels((current) => ({
                  ...current,
                  [domain.id]: Number(event.target.value)
                }))
              }
            />
            <strong>{levels[domain.id]}%</strong>
          </label>
        ))}
      </div>
      <button type="button" className="primary-action" onClick={submitDiagnostic} disabled={isPending}>
        {isPending ? "Calcul..." : "Recalibrer"}
      </button>
      {result?.recommendedStart ? (
        <div className="result-box">
          <strong>{result.recommendedStart.domain}</strong>
          <span>
            {result.recommendedStart.level}% · {result.recommendedStart.priority}
          </span>
        </div>
      ) : null}
    </section>
  );
}
