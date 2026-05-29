import type { Correction } from "@finance/domain";
import { SourceReference } from "./source-reference";

export function CorrectionSummary({ correction }: { correction: Correction }) {
  return (
    <section className="panel correction-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">Dernière correction</span>
          <h2>Score {correction.score}/20</h2>
        </div>
      </div>

      <p>{correction.summary}</p>

      <div className="correction-columns">
        <div>
          <h3>Correct</h3>
          <ul>
            {correction.correct.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>À revoir</h3>
          <ul>
            {correction.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="remediation">
        <strong>Remédiation</strong>
        <p>{correction.remediation}</p>
      </div>

      <SourceReference sources={correction.sourceReferences} />
    </section>
  );
}
