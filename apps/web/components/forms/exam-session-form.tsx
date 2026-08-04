"use client";

import { useMemo, useState } from "react";
import type { ExamSession, Exercise } from "@finance/domain";
import { postJson } from "@/lib/api-client";
import { FeatureNotice } from "@/components/feature-notice";
import type { FeatureState } from "@/lib/features";

/** Mirrors `userAnswer: z.string().min(12)` in app/api/exams/submit. */
const MIN_ANSWER_LENGTH = 12;

export function ExamSessionForm({
  exam,
  exercises,
  writes,
  persistence
}: {
  exam: ExamSession;
  exercises: Exercise[];
  writes: FeatureState;
  persistence: FeatureState;
}) {
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !writes.enabled;
  const scopedExercises = useMemo(
    () => exercises.filter((exercise) => exam.exerciseIds.includes(exercise.id)),
    [exam.exerciseIds, exercises]
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(scopedExercises.map((exercise) => [exercise.id, ""]))
  );
  const incompleteAnswers = scopedExercises.filter(
    (exercise) => (answers[exercise.id] ?? "").trim().length < MIN_ANSWER_LENGTH
  );

  async function start() {
    setPending(true);
    setError(null);

    const outcome = await postJson<unknown>("/api/exams/start", { examId: exam.id });

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    setStarted(true);
  }

  async function submit() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ score?: number }>("/api/exams/submit", {
      answers: Object.entries(answers).map(([exerciseId, userAnswer]) => ({ exerciseId, userAnswer }))
    });

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (typeof outcome.data.score !== "number") {
      setError("Soumission impossible");
      return;
    }

    setScore(outcome.data.score);
  }

  return (
    <div className="exam-runner">
      <FeatureNotice feature={writes} />
      {!started ? (
        <button
          type="button"
          className="primary-action"
          disabled={pending || locked}
          title={locked ? writes.publicMessage : undefined}
          onClick={() => void start()}
        >
          Demarrer l'examen
        </button>
      ) : (
        <div className="action-form">
          {scopedExercises.map((exercise) => (
            <label key={exercise.id}>
              {exercise.title}
              <span className="muted">{exercise.statement}</span>
              <textarea
                minLength={MIN_ANSWER_LENGTH}
                rows={4}
                value={answers[exercise.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [exercise.id]: event.target.value }))
                }
              />
            </label>
          ))}
          {incompleteAnswers.length > 0 ? (
            <p className="muted">
              {incompleteAnswers.length} réponse(s) sous {MIN_ANSWER_LENGTH} caractères. Toutes les
              réponses sont requises pour soumettre.
            </p>
          ) : null}
          <button
            type="button"
            className="primary-action"
            disabled={pending || locked || incompleteAnswers.length > 0}
            onClick={() => void submit()}
          >
            Soumettre
          </button>
        </div>
      )}
      {score !== null ? (
        <div className="result-box">
          Score moyen : {score}/20
          {persistence.enabled ? null : <span className="muted">{persistence.publicMessage}</span>}
        </div>
      ) : null}
      {error ? <div className="result-box error">{error}</div> : null}
    </div>
  );
}
