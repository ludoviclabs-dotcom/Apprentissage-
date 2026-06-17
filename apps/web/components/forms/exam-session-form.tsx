"use client";

import { useMemo, useState } from "react";
import type { ExamSession, Exercise } from "@finance/domain";

export function ExamSessionForm({
  exam,
  exercises
}: {
  exam: ExamSession;
  exercises: Exercise[];
}) {
  const [started, setStarted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopedExercises = useMemo(
    () => exercises.filter((exercise) => exam.exerciseIds.includes(exercise.id)),
    [exam.exerciseIds, exercises]
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(scopedExercises.map((exercise) => [exercise.id, ""]))
  );

  async function start() {
    setPending(true);
    setError(null);

    const response = await fetch("/api/exams/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId: exam.id })
    });
    const payload = (await response.json()) as { error?: string };

    setPending(false);

    if (!response.ok) {
      setError(payload.error ?? "Demarrage impossible");
      return;
    }

    setStarted(true);
  }

  async function submit() {
    setPending(true);
    setError(null);

    const response = await fetch("/api/exams/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: Object.entries(answers).map(([exerciseId, userAnswer]) => ({ exerciseId, userAnswer }))
      })
    });
    const payload = (await response.json()) as { score?: number; error?: string };

    setPending(false);

    if (!response.ok || typeof payload.score !== "number") {
      setError(payload.error ?? "Soumission impossible");
      return;
    }

    setScore(payload.score);
  }

  return (
    <div className="exam-runner">
      {!started ? (
        <button type="button" className="primary-action" disabled={pending} onClick={() => void start()}>
          Demarrer l'examen
        </button>
      ) : (
        <div className="action-form">
          {scopedExercises.map((exercise) => (
            <label key={exercise.id}>
              {exercise.title}
              <span className="muted">{exercise.statement}</span>
              <textarea
                minLength={12}
                rows={4}
                value={answers[exercise.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [exercise.id]: event.target.value }))
                }
              />
            </label>
          ))}
          <button type="button" className="primary-action" disabled={pending} onClick={() => void submit()}>
            Soumettre
          </button>
        </div>
      )}
      {score !== null ? <div className="result-box">Score moyen : {score}/20</div> : null}
      {error ? <div className="result-box error">{error}</div> : null}
    </div>
  );
}
