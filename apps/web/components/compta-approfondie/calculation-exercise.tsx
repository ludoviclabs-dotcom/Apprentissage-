"use client";

import { useId, useState } from "react";
import type { PublicCalculationExercise } from "@finance/content-publication/public";
import { CorrectionPanel } from "@/components/compta-approfondie/correction-panel";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { CalculationGradeResponse } from "@/components/compta-approfondie/grading-types";

/**
 * Un exercice de calcul.
 *
 * LE NAVIGATEUR NE SAIT PAS LA RÉPONSE. `PublicCalculationExercise` porte
 * l'énoncé, les variables, l'unité, la tolérance et la règle d'arrondi — de quoi
 * répondre — mais ni `expectedAnswer`, ni les étapes de correction, ni le barème.
 * La notation se fait donc côté serveur, ce qui la rend identique pour tous et
 * invérifiable en lisant le source de la page.
 *
 * LE RETOUR DISTINGUE QUATRE ERREURS. Bon calcul mal arrondi, bonne valeur de
 * signe inversé, hors tolérance, saisie non numérique : ce sont quatre
 * remédiations différentes, et les confondre sous « faux » renverrait
 * l'apprenant réviser la mauvaise chose. Le serveur les nomme ; cet écran les
 * affiche.
 */

const ROUNDING_LABELS: Record<PublicCalculationExercise["roundingRule"], string> = {
  none: "aucun arrondi imposé",
  cent: "arrondir au centime",
  unit: "arrondir à l'unité",
  "two-decimals": "arrondir à deux décimales"
};

export function CalculationExercise({
  chapter,
  exercise
}: {
  chapter: string;
  exercise: PublicCalculationExercise;
}) {
  const fieldId = useId();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graded, setGraded] = useState<CalculationGradeResponse | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (busy || answer.trim().length === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<CalculationGradeResponse>("/api/apprentissage/activites", {
      action: "gradeCalculation",
      chapter,
      artifactId: exercise.exerciseId,
      answer: answer.trim()
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setGraded(result.data);
  }

  function retry(): void {
    setGraded(null);
    setAnswer("");
    setError(null);
  }

  return (
    <article className="activity-card">
      <h3>{exercise.title}</h3>
      <p className="activity-statement">{exercise.statement}</p>

      {exercise.variables.length > 0 ? (
        <div className="table-scroll">
          <table className="variable-table">
            <caption className="sr-only">Données de l&apos;énoncé</caption>
            <thead>
              <tr>
                <th scope="col">Donnée</th>
                <th scope="col">Valeur</th>
                <th scope="col">Unité</th>
              </tr>
            </thead>
            <tbody>
              {exercise.variables.map((variable) => (
                <tr key={variable.name}>
                  <th scope="row">{variable.label}</th>
                  <td>{variable.value.toLocaleString("fr-FR")}</td>
                  <td>{variable.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form onSubmit={submit} className="activity-form">
        <label htmlFor={fieldId}>
          Votre réponse
          <span className="muted">
            {" "}
            en {exercise.unit} — {ROUNDING_LABELS[exercise.roundingRule]}, tolérance ±
            {exercise.tolerance}
          </span>
        </label>
        <div className="activity-input-row">
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            disabled={busy || graded !== null}
            aria-describedby={graded ? `${fieldId}-feedback` : undefined}
          />
          <span aria-hidden="true">{exercise.unit}</span>
          {graded ? (
            <button type="button" className="secondary-action" onClick={retry}>
              Refaire
            </button>
          ) : (
            <button type="submit" className="primary-action" disabled={busy || answer.trim().length === 0}>
              Valider
            </button>
          )}
        </div>
      </form>

      <div id={`${fieldId}-feedback`} aria-live="polite">
        {error ? <Feedback tone="error">{error}</Feedback> : null}

        {graded ? (
          <>
            <Feedback tone={graded.passed ? "success" : graded.errorKind === "arrondi" ? "partial" : "error"}>
              {graded.score}/{graded.maxScore}
              {graded.hint ? ` — ${graded.hint}` : graded.passed ? " — réponse exacte." : ""}
            </Feedback>

            <CorrectionPanel correction={graded.correction} criteria={graded.criteria} feedback={graded.feedback} />
          </>
        ) : null}
      </div>

      <SourceCitation sources={exercise.sources} />
    </article>
  );
}
