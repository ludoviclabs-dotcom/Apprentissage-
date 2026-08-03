import type { Metadata } from "next";
import { CompetencyMap } from "@/components/competency-map";
import { DomainBadge } from "@/components/domain-badge";
import { ProgressMeter } from "@/components/progress-meter";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel } from "@/lib/status-labels";
import { getProgressModel } from "@/lib/view-model";
import { getDomainAverage, getWeakestCompetencies } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Progression — Compétences",
  description:
    "Maîtrise par compétence : notions fragiles, badges attribués dans le temps et analyse des erreurs."
};

export default async function ProgressionPage() {
  const user = await getCurrentUser();
  const model = await getProgressModel(user?.id);
  const weakest = getWeakestCompetencies(model.competencies, 6);

  return (
    <div className="page-stack">
      <PageHeader
        label="Progression"
        title="Maîtrise par compétence, pas score global opaque"
        description="La progression met en avant les notions fragiles, les erreurs récurrentes et la prochaine action utile."
        aside={
          <div className="hero-score">
            <span>Erreurs</span>
            <strong>{model.errorJournal.length}</strong>
          </div>
        }
      />

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
        <section className="panel" id="badges">
          <span className="section-label">Badges de maîtrise</span>
          <h2>Attribués seulement dans le temps</h2>
          <div className="priority-list">
            {model.competencies
              .filter((competency) => competency.status === "mastered" || competency.strength >= 75)
              .map((competency) => (
                <article key={competency.id} className="priority-row">
                  <DomainBadge domainId={competency.domainId} />
                  <div>
                    <strong>{competency.name}</strong>
                    <p>{competency.focus}</p>
                    <small>{competency.strength}% · {statusLabel(competency.status)}</small>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <span className="section-label">Analyse des erreurs</span>
        <h2>Actions recommandées</h2>
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
