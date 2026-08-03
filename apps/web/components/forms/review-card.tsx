"use client";

import { useState } from "react";
import type {
  RemediationDraft,
  ReviewItemType,
  ReviewOutcome,
  ReviewRating,
  SourceReference as SourceReferenceType
} from "@finance/domain";
import { SourceReference } from "@/components/source-reference";
import { postJson } from "@/lib/api-client";
import type { FeatureState } from "@/lib/features";

/**
 * One item of active review.
 *
 * THE ANSWER IS NOT IN THIS COMPONENT'S PROPS. It arrives from
 * `/api/revisions/reveal` when the learner clicks, and until then it exists
 * nowhere in the document. Hiding it with CSS or a collapsed `<details>` would
 * put the answer one "view source" — or one screen reader — away from a learner
 * who has not decided to look, and an answer seen before the attempt to recall
 * makes the rating that follows meaningless.
 *
 * The four rating buttons stay rendered while the answer is hidden, and say why
 * they are disabled. A control that appears only after a reveal would make the
 * card change shape under the learner mid-decision.
 */

const RATINGS: Array<{ value: ReviewRating; label: string; hint: string }> = [
  { value: "forgotten", label: "Pas su", hint: "Revient demain, avec une remédiation." },
  { value: "partial", label: "Partiel", hint: "Revient dans 3 jours." },
  { value: "correct", label: "Su", hint: "Revient dans 7 jours." },
  { value: "mastered", label: "Très facile", hint: "Revient dans 14 jours." }
];

const REVEAL_FIRST = "Affiche la réponse avant de t'auto-évaluer.";

interface RevealedAnswer {
  answer: string;
  explanation: string;
  sourceReferences: SourceReferenceType[];
}

export interface ReviewCardProps {
  itemType: ReviewItemType;
  itemRef: string;
  kindLabel: string;
  prompt: string;
  dueAt: string;
  lapseCount: number;
  reviewCount: number;
  personal: boolean;
  writes: FeatureState;
  persistence: FeatureState;
}

function formatDay(iso: string): string {
  return iso.slice(0, 10);
}

export function ReviewCard({
  itemType,
  itemRef,
  kindLabel,
  prompt,
  dueAt,
  lapseCount,
  reviewCount,
  personal,
  writes,
  persistence
}: ReviewCardProps) {
  const [revealed, setRevealed] = useState<RevealedAnswer | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [remediation, setRemediation] = useState<RemediationDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const locked = !writes.enabled;
  const done = outcome !== null;

  async function reveal() {
    setPending(true);
    setError(null);

    const result = await postJson<{ item: RevealedAnswer }>("/api/revisions/reveal", {
      itemType,
      itemRef
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setRevealed(result.data.item);
  }

  async function rate(rating: ReviewRating) {
    setPending(true);
    setError(null);

    const result = await postJson<{
      outcome: ReviewOutcome;
      remediation: RemediationDraft | null;
    }>("/api/revisions/review", {
      itemType,
      itemRef,
      rating,
      // Always true here: the buttons are unreachable before a reveal. Sent
      // rather than assumed server-side so the stored log records what the
      // client actually did.
      revealed: revealed !== null
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setOutcome(result.data.outcome);
    setRemediation(result.data.remediation);
  }

  return (
    <article className="panel flashcard" data-item-type={itemType} data-item-ref={itemRef}>
      <div className="panel-heading">
        <div>
          <span className="section-label">{kindLabel}</span>
          <h2>{prompt}</h2>
        </div>
        <span className={`state-token ${personal && lapseCount > 0 ? "needs-review" : "processing"}`}>
          {personal ? (lapseCount > 0 ? `${lapseCount} oubli(s)` : "à réviser") : "Exemple"}
        </span>
      </div>

      <p className="muted">
        {personal
          ? `Dû le ${formatDay(dueAt)} · ${reviewCount} révision(s) enregistrée(s)`
          : "Carte de démonstration · aucun historique personnel"}
      </p>

      {revealed ? (
        <div className="expected-answer reveal-appear">
          <strong>Réponse attendue</strong>
          <p>{revealed.answer}</p>
          {revealed.explanation ? <p className="muted">{revealed.explanation}</p> : null}
        </div>
      ) : (
        <button type="button" className="primary-action" disabled={pending} onClick={() => void reveal()}>
          Afficher la réponse
        </button>
      )}

      <div className="review-actions">
        {RATINGS.map((rating) => (
          <button
            key={rating.value}
            type="button"
            className="secondary-action"
            disabled={!revealed || locked || pending || done}
            title={locked ? writes.reason : !revealed ? REVEAL_FIRST : rating.hint}
            onClick={() => void rate(rating.value)}
          >
            {rating.label}
          </button>
        ))}
        {locked ? <span className="result-inline muted">{writes.reason}</span> : null}
        {!locked && !revealed ? <span className="result-inline muted">{REVEAL_FIRST}</span> : null}
      </div>

      {outcome ? (
        <p className="result-inline feedback-appear" role="status">
          Prochaine révision : {formatDay(outcome.nextDueAt)} (dans {outcome.intervalDays} jour
          {outcome.intervalDays > 1 ? "s" : ""})
          {persistence.enabled ? "" : " — non enregistrée"}
        </p>
      ) : null}

      {remediation ? (
        <div className="remediation feedback-appear" role="status">
          <strong>Remédiation créée</strong>
          <p>{remediation.microLesson}</p>
          <p>{remediation.nextAction}</p>
          <small>Retest prévu le {formatDay(remediation.dueAt)}</small>
        </div>
      ) : null}

      {error ? (
        <span className="result-inline error" role="alert">
          {error}
        </span>
      ) : null}

      {/* La réponse révélée est un verdict sourcé (AGENTS.md) : la preuve
          reste visible, elle ne se replie pas derrière un clic. */}
      {revealed ? <SourceReference sources={revealed.sourceReferences} defaultOpen /> : null}
    </article>
  );
}
