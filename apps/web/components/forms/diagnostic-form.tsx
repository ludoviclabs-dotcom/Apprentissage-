"use client";

import { useState } from "react";
import { domains } from "@finance/domain";
import { postJson } from "@/lib/api-client";

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submitDiagnostic() {
    setIsPending(true);
    setError(null);

    try {
      const outcome = await postJson<DiagnosticResult>("/api/learning/diagnostic", { levels });

      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }

      setResult(outcome.data);
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
      {error ? <div className="result-box error">{error}</div> : null}
    </section>
  );
}
