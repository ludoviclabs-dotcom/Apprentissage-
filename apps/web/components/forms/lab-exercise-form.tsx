"use client";

import Link from "next/link";
import { useState } from "react";
import type { Correction, LabGrid, RemediationDraft } from "@finance/domain";
import { CorrectionSummary } from "@/components/correction-summary";
import {
  LabGridView,
  hasAnyEntry,
  toSpreadsheetCells,
  type LabCellValues
} from "@/components/forms/lab-grid";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { FeatureState } from "@/lib/features";

/**
 * One lab exercise: the grid, the submit, the correction.
 *
 * Not gated on `writes`, for the reason PR-05 recorded: grading is a pure
 * computation that `/api/exercises/attempts` performs whatever the
 * configuration, and only *storing* the attempt needs a database. Disabling the
 * control in the public demo would refuse something that works. `persistence`
 * is what says what is actually missing.
 */

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

export function LabExerciseForm({
  exerciseId,
  grid,
  persistence,
  nextHref,
  nextLabel = "Exercice suivant"
}: {
  exerciseId: string;
  grid: LabGrid;
  persistence: FeatureState;
  nextHref?: string;
  nextLabel?: string;
}) {
  const [values, setValues] = useState<LabCellValues>({});
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [progress, setProgress] = useState<AttemptProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    // A retry after a failed submission must not leave the previous score
    // announced in the sr-only status region while the error alert also
    // reports a failure — the two would contradict each other.
    setCorrection(null);
    setReview(null);
    setProgress(null);

    const outcome = await postJson<{
      correction?: Correction;
      review?: AttemptReview;
      progress?: AttemptProgress;
    }>("/api/exercises/attempts", {
      exerciseId,
      submission: { kind: "spreadsheet", cells: toSpreadsheetCells(values) }
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
  }

  return (
    <section className="panel action-form" data-exercise-id={exerciseId} data-exercise-kind="spreadsheet">
      <LabGridView grid={grid} values={values} onChange={setValues} disabled={pending} />

      <div className="journal-actions">
        <button
          type="button"
          className="primary-action"
          disabled={pending || !hasAnyEntry(values)}
          onClick={() => void submit()}
        >
          {pending ? "Correction..." : "Corriger"}
        </button>
        {persistence.enabled ? null : (
          <span className="result-inline muted">{persistence.publicMessage}</span>
        )}
      </div>

      {/* Région persistante pour lecteur d'écran : en cours puis score. */}
      <p className="sr-only" role="status" aria-atomic="true">
        {pending ? "Correction en cours." : correction ? `Correction reçue : ${correction.score} sur 20.` : ""}
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

      {correction && nextHref ? (
        <Link className="primary-action" href={nextHref}>
          {nextLabel}
        </Link>
      ) : null}
    </section>
  );
}
