"use client";

import { useState } from "react";
import type { Correction, Exercise } from "@finance/domain";
import { postJson } from "@/lib/api-client";
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
      const outcome = await postJson<{ correction?: Correction }>("/api/exercises/attempts", {
        exerciseId: exercise.id,
        userAnswer: answer
      });

      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }

      if (!outcome.data.correction) {
        setError("Correction impossible.");
        return;
      }

      setCorrection(outcome.data.correction);
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
