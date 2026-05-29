"use client";

import { useState } from "react";
import type { Correction, Exercise } from "@finance/domain";
import { CorrectionSummary } from "../correction-summary";

export function ExerciseAttemptForm({ exercise }: { exercise: Exercise }) {
  const [answer, setAnswer] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitAttempt() {
    setIsPending(true);
    setError(null);
    setCorrection(null);

    try {
      const response = await fetch("/api/exercises/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.id, userAnswer: answer })
      });
      const payload = (await response.json()) as { correction?: Correction; error?: string };

      if (!response.ok || !payload.correction) {
        setError(payload.error ?? "Correction impossible.");
        return;
      }

      setCorrection(payload.correction);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Tentative</span>
        <h2>Corriger une réponse</h2>
        <p>Colle une réponse courte. La correction déterministe garde le format prévu pour l'agent correcteur.</p>
      </div>
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Ta réponse structurée : fait, règle, traitement, conclusion..."
        rows={7}
      />
      <button type="button" className="primary-action" onClick={submitAttempt} disabled={isPending || answer.length < 12}>
        {isPending ? "Correction..." : "Corriger"}
      </button>
      {error ? (
        <div className="result-box error">
          <strong>{error}</strong>
        </div>
      ) : null}
      {correction ? <CorrectionSummary correction={correction} /> : null}
    </section>
  );
}
