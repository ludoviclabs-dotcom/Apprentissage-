"use client";

import { useId, useState } from "react";
import type { PublicErrorDiagnosisExercise } from "@finance/content-publication";
import { CorrectionPanel } from "@/components/compta-approfondie/correction-panel";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { DiagnosisGradeResponse } from "@/components/compta-approfondie/grading-types";

/**
 * Diagnostic d'erreur : nommer la nature de la faute.
 *
 * SEULE LA CATÉGORIE EST NOTÉE. La justification libre est enregistrée et
 * rendue à l'apprenant à côté de la correction, sans note : la comparer à un
 * corrigé rédigé demanderait une notation par modèle, que ce lot exclut. Le dire
 * à l'écran vaut mieux que laisser croire à une évaluation qui n'existe pas.
 *
 * Les neuf catégories du domaine sont libellées en français par
 * `errorCategoryLabels` : aucun identifiant brut n'atteint l'écran.
 */

const CATEGORY_LABELS: Record<string, string> = {
  wrong_account: "Mauvais compte",
  wrong_debit_credit_direction: "Mauvais sens débit/crédit",
  wrong_amount: "Mauvais montant",
  wrong_formula: "Mauvaise formule",
  missing_line: "Ligne manquante",
  wrong_date: "Mauvaise date",
  wrong_valuation_basis: "Mauvaise base de valorisation",
  double_counting: "Double comptabilisation",
  no_error: "Aucune erreur"
};

export function ErrorDiagnosis({
  chapter,
  exercise
}: {
  chapter: string;
  exercise: PublicErrorDiagnosisExercise;
}) {
  const groupId = useId();
  const [category, setCategory] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graded, setGraded] = useState<DiagnosisGradeResponse | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (busy || category.length === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<DiagnosisGradeResponse>("/api/apprentissage/activites", {
      action: "gradeDiagnosis",
      chapter,
      artifactId: exercise.exerciseId,
      category,
      ...(justification.trim().length > 0 ? { justification: justification.trim() } : {})
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setGraded(result.data);
  }

  return (
    <article className="activity-card">
      <h3>{exercise.title}</h3>
      <p className="activity-statement">{exercise.scenario}</p>

      {exercise.proposedAnswer ? (
        <blockquote className="proposed-answer">
          <p>{exercise.proposedAnswer}</p>
        </blockquote>
      ) : null}

      {exercise.proposedEntry && exercise.proposedEntry.length > 0 ? (
        <div className="table-scroll">
          <table className="journal-table">
            <caption>Écriture proposée — à examiner</caption>
            <thead>
              <tr>
                <th scope="col">Compte</th>
                <th scope="col">Libellé</th>
                <th scope="col">Débit</th>
                <th scope="col">Crédit</th>
              </tr>
            </thead>
            <tbody>
              {exercise.proposedEntry.map((line, index) => (
                <tr key={`${line.accountNumber}-${index}`}>
                  <th scope="row">{line.accountNumber}</th>
                  <td>{line.accountLabel}</td>
                  <td>{line.debit > 0 ? line.debit.toLocaleString("fr-FR") : ""}</td>
                  <td>{line.credit > 0 ? line.credit.toLocaleString("fr-FR") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form onSubmit={submit} className="activity-form">
        <fieldset disabled={graded !== null}>
          <legend>Quelle est la nature de l&apos;erreur&nbsp;?</legend>
          <div className="choice-list">
            {exercise.errorCategories.map((candidate) => (
              <label key={candidate} className="choice-option">
                <input
                  type="radio"
                  name={groupId}
                  value={candidate}
                  checked={category === candidate}
                  onChange={(event) => setCategory(event.target.value)}
                />
                {CATEGORY_LABELS[candidate] ?? candidate}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor={`${groupId}-justification`}>
          Justification <span className="muted">(facultative, enregistrée mais non notée)</span>
        </label>
        <textarea
          id={`${groupId}-justification`}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          rows={3}
          maxLength={2000}
          disabled={graded !== null}
        />

        <div className="activity-input-row">
          {graded ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setGraded(null);
                setCategory("");
                setJustification("");
              }}
            >
              Refaire
            </button>
          ) : (
            <button type="submit" className="primary-action" disabled={busy || category.length === 0}>
              Valider
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {error ? <Feedback tone="error">{error}</Feedback> : null}

        {graded ? (
          <>
            <Feedback tone={graded.passed ? "success" : "error"}>
              {graded.passed
                ? "Nature de l'erreur correctement identifiée."
                : `Catégorie attendue : ${CATEGORY_LABELS[graded.correction.expectedErrorCategory ?? ""] ?? "—"}.`}
            </Feedback>

            {justification.trim().length > 0 ? (
              <p className="muted">
                Votre justification a été enregistrée. Elle n&apos;est pas notée dans cette version&nbsp;:
                comparez-la vous-même à la correction ci-dessous.
              </p>
            ) : null}

            <CorrectionPanel
              correction={graded.correction}
              criteria={graded.criteria}
              feedback={graded.feedback}
            />
          </>
        ) : null}
      </div>

      <SourceCitation sources={exercise.sources} />
    </article>
  );
}
