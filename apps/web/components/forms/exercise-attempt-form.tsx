"use client";

import Link from "next/link";
import { useState } from "react";
import type { Correction, Exercise, RemediationDraft } from "@finance/domain";
import { postJson } from "@/lib/api-client";
import { CorrectionSummary } from "../correction-summary";

/** The half of the response that says what happens next, not what just happened. */
interface AttemptReview {
  intervalDays: number;
  dueAt: string;
  remediation: RemediationDraft | null;
}

export function ExerciseAttemptForm({ exercise }: { exercise: Exercise }) {
  const [answer, setAnswer] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitAttempt() {
    setIsPending(true);
    setError(null);
    setCorrection(null);
    setReview(null);

    try {
      const outcome = await postJson<{ correction?: Correction; review?: AttemptReview }>(
        "/api/exercises/attempts",
        {
          exerciseId: exercise.id,
          userAnswer: answer
        }
      );

      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }

      if (!outcome.data.correction) {
        setError("Correction impossible.");
        return;
      }

      setCorrection(outcome.data.correction);
      setReview(outcome.data.review ?? null);
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
      {review ? (
        <div className="remediation">
          <strong>Révision programmée</strong>
          <p>
            Cet exercice revient le {review.dueAt.slice(0, 10)} (dans {review.intervalDays} jour
            {review.intervalDays > 1 ? "s" : ""}).
          </p>
          {review.remediation ? <p>{review.remediation.nextAction}</p> : null}
          <Link href="/revisions">Voir la file de révision</Link>
        </div>
      ) : null}
    </section>
  );
}
