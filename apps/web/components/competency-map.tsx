import type { Competency } from "@finance/domain";
import { getCompetencyStatusLabel, getDomain } from "@finance/domain";
import { ProgressMeter } from "./progress-meter";

export function CompetencyMap({ competencies }: { competencies: Competency[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">Carte des compétences</span>
          <h2>Lacunes à traiter</h2>
        </div>
      </div>

      <div className="competency-list">
        {competencies.map((competency) => {
          const domain = getDomain(competency.domainId);

          return (
            <article key={competency.id} className="competency-row">
              <div>
                <strong>{competency.name}</strong>
                <span>{domain.shortName} · {getCompetencyStatusLabel(competency.status)}</span>
              </div>
              <ProgressMeter value={competency.strength} color={domain.accent} label={competency.name} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
