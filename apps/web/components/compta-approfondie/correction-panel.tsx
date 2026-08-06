"use client";

import type { StructuredFeedback } from "@finance/domain";
import type {
  CorrectionPayload,
  CriterionPayload
} from "@/components/compta-approfondie/grading-types";

/**
 * La correction, affichée après tentative et jamais avant.
 *
 * ELLE SÉPARE LES TROIS NATURES D'ERREUR qu'`AGENTS.md` impose de distinguer —
 * calcul, traitement comptable, raisonnement — parce que ce sont trois choses à
 * reprendre différemment. Un bloc « erreurs » unique aurait laissé l'apprenant
 * deviner s'il s'est trompé de compte ou de multiplication.
 *
 * Le détail par critère vient des évaluateurs : chaque ligne dit ce qui était
 * attendu et pourquoi les points ont été accordés ou retenus, verbatim.
 */
export function CorrectionPanel({
  correction,
  criteria,
  feedback,
  title = "Correction"
}: {
  correction: CorrectionPayload;
  criteria: readonly CriterionPayload[];
  feedback: StructuredFeedback;
  title?: string;
}) {
  const errorGroups: Array<[string, readonly string[]]> = [
    ["Erreurs de calcul", feedback.calculationErrors],
    ["Erreurs de traitement comptable", feedback.accountingTreatmentErrors],
    ["Erreurs de raisonnement", feedback.reasoningErrors],
    ["Qualité des sources", feedback.sourceQualityIssues]
  ];

  const hasErrors = errorGroups.some(([, entries]) => entries.length > 0);

  return (
    <details className="correction-panel" open>
      <summary>{title}</summary>

      {criteria.length > 0 ? (
        <div className="table-scroll">
          <table className="criteria-table">
            <caption className="sr-only">Détail des points par critère</caption>
            <thead>
              <tr>
                <th scope="col">Critère</th>
                <th scope="col">Points</th>
                <th scope="col">Justification</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((criterion) => (
                <tr key={criterion.id} className={`criterion-${criterion.outcome}`}>
                  <th scope="row">{criterion.label}</th>
                  <td>
                    {criterion.awardedPoints} / {criterion.maxPoints}
                    {/* L'issue n'est jamais portée par la seule couleur de ligne. */}
                    <span className="sr-only">
                      {criterion.outcome === "met"
                        ? " — acquis"
                        : criterion.outcome === "partial"
                          ? " — partiel"
                          : " — manqué"}
                    </span>
                  </td>
                  <td>{criterion.justification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {feedback.correct.length > 0 ? (
        <>
          <h4>Ce qui était juste</h4>
          <ul className="bullet-list">
            {feedback.correct.map((entry, index) => (
              <li key={`${index}-${entry.slice(0, 16)}`}>{entry}</li>
            ))}
          </ul>
        </>
      ) : null}

      {hasErrors
        ? errorGroups.map(([label, entries]) =>
            entries.length > 0 ? (
              <div key={label}>
                <h4>{label}</h4>
                <ul className="bullet-list">
                  {entries.map((entry, index) => (
                    <li key={`${index}-${entry.slice(0, 16)}`}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )
        : null}

      {correction.expectedAnswer ? (
        <p>
          <strong>Réponse attendue&nbsp;:</strong>{" "}
          {correction.expectedAnswer.value.toLocaleString("fr-FR")} {correction.expectedAnswer.unit}
        </p>
      ) : null}

      {correction.steps.length > 0 ? (
        <>
          <h4>Étapes de la correction</h4>
          <ol className="worked-example">
            {correction.steps.map((step) => (
              <li key={step.order}>
                <p>{step.description}</p>
                {step.expression ? (
                  <p className="formula-expression">
                    <code>{step.expression}</code>
                  </p>
                ) : null}
                {step.intermediateResult !== undefined ? (
                  <p className="muted">= {step.intermediateResult.toLocaleString("fr-FR")}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {correction.expectedLines && correction.expectedLines.length > 0 ? (
        <>
          <h4>Écriture attendue</h4>
          <div className="table-scroll">
            <table className="journal-table">
              <caption className="sr-only">Écriture comptable attendue</caption>
              <thead>
                <tr>
                  <th scope="col">Compte</th>
                  <th scope="col">Libellé</th>
                  <th scope="col">Débit</th>
                  <th scope="col">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {correction.expectedLines.map((line, index) => (
                  <tr key={`${line.accountNumber}-${index}`}>
                    <th scope="row">{line.accountNumber}</th>
                    <td>
                      {line.accountLabel}
                      <span className="muted"> — {line.lineExplanation}</span>
                    </td>
                    <td>{line.debit > 0 ? line.debit.toLocaleString("fr-FR") : ""}</td>
                    <td>{line.credit > 0 ? line.credit.toLocaleString("fr-FR") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {correction.expectedCorrection ? (
        <>
          <h4>Correction attendue</h4>
          <p>{correction.expectedCorrection}</p>
        </>
      ) : null}

      <h4>Explication</h4>
      <p>{correction.explanation}</p>
    </details>
  );
}
