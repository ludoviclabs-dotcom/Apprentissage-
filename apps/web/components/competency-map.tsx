import type { Competency } from "@finance/domain";
import type { CSSProperties } from "react";
import { getCompetencyStatusLabel, getDomain } from "@finance/domain";
import { DomainBadge } from "./domain-badge";
import { ProgressMeter } from "./progress-meter";

function treeState(strength: number) {
  if (strength >= 75) {
    return "strong";
  }

  if (strength >= 55) {
    return "ok";
  }

  if (strength >= 30) {
    return "fragile";
  }

  return "blocked";
}

export function CompetencyMap({ competencies }: { competencies: Competency[] }) {
  return (
    <section className="panel skill-tree-panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">Mini skill tree</span>
          <h2>Ou progresser maintenant</h2>
        </div>
      </div>

      <div className="skill-tree">
        {competencies.map((competency, index) => {
          const domain = getDomain(competency.domainId);
          const state = treeState(competency.strength);

          return (
            <article
              key={competency.id}
              className={`skill-node ${state}`}
              style={{ "--skill-color": domain.accent } as CSSProperties}
            >
              <span className="skill-node-index">{index + 1}</span>
              <div>
                <div className="skill-node-title">
                  <DomainBadge domainId={competency.domainId} />
                  <strong>{competency.name}</strong>
                </div>
                <p>{competency.focus}</p>
                <small>{getCompetencyStatusLabel(competency.status)}</small>
                <ProgressMeter value={competency.strength} color={domain.accent} label={competency.name} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
