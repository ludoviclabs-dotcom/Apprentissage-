"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Correction, LabGrid, RemediationDraft } from "@finance/domain";
import { CorrectionSummary } from "@/components/correction-summary";
import {
  FormulaGridView,
  hasAnyEngineEntry,
  toEngineCells,
  type FormulaGridValues
} from "@/components/forms/formula-grid";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { FeatureState } from "@/lib/features";

/**
 * Un exercice du moteur : la grille qui recalcule, la soumission, la correction.
 *
 * Même contrat que `LabExerciseForm` (grading pur, jamais gaté sur `writes`),
 * plus deux choses propres au moteur :
 *
 * - `activityContext` — les étapes d'un case study soumettent en
 *   "case_study", comme les cas compta de PR-12a ;
 * - le brouillon — quand la base est active, la grille en cours est sauvegardée
 *   (débouncée) et restaurée à l'ouverture. En mode seedé rien n'est envoyé et
 *   la grille repart vide, ce qui est l'état honnête de cette configuration.
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

const DRAFT_DEBOUNCE_MS = 800;

export function FormulaExerciseForm({
  exerciseId,
  grid,
  persistence,
  draftEnabled = false,
  initialCells = null,
  nextHref,
  nextLabel = "Exercice suivant",
  activityContext = "exercise"
}: {
  exerciseId: string;
  grid: LabGrid;
  persistence: FeatureState;
  /** Sauvegarde du brouillon : base active et utilisateur identifié. */
  draftEnabled?: boolean;
  /** Le brouillon restauré, chargé côté serveur. */
  initialCells?: Record<string, string> | null;
  nextHref?: string;
  nextLabel?: string;
  activityContext?: "exercise" | "case_study";
}) {
  const [values, setValues] = useState<FormulaGridValues>(() => {
    const initial: FormulaGridValues = {};

    for (const [ref, raw] of Object.entries(initialCells ?? {})) {
      initial[ref] = String(raw);
    }

    return initial;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [progress, setProgress] = useState<AttemptProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved">("idle");

  // Débounce du brouillon. La première exécution (montage, valeurs restaurées
  // telles quelles) est sautée : il n'y a rien de neuf à sauver.
  const mounted = useRef(false);

  useEffect(() => {
    if (!draftEnabled) {
      return;
    }

    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    setDraftState("saving");
    const timer = setTimeout(() => {
      void (async () => {
        const outcome = await postJson<{ saved: boolean }>("/api/excel/workbooks", {
          exerciseId,
          cells: values
        });

        // Un brouillon qui ne part pas n'est pas une erreur bloquante : le
        // travail est toujours à l'écran et la soumission reste possible.
        setDraftState(outcome.ok && outcome.data.saved ? "saved" : "idle");
      })();
    }, DRAFT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draftEnabled, exerciseId, values]);

  async function submit() {
    setPending(true);
    setError(null);
    // A retry after a failed submission must not leave the previous score
    // announced while the error alert reports a failure.
    setCorrection(null);
    setReview(null);
    setProgress(null);

    const outcome = await postJson<{
      correction?: Correction;
      review?: AttemptReview;
      progress?: AttemptProgress;
    }>("/api/exercises/attempts", {
      exerciseId,
      submission: { kind: "spreadsheet", cells: toEngineCells(values) },
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
  }

  return (
    <section
      className="panel action-form"
      data-exercise-id={exerciseId}
      data-exercise-kind="spreadsheet-formula"
    >
      <FormulaGridView
        grid={grid}
        values={values}
        onChange={setValues}
        selected={selected}
        onSelect={setSelected}
        disabled={pending}
      />

      <div className="journal-actions">
        <button
          type="button"
          className="primary-action"
          disabled={pending || !hasAnyEngineEntry(values)}
          onClick={() => void submit()}
        >
          {pending ? "Correction..." : "Corriger"}
        </button>
        {draftEnabled ? (
          <span className="result-inline muted" data-testid="draft-state">
            {draftState === "saving"
              ? "Brouillon en cours d'enregistrement…"
              : draftState === "saved"
                ? "Brouillon enregistré."
                : "Brouillon enregistré automatiquement."}
          </span>
        ) : persistence.enabled ? null : (
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
