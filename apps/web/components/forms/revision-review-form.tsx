"use client";

import { useState } from "react";
import type { ReviewRating, RevisionReview } from "@finance/domain";

const ratings: Array<{ value: ReviewRating; label: string }> = [
  { value: "forgotten", label: "Oubliee" },
  { value: "partial", label: "Partielle" },
  { value: "correct", label: "Reussie" },
  { value: "mastered", label: "Maitrisee" }
];

export function RevisionReviewForm({ flashcardId }: { flashcardId: string }) {
  const [result, setResult] = useState<RevisionReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(rating: ReviewRating) {
    setPending(true);
    setError(null);

    const response = await fetch("/api/revisions/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcardId, rating })
    });
    const payload = (await response.json()) as { review?: RevisionReview; error?: string };

    setPending(false);

    if (!response.ok || !payload.review) {
      setError(payload.error ?? "Revue impossible");
      return;
    }

    setResult(payload.review);
  }

  return (
    <div className="review-actions">
      {ratings.map((rating) => (
        <button
          key={rating.value}
          type="button"
          className="secondary-action"
          disabled={pending}
          onClick={() => void submit(rating.value)}
        >
          {rating.label}
        </button>
      ))}
      {result ? (
        <span className="result-inline">Prochaine revue : {result.nextDueAt.slice(0, 10)}</span>
      ) : null}
      {error ? <span className="result-inline error">{error}</span> : null}
    </div>
  );
}
