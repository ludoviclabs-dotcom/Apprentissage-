import { CompetencyMap } from "@/components/competency-map";
import { DomainBadge } from "@/components/domain-badge";
import { ProgressMeter } from "@/components/progress-meter";
import { getProgressModel } from "@/lib/view-model";
import { getDomainAverage, getWeakestCompetencies } from "@finance/domain";

export default async function ProgressionPage() {
  const model = await getProgressModel();
  const weakest = getWeakestCompetencies(model.competencies, 6);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Progression</span>
          <h1>Maitrise par competence, pas score global opaque</h1>
          <p>
            La progression met en avant les notions fragiles, les erreurs recurrentes et la prochaine action utile.
          </p>
        </div>
        <div className="hero-score">
          <span>Erreurs</span>
          <strong>{model.errorJournal.length}</strong>
        </div>
      </section>

      <section className="domain-overview">
        {model.domains.map((domain) => {
          const average = getDomainAverage(domain.id, model.competencies);

          return (
            <article key={domain.id} className="domain-card">
              <div className="domain-card-title">
                <span style={{ backgroundColor: domain.softAccent, color: domain.accent }}>{domain.shortName}</span>
                <strong>{average}%</strong>
              </div>
              <p>{domain.description}</p>
              <ProgressMeter value={average} color={domain.accent} label={`Progression ${domain.name}`} />
            </article>
          );
        })}
      </section>

      <div className="two-column align-start">
        <CompetencyMap competencies={weakest} />
        <section className="panel">
          <span className="section-label">Badges de maitrise</span>
          <h2>Attribues seulement dans le temps</h2>
          <div className="priority-list">
            {model.competencies
              .filter((competency) => competency.status === "mastered" || competency.strength >= 75)
              .map((competency) => (
                <article key={competency.id} className="priority-row">
                  <DomainBadge domainId={competency.domainId} />
                  <div>
                    <strong>{competency.name}</strong>
                    <p>{competency.focus}</p>
                    <small>{competency.strength}% - statut {competency.status}</small>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <span className="section-label">Analyse des erreurs</span>
        <h2>Actions recommandees</h2>
        <div className="priority-list">
          {model.errorJournal.map((entry) => (
            <article key={entry.id} className="priority-row">
              <span className="state-token needs-review">{entry.category}</span>
              <div>
                <strong>{entry.summary}</strong>
                <p>{entry.nextAction}</p>
                <small>{entry.createdAt.slice(0, 10)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
