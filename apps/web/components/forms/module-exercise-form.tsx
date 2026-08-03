"use client";

import Link from "next/link";
import { useState } from "react";
import { MAX_SCORE, type Correction, type RemediationDraft } from "@finance/domain";
import { CorrectionSummary } from "@/components/correction-summary";
import {
  JournalEntryForm,
  emptyJournal,
  toSubmissionLines,
  type JournalLineInput
} from "@/components/forms/journal-entry-form";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { FeatureState } from "@/lib/features";

/**
 * One module exercise, answered in its own terms.
 *
 * The input is chosen by the exercise's *evaluation type*, not by its display
 * type: a journal entry gets the journal, a calculation gets a number field, a
 * QCM gets checkboxes. That is the whole point of PR-03's typed engine — asking
 * for a number and grading it as prose is the false negative the typed
 * evaluators exist to remove, and it comes straight back if the form sends text.
 *
 * The submit button stays disabled until the answer is answerable, so a learner
 * never spends an attempt on an empty form.
 *
 * IT IS NOT GATED ON `writes`. Grading is a pure computation and
 * `/api/exercises/attempts` performs it whatever the configuration — only the
 * *storing* of the attempt needs a database. Disabling the button in the public
 * demo would therefore refuse something that works, which is the same dishonesty
 * as an enabled control that does nothing. What the demo cannot do is remember,
 * and `persistence` is what says so.
 */

export type ModuleExerciseKind = "journal_entry" | "numeric" | "multiple_choice" | "text";

export interface ChoiceOption {
  id: string;
  label: string;
  rationale?: string;
}

interface AttemptReview {
  intervalDays: number;
  dueAt: string;
  remediation: RemediationDraft | null;
}

interface AttemptProgress {
  attributed: boolean;
  levelId: string | null;
  reason: string | null;
}

interface MiniCaseClosing {
  label: string;
  expectedTvaCollectee: number;
  expectedTvaDeductible: number;
  expectedTvaADecaisser: number;
}

export interface ModuleExerciseFormProps {
  exerciseId: string;
  kind: ModuleExerciseKind;
  options?: ChoiceOption[];
  unit?: string;
  persistence: FeatureState;
  /** Where "next" goes once this exercise is answered. */
  nextHref?: string;
  nextLabel?: string;
  /**
   * Fetches and shows the mini-case's closing VAT figures once this exercise
   * is answered perfectly.
   *
   * The closing figures are the exact expected answer to this exercise, so they
   * cannot arrive as a prop: a Server Component prop is serialized into the
   * page's own initial payload regardless of whatever client-side condition
   * later guards its rendering — passing them that way was tried, and the
   * Playwright assertion that reads the server's own response bytes caught them
   * there. Gating on `MAX_SCORE` rather than "any correction" also closes the
   * narrower path of submitting a wrong guess first — nothing this specific
   * would otherwise reveal — retrying with the number just shown.
   */
  revealMiniCaseClosing?: boolean;
  activityContext?: "exercise" | "case_study";
}

export function ModuleExerciseForm({
  exerciseId,
  kind,
  options = [],
  unit = "€",
  persistence,
  nextHref,
  nextLabel = "Étape suivante",
  revealMiniCaseClosing = false,
  activityContext = "exercise"
}: ModuleExerciseFormProps) {
  const [lines, setLines] = useState<JournalLineInput[]>(emptyJournal(3));
  const [numericValue, setNumericValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const [correction, setCorrection] = useState<Correction | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [progress, setProgress] = useState<AttemptProgress | null>(null);
  const [closing, setClosing] = useState<MiniCaseClosing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const journalLines = toSubmissionLines(lines);
  const parsedNumeric = Number(numericValue.replace(/\s/g, "").replace(",", "."));
  const numericReady = numericValue.trim() !== "" && Number.isFinite(parsedNumeric);

  const answerable =
    kind === "journal_entry"
      ? journalLines.length > 0
      : kind === "numeric"
        ? numericReady
        : kind === "multiple_choice"
          ? selected.length > 0
          : text.trim().length >= 12;

  function buildSubmission() {
    switch (kind) {
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

  async function submit() {
    setPending(true);
    setError(null);
    // A retry after a failed submission must not leave the previous score
    // announced in the sr-only status region while the error alert also
    // reports a failure — the two would contradict each other.
    setCorrection(null);
    setReview(null);
    setProgress(null);
    setClosing(null);

    const outcome = await postJson<{
      correction?: Correction;
      review?: AttemptReview;
      progress?: AttemptProgress;
    }>("/api/exercises/attempts", {
      exerciseId,
      submission: buildSubmission(),
      activityContext
    });

    setPending(false);

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
    setProgress(outcome.data.progress ?? null);

    if (revealMiniCaseClosing && outcome.data.correction.score >= MAX_SCORE) {
      // A plain GET, not `postJson`: this is a read with no body, and the
      // route accepts nothing but GET. Best-effort — the exercise is already
      // graded and shown, so a failed reveal must not surface as an error on
      // the correction itself.
      try {
        const closingResponse = await fetch("/api/modules/comptabilite-generale/mini-case/closing");

        if (closingResponse.ok) {
          const body = (await closingResponse.json()) as { closing: MiniCaseClosing };
          setClosing(body.closing);
        }
      } catch {
        // Network failure: leave `closing` unset.
      }
    }
  }

  return (
    <section className="panel action-form" data-exercise-id={exerciseId} data-exercise-kind={kind}>
      {kind === "journal_entry" ? (
        <JournalEntryForm lines={lines} onChange={setLines} disabled={pending} />
      ) : null}

      {kind === "numeric" ? (
        <label className="numeric-answer">
          <span>Réponse ({unit})</span>
          <input
            aria-label="Réponse numérique"
            value={numericValue}
            inputMode="decimal"
            placeholder="0,00"
            disabled={pending}
            onChange={(event) => setNumericValue(event.target.value)}
          />
        </label>
      ) : null}

      {kind === "multiple_choice" ? (
        <fieldset className="choice-list">
          <legend className="sr-only">Réponses possibles</legend>
          {options.map((option) => (
            <label key={option.id} className="choice-row">
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={pending}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, option.id]
                      : current.filter((id) => id !== option.id)
                  )
                }
              />
              <span>{option.label}</span>
              {/* Rationales explain a distractor, so they appear only once the
                  answer has been marked — before that they are the answer. */}
              {correction && option.rationale ? (
                <small className="muted">{option.rationale}</small>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      {kind === "text" ? (
        <textarea
          aria-label="Réponse rédigée"
          value={text}
          rows={6}
          disabled={pending}
          placeholder="Fait, règle, traitement, conclusion sourcée."
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}

      <div className="journal-actions">
        <button
          type="button"
          className="primary-action"
          disabled={pending || !answerable}
          onClick={() => void submit()}
        >
          {pending ? "Correction..." : "Corriger"}
        </button>
        {persistence.enabled ? null : (
          <span className="result-inline muted">{persistence.reason}</span>
        )}
      </div>

      {/* Région persistante pour lecteur d'écran : en cours puis score. */}
      <p className="sr-only" role="status" aria-atomic="true">
        {pending ? "Correction en cours." : correction ? `Correction reçue : ${correction.score} sur ${MAX_SCORE}.` : ""}
      </p>

      {error ? <Feedback tone="error">{error}</Feedback> : null}

      {correction ? (
        <div className="feedback-appear">
          <CorrectionSummary correction={correction} />
        </div>
      ) : null}

      {review ? (
        <div className="remediation feedback-appear">
          <strong>Révision programmée</strong>
          <p>
            Cet exercice revient le {review.dueAt.slice(0, 10)} (dans {review.intervalDays} jour
            {review.intervalDays > 1 ? "s" : ""}).
            {persistence.enabled ? "" : " — non enregistrée"}
          </p>
          {review.remediation ? <p>{review.remediation.nextAction}</p> : null}
        </div>
      ) : null}

      {progress ? (
        <p className="result-inline" data-testid="progress-note" role="status">
          {progress.attributed
            ? "Progression mise à jour pour ce niveau."
            : "Progression non enregistrée dans cette configuration."}
        </p>
      ) : null}

      {closing ? (
        <section className="panel" data-testid="mini-case-closing">
          <span className="section-label">Clôture</span>
          <h2>{closing.label}</h2>
          <p>
            TVA collectée {closing.expectedTvaCollectee.toLocaleString("fr-FR")} € · TVA déductible{" "}
            {closing.expectedTvaDeductible.toLocaleString("fr-FR")} € · TVA à décaisser{" "}
            {closing.expectedTvaADecaisser.toLocaleString("fr-FR")} €.
          </p>
        </section>
      ) : null}

      {correction && nextHref ? (
        <Link className="primary-action" href={nextHref}>
          {nextLabel}
        </Link>
      ) : null}
    </section>
  );
}
