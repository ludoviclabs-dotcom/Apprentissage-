"use client";

import { useEffect, useState } from "react";
import {
  REVIEW_INTERVAL_DAYS,
  type RemediationDraft,
  type ReviewItemType,
  type ReviewOutcome,
  type ReviewRating,
  type SourceReference as SourceReferenceType
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
 * DEUX MODES, UN SEUL COMPOSANT.
 *
 * `persisted` : le comportement historique. La notation part vers
 * `/api/revisions/review`, qui planifie, crée la remédiation et écrit.
 *
 * `local` : le mode découverte. Les quatre boutons fonctionnent, mais la
 * notation est calculée dans le navigateur sur la MÊME échelle
 * (`REVIEW_INTERVAL_DAYS`, importée du domaine, pas recopiée) et aucune requête
 * d'écriture n'est émise. Avant PR-20 ces boutons étaient désactivés et
 * portaient, sous chaque carte, un message nommant `LEARNING_HUB_AUTH_ENABLED` :
 * le visiteur ne pouvait ni essayer le geste central du produit, ni comprendre
 * pourquoi.
 *
 * L'état local va dans `sessionStorage`, jamais dans `localStorage`. Un onglet
 * fermé doit tout oublier : `localStorage` fabriquerait une progression qui
 * survit à la visite alors qu'aucun serveur ne la connaît, ce qui est
 * exactement le mensonge que ce mode doit éviter.
 */

const RATINGS: Array<{ value: ReviewRating; label: string; hint: string }> = [
  { value: "forgotten", label: "Pas su", hint: "Revient demain, avec une remédiation." },
  { value: "partial", label: "Partiel", hint: "Revient dans 3 jours." },
  { value: "correct", label: "Su", hint: "Revient dans 7 jours." },
  { value: "mastered", label: "Très facile", hint: "Revient dans 14 jours." }
];

const REVEAL_FIRST = "Affiche la réponse avant de t'auto-évaluer.";
const TEMPORARY_RATING = "Évaluation temporaire — non enregistrée";

/** Préfixe de clé, pour pouvoir tout retrouver et tout effacer d'un bloc. */
const LOCAL_RATING_PREFIX = "flh:decouverte:revision:";

export type ReviewCardMode = "persisted" | "local";

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
  /** `local` en mode découverte : aucune requête d'écriture n'est émise. */
  mode: ReviewCardMode;
  persistence: FeatureState;
}

function formatDay(iso: string): string {
  return iso.slice(0, 10);
}

function storageKey(itemType: ReviewItemType, itemRef: string): string {
  return `${LOCAL_RATING_PREFIX}${itemType}:${itemRef}`;
}

/**
 * Lecture tolérante : un `sessionStorage` indisponible (mode privé strict,
 * quota) ou une valeur devenue invalide ne doit pas empêcher la carte de
 * s'afficher. Une auto-évaluation de démonstration perdue n'est pas une panne.
 */
function readLocalRating(itemType: ReviewItemType, itemRef: string): ReviewRating | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey(itemType, itemRef));

    return stored !== null && stored in REVIEW_INTERVAL_DAYS ? (stored as ReviewRating) : null;
  } catch {
    return null;
  }
}

function writeLocalRating(itemType: ReviewItemType, itemRef: string, rating: ReviewRating): void {
  try {
    window.sessionStorage.setItem(storageKey(itemType, itemRef), rating);
  } catch {
    // L'état reste dans le composant : la session courante fonctionne quand même.
  }
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
  mode,
  persistence
}: ReviewCardProps) {
  const [revealed, setRevealed] = useState<RevealedAnswer | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [localRating, setLocalRating] = useState<ReviewRating | null>(null);
  const [remediation, setRemediation] = useState<RemediationDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const local = mode === "local";
  const done = local ? localRating !== null : outcome !== null;

  // Restauré après le premier rendu, pas pendant : lire `sessionStorage` au
  // rendu initial ferait diverger le HTML serveur et le DOM client.
  useEffect(() => {
    if (!local) {
      return;
    }

    setLocalRating(readLocalRating(itemType, itemRef));
  }, [local, itemType, itemRef]);

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

  function rateLocally(rating: ReviewRating) {
    setLocalRating(rating);
    writeLocalRating(itemType, itemRef, rating);
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
    <article className="panel flashcard" data-item-type={itemType} data-item-ref={itemRef} data-mode={mode}>
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
            disabled={!revealed || pending || done}
            title={!revealed ? REVEAL_FIRST : rating.hint}
            onClick={() => (local ? rateLocally(rating.value) : void rate(rating.value))}
          >
            {rating.label}
          </button>
        ))}
        {/* Un seul message, et il parle de la carte — plus de rappel de
            configuration répété sous chacune d'elles. */}
        {!revealed ? <span className="result-inline muted">{REVEAL_FIRST}</span> : null}
      </div>

      {local && localRating ? (
        <div className="feedback-appear" role="status">
          <p className="result-inline">
            Simulation : cette carte reviendrait dans {REVIEW_INTERVAL_DAYS[localRating]} jour
            {REVIEW_INTERVAL_DAYS[localRating] > 1 ? "s" : ""}.
          </p>
          <p className="result-inline muted" data-testid="local-rating-note">
            {TEMPORARY_RATING}
          </p>
        </div>
      ) : null}

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
