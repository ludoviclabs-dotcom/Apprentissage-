"use client";

import { useState } from "react";
import type { ReviewRating, RevisionReview } from "@finance/domain";
import { postJson } from "@/lib/api-client";
import type { FeatureState } from "@/lib/features";

const ratings: Array<{ value: ReviewRating; label: string }> = [
  { value: "forgotten", label: "Oubliée" },
  { value: "partial", label: "Partielle" },
  { value: "correct", label: "Réussie" },
  { value: "mastered", label: "Maîtrisée" }
];

export function RevisionReviewForm({
  flashcardId,
  writes,
  persistence
}: {
  flashcardId: string;
  writes: FeatureState;
  persistence: FeatureState;
}) {
  const [result, setResult] = useState<RevisionReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = !writes.enabled;

  async function submit(rating: ReviewRating) {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ review?: RevisionReview }>("/api/revisions/review", {
      flashcardId,
      rating
    });

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (!outcome.data.review) {
      setError("Revue impossible");
      return;
    }

    setResult(outcome.data.review);
  }

  return (
    <div className="review-actions">
      {ratings.map((rating) => (
        <button
          key={rating.value}
          type="button"
          className="secondary-action"
          disabled={pending || locked}
          title={locked ? writes.reason : undefined}
          onClick={() => void submit(rating.value)}
        >
          {rating.label}
        </button>
      ))}
      {locked ? <span className="result-inline muted">{writes.reason}</span> : null}
      {result ? (
        <span className="result-inline">
          Prochaine revue : {result.nextDueAt.slice(0, 10)}
          {persistence.enabled ? "" : " (non enregistrée)"}
        </span>
      ) : null}
      {error ? <span className="result-inline error">{error}</span> : null}
    </div>
  );
}
