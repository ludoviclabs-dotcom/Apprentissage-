"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicFlashcardFront, PublicSourceReference } from "@finance/content-publication";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";

/**
 * Mode focus : une carte à la fois.
 *
 * LE VERSO N'EST PAS DANS LA PAGE. `PublicFlashcardFront` ne porte que le recto ;
 * la réponse est demandée à `/api/apprentissage/activites` au moment où le
 * lecteur la réclame. C'est la règle que `POST /api/revisions/reveal` applique
 * déjà aux cartes du catalogue, et elle vaut d'autant plus ici que la carte est
 * notée : une réponse présente dans le source de la page rendrait
 * l'auto-évaluation sans objet.
 *
 * AUCUN SECOND ALGORITHME DE RÉPÉTITION ESPACÉE. Les quatre boutons reprennent
 * les quatre `ReviewRating` du domaine, et l'intervalle affiché vient de
 * `REVIEW_INTERVAL_DAYS` renvoyé par le serveur. Ce composant ordonne les cartes
 * de la session, il ne planifie rien.
 */

interface RevealResponse {
  cardId: string;
  back: string;
  explanation: string;
  sources: PublicSourceReference[];
}

interface RatingResponse {
  intervalDays: number;
  nextDueAt: string;
  recorded: boolean;
}

type Rating = "forgotten" | "partial" | "correct" | "mastered";

const RATINGS: Array<{ value: Rating; label: string; key: string }> = [
  { value: "forgotten", label: "Pas su", key: "1" },
  { value: "partial", label: "Partiel", key: "2" },
  { value: "correct", label: "Su", key: "3" },
  { value: "mastered", label: "Très facile", key: "4" }
];

const CARD_TYPE_LABELS: Record<PublicFlashcardFront["type"], string> = {
  concept: "Concept",
  formula: "Formule",
  account: "Compte",
  distinction: "Distinction",
  common_error: "Erreur fréquente",
  diagnostic: "Diagnostic"
};

const STORAGE_PREFIX = "compta-approfondie:flashcards:";

export function ChapterFlashcards({
  chapter,
  cards
}: {
  chapter: string;
  cards: readonly PublicFlashcardFront[];
}) {
  const storageKey = `${STORAGE_PREFIX}${chapter}`;
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<RevealResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInterval, setLastInterval] = useState<number | null>(null);
  const [ratedCount, setRatedCount] = useState(0);
  const [resumed, setResumed] = useState(false);
  const revealButton = useRef<HTMLButtonElement>(null);

  const card = cards[index];
  const finished = index >= cards.length;

  // Reprise d'une session interrompue : la position est relue au montage. Elle
  // est bornée par la longueur courante, sinon une carte archivée depuis la
  // dernière visite laisserait le lecteur sur un index qui n'existe plus.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? Number.parseInt(stored, 10) : 0;

      if (Number.isFinite(parsed) && parsed > 0) {
        setIndex(Math.min(parsed, cards.length));
        setResumed(true);
      }
    } catch {
      setIndex(0);
    }
  }, [storageKey, cards.length]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(index));
    } catch {
      // Stockage indisponible : la session reste utilisable, elle ne se reprend
      // simplement pas après un rechargement.
    }
  }, [storageKey, index]);

  const reveal = useCallback(async (): Promise<void> => {
    if (busy || !card || revealed) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<RevealResponse>("/api/apprentissage/activites", {
      action: "reveal",
      chapter,
      artifactId: card.cardId
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setRevealed(result.data);
  }, [busy, card, revealed, chapter]);

  const rate = useCallback(
    async (rating: Rating): Promise<void> => {
      if (busy || !card || !revealed) {
        return;
      }

      setBusy(true);
      setError(null);

      const result = await postJson<RatingResponse>("/api/apprentissage/activites", {
        action: "rateFlashcard",
        chapter,
        artifactId: card.cardId,
        rating
      });

      setBusy(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLastInterval(result.data.intervalDays);
      setRatedCount((count) => count + 1);
      setRevealed(null);
      setIndex((current) => current + 1);
    },
    [busy, card, revealed, chapter]
  );

  // Raccourcis clavier : Espace révèle, 1 à 4 notent. Ignorés quand le focus est
  // dans un champ, pour ne pas voler la frappe d'un formulaire.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;

      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.key === " " && !revealed) {
        event.preventDefault();
        void reveal();
        return;
      }

      const rating = RATINGS.find((candidate) => candidate.key === event.key);

      if (rating && revealed) {
        event.preventDefault();
        void rate(rating.value);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reveal, rate, revealed]);

  // Le focus revient sur « Afficher la réponse » à chaque nouvelle carte : sans
  // cela il retombe sur le body après la notation, et la navigation au clavier
  // repart du haut de la page à chaque tour.
  useEffect(() => {
    if (!finished) {
      revealButton.current?.focus();
    }
  }, [index, finished]);

  const progressLabel = useMemo(
    () => `Carte ${Math.min(index + 1, cards.length)} sur ${cards.length}`,
    [index, cards.length]
  );

  function restart(): void {
    setIndex(0);
    setRevealed(null);
    setRatedCount(0);
    setLastInterval(null);
  }

  if (finished) {
    return (
      <section className="panel flashcard-focus">
        <h2 className="panel-heading">Session terminée</h2>
        <p>
          {ratedCount} carte{ratedCount > 1 ? "s" : ""} traitée{ratedCount > 1 ? "s" : ""} sur{" "}
          {cards.length}.
        </p>
        {/* L'intervalle de la *dernière* carte n'est visible que si l'écran de
            fin le reprend : la carte qui vient d'être notée est justement celle
            qui fait basculer la session, et son retour ne serait annoncé nulle
            part. */}
        {lastInterval !== null ? (
          <Feedback tone="info" prefix={null}>
            Dernière carte reprogrammée dans {lastInterval} jour{lastInterval > 1 ? "s" : ""}.
          </Feedback>
        ) : null}
        <p className="muted">
          Les cartes reviennent selon l&apos;échelle de révision du produit : 1 jour si elle
          n&apos;était pas sue, 3 en partiel, 7 si elle l&apos;était, 14 si elle était très facile.
        </p>
        <button type="button" className="secondary-action" onClick={restart}>
          Recommencer la session
        </button>
      </section>
    );
  }

  return (
    <section className="panel flashcard-focus" aria-labelledby="flashcard-heading">
      <h2 className="panel-heading" id="flashcard-heading">
        Cartes du chapitre
      </h2>

      {resumed && index > 0 ? (
        <p className="muted">Session reprise là où elle s&apos;était arrêtée.</p>
      ) : null}

      <div className="flashcard-progress">
        <progress value={index} max={cards.length} aria-label="Progression de la session" />
        <span>{progressLabel}</span>
      </div>

      {/* Le changement de carte est annoncé : sans cela, un lecteur d'écran reste
          silencieux au passage à la suivante et l'utilisateur croit l'action perdue. */}
      <div aria-live="polite" aria-atomic="true" className="flashcard-card">
        <p className="muted">
          {CARD_TYPE_LABELS[card.type]} · difficulté {card.difficulty}/5
        </p>

        <p className="flashcard-front">{card.front}</p>

        {revealed ? (
          <div className="flashcard-back">
            <h3>Réponse</h3>
            <p>{revealed.back}</p>
            <h4>Explication</h4>
            <p>{revealed.explanation}</p>
            <SourceCitation sources={revealed.sources} />
          </div>
        ) : null}
      </div>

      {!revealed ? (
        <div className="flashcard-actions">
          <button
            ref={revealButton}
            type="button"
            className="primary-action"
            disabled={busy}
            onClick={reveal}
          >
            Afficher la réponse
          </button>
          <p className="muted">Raccourci&nbsp;: barre d&apos;espace.</p>
        </div>
      ) : (
        <div className="flashcard-actions">
          <p id="rating-legend">Comment s&apos;est passé le rappel&nbsp;?</p>
          <div className="flashcard-ratings" role="group" aria-labelledby="rating-legend">
            {RATINGS.map((rating) => (
              <button
                key={rating.value}
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={() => rate(rating.value)}
              >
                {rating.label} <span className="muted">({rating.key})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {lastInterval !== null ? (
        <Feedback tone="info" prefix={null}>
          Carte précédente reprogrammée dans {lastInterval} jour{lastInterval > 1 ? "s" : ""}.
        </Feedback>
      ) : null}

      {error ? <Feedback tone="error">{error}</Feedback> : null}
    </section>
  );
}
