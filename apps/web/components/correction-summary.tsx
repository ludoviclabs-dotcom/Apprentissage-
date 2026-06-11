import type { Correction } from "@finance/domain";
import { SourceReference } from "./source-reference";

function ErrorGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CorrectionSummary({
  correction,
  label = "Derniere correction"
}: {
  correction: Correction;
  label?: string;
}) {
  const structuredErrorCount =
    correction.calculationErrors.length +
    correction.accountingTreatmentErrors.length +
    correction.reasoningErrors.length +
    correction.sourceQualityIssues.length;

  return (
    <section className="panel correction-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">{label}</span>
          <h2>Score {correction.score}/20</h2>
        </div>
      </div>

      <p>{correction.summary}</p>

      {correction.rubricScores.length > 0 ? (
        <div className="rubric-score-list">
          {correction.rubricScores.map((item) => (
            <article key={item.criterion} className="rubric-score-row">
              <div>
                <strong>{item.criterion}</strong>
                <span>{item.justification}</span>
              </div>
              <b>
                {item.awardedPoints}/{item.maxPoints}
              </b>
            </article>
          ))}
        </div>
      ) : null}

      <div className="correction-columns">
        <div>
          <h3>Points acquis</h3>
          <ul>
            {correction.correct.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        {correction.partialPoints.length > 0 ? (
          <div>
            <h3>Points partiels</h3>
            <ul>
              {correction.partialPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {correction.missingElements.length > 0 ? (
          <div>
            <h3>Elements manquants</h3>
            <ul>
              {correction.missingElements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="correction-columns error-columns">
        <ErrorGroup title="Calcul" items={correction.calculationErrors} />
        <ErrorGroup title="Traitement comptable" items={correction.accountingTreatmentErrors} />
        <ErrorGroup title="Raisonnement" items={correction.reasoningErrors} />
        <ErrorGroup title="Sources" items={correction.sourceQualityIssues} />
        {correction.errors.length > 0 && structuredErrorCount === 0 ? (
          <div>
            <h3>A revoir</h3>
            <ul>
              {correction.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="remediation">
        <strong>Remediation</strong>
        <p>{correction.remediationPlan.microLesson}</p>
        <p>{correction.remediationPlan.nextAction}</p>
        {correction.remediationPlan.competencyTags.length > 0 ? (
          <div className="tag-cloud compact">
            {correction.remediationPlan.competencyTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>

      <details className="expected-answer">
        <summary>Reponse attendue</summary>
        <p>{correction.remediationPlan.expectedAnswer}</p>
      </details>

      <div>
        <span className="section-label">Preuves citees</span>
        <SourceReference sources={correction.sourceReferences} />
      </div>
    </section>
  );
}
