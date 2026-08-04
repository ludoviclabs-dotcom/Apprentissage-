"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MAX_SCORE, type Correction } from "@finance/domain";
import { CorrectionSummary } from "@/components/correction-summary";
import {
  JournalEntryForm,
  emptyJournal,
  toSubmissionLines,
  type JournalLineInput
} from "@/components/forms/journal-entry-form";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { DiscoveryStep } from "@/lib/discovery-session";

/**
 * La session découverte, côté navigateur.
 *
 * Toute la progression vit dans ce composant : l'étape courante, les scores
 * obtenus, le récapitulatif. Rien n'est écrit — ni en base, ni dans
 * `localStorage`. `localStorage` fabriquerait une progression durable que le
 * produit ne tient pas : le visiteur reviendrait le lendemain devant un
 * historique qui n'existe nulle part. Un état de composant disparaît avec
 * l'onglet, ce qui est exactement la promesse affichée.
 *
 * La correction vient du serveur (`/api/exercises/session-decouverte`), pas du
 * client : les barèmes et les réponses attendues ne descendent jamais dans le
 * navigateur avant que la réponse ne soit soumise. C'est la même règle que pour
 * la révélation d'une carte de révision.
 *
 * ACCESSIBILITÉ. Le score arrive dans une région `aria-live`, le titre de
 * l'étape reçoit le focus au changement d'étape — sinon un lecteur d'écran
 * resterait sur un bouton qui vient de disparaître — et aucun état n'est porté
 * par la couleur seule : « Étape 2 sur 5 » est du texte, et `CorrectionSummary`
 * préfixe chaque bloc.
 */

const TEMPORARY_RESULT = "Résultat temporaire — non enregistré";

interface StepOutcome {
  exerciseId: string;
  title: string;
  score: number;
}

export interface DiscoverySessionProps {
  steps: DiscoveryStep[];
  /** Décide des portes de sortie proposées à la fin. */
  authEnabled: boolean;
}

export function DiscoverySession({ steps, authEnabled }: DiscoverySessionProps) {
  const [position, setPosition] = useState(0);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Réponses de l'étape courante, remises à zéro à chaque changement d'étape.
  const [lines, setLines] = useState<JournalLineInput[]>(() => emptyJournal(3));
  const [numericValue, setNumericValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);

  const finished = position >= steps.length;
  const step = finished ? undefined : steps[position];

  const journalLines = toSubmissionLines(lines);
  const parsedNumeric = Number(numericValue.replace(/\s/g, "").replace(",", "."));
  const numericReady = numericValue.trim() !== "" && Number.isFinite(parsedNumeric);

  const answerable = !step
    ? false
    : step.kind === "journal_entry"
      ? journalLines.length > 0
      : step.kind === "numeric"
        ? numericReady
        : step.kind === "multiple_choice"
          ? selected.length > 0
          : text.trim().length >= 12;

  function buildSubmission() {
    switch (step?.kind) {
      case "journal_entry":
        return { kind: "journal" as const, lines: journalLines };
      case "numeric":
        return { kind: "numeric" as const, value: parsedNumeric };
      case "multiple_choice":
        return { kind: "choice" as const, selectedOptionIds: selected };
      default:
        return { kind: "text" as const, text };
    }
  }

  async function correct() {
    if (!step) {
      return;
    }

    setPending(true);
    setError(null);

    const outcome = await postJson<{ correction?: Correction }>(
      "/api/exercises/session-decouverte",
      { exerciseId: step.exerciseId, submission: buildSubmission() }
    );

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (!outcome.data.correction) {
      setError("La correction n'a pas abouti.");
      return;
    }

    setCorrection(outcome.data.correction);
    setOutcomes((current) => [
      ...current,
      { exerciseId: step.exerciseId, title: step.title, score: outcome.data.correction!.score }
    ]);
  }

  function advance() {
    setCorrection(null);
    setError(null);
    setLines(emptyJournal(3));
    setNumericValue("");
    setSelected([]);
    setText("");
    setPosition((current) => current + 1);

    // Le focus suit la progression : sans cela il retomberait sur `<body>`
    // quand le bouton « Étape suivante » disparaît avec l'étape corrigée.
    window.requestAnimationFrame(() => {
      (summaryRef.current ?? headingRef.current)?.focus();
    });
  }

  function restart() {
    setOutcomes([]);
    setCorrection(null);
    setError(null);
    setLines(emptyJournal(3));
    setNumericValue("");
    setSelected([]);
    setText("");
    setPosition(0);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (finished) {
    const total = outcomes.reduce((sum, outcome) => sum + outcome.score, 0);
    const average = outcomes.length > 0 ? Math.round(total / outcomes.length) : 0;

    return (
      <section className="panel" data-testid="discovery-summary" aria-labelledby="discovery-summary-title">
        <span className="section-label">Récapitulatif</span>
        <h2 id="discovery-summary-title" ref={summaryRef} tabIndex={-1}>
          Session terminée
        </h2>

        <p className="result-inline muted" data-testid="discovery-temporary">
          {TEMPORARY_RESULT}
        </p>

        <p role="status" aria-atomic="true">
          Moyenne de la session : <strong>{average}</strong> sur {MAX_SCORE}, sur {outcomes.length}{" "}
          exercice{outcomes.length > 1 ? "s" : ""} corrigé{outcomes.length > 1 ? "s" : ""}.
        </p>

        <ol className="priority-list" data-testid="discovery-recap">
          {outcomes.map((outcome) => (
            <li key={outcome.exerciseId} className="priority-row">
              <span className="state-token processing">
                {outcome.score} / {MAX_SCORE}
              </span>
              <div>
                <strong>{outcome.title}</strong>
              </div>
            </li>
          ))}
        </ol>

        <div className="journal-actions">
          {authEnabled ? (
            <>
              <Link className="primary-action inline-link" href="/signup">
                Créer mon espace
              </Link>
              <Link className="secondary-action inline-link" href="/login">
                Se connecter
              </Link>
            </>
          ) : (
            <>
              <Link className="primary-action inline-link" href="/exercices">
                Revenir aux exercices
              </Link>
              <Link className="secondary-action inline-link" href="/parcours">
                Découvrir les parcours
              </Link>
            </>
          )}
          <button type="button" className="secondary-action" onClick={restart}>
            Recommencer la session
          </button>
        </div>
      </section>
    );
  }

  const current = step as DiscoveryStep;

  return (
    <section
      className="panel action-form"
      data-testid="discovery-step"
      data-exercise-id={current.exerciseId}
      data-exercise-kind={current.kind}
      data-step={current.index}
      aria-labelledby="discovery-step-title"
    >
      <div className="panel-heading">
        <div>
          <span className="section-label">
            Étape {current.index} sur {steps.length}
          </span>
          <h2 id="discovery-step-title" ref={headingRef} tabIndex={-1}>
            {current.title}
          </h2>
        </div>
        <span className="state-token processing">≈ {current.estimatedMinutes} min</span>
      </div>

      <p>{current.statement}</p>

      {current.kind === "journal_entry" ? (
        <JournalEntryForm lines={lines} onChange={setLines} disabled={pending || correction !== null} />
      ) : null}

      {current.kind === "numeric" ? (
        <label className="numeric-answer">
          <span>Réponse (€)</span>
          <input
            aria-label="Réponse numérique"
            value={numericValue}
            inputMode="decimal"
            placeholder="0,00"
            disabled={pending || correction !== null}
            onChange={(event) => setNumericValue(event.target.value)}
          />
        </label>
      ) : null}

      {current.kind === "multiple_choice" ? (
        <fieldset className="choice-list">
          <legend className="sr-only">Réponses possibles</legend>
          {current.options.map((option) => (
            <label key={option.id} className="choice-row">
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={pending || correction !== null}
                onChange={(event) =>
                  setSelected((choices) =>
                    event.target.checked
                      ? [...choices, option.id]
                      : choices.filter((id) => id !== option.id)
                  )
                }
              />
              <span>{option.label}</span>
              {/* Le commentaire d'une option est l'explication du piège : il
                  n'apparaît qu'une fois la réponse notée. */}
              {correction && option.rationale ? (
                <small className="muted">{option.rationale}</small>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      {current.kind === "text" ? (
        <textarea
          aria-label="Réponse rédigée"
          value={text}
          rows={6}
          disabled={pending || correction !== null}
          placeholder="Fait, règle, traitement, conclusion sourcée."
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}

      <div className="journal-actions">
        {correction ? (
          <button type="button" className="primary-action" onClick={advance}>
            {current.index === steps.length ? "Voir le récapitulatif" : "Étape suivante"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-action"
            disabled={pending || !answerable}
            onClick={() => void correct()}
          >
            {pending ? "Correction..." : "Corriger"}
          </button>
        )}
        <span className="result-inline muted">{TEMPORARY_RESULT}</span>
      </div>

      {/* Annonce du résultat : le score est du texte dans une région vivante,
          pas seulement une couleur dans le panneau de correction. */}
      <p className="sr-only" role="status" aria-atomic="true">
        {pending
          ? "Correction en cours."
          : correction
            ? `Correction reçue : ${correction.score} sur ${MAX_SCORE}. Résultat non enregistré.`
            : ""}
      </p>

      {error ? <Feedback tone="error">{error}</Feedback> : null}

      {correction ? (
        <div className="feedback-appear" data-testid="discovery-correction">
          <CorrectionSummary correction={correction} />
        </div>
      ) : null}
    </section>
  );
}
