import type { Metadata } from "next";
import { CompetencyMap } from "@/components/competency-map";
import { DomainBadge } from "@/components/domain-badge";
import { ProgressMeter } from "@/components/progress-meter";
import { PageHeader } from "@/components/ui/page-header";
import { statusLabel } from "@/lib/status-labels";
import { getProgressModel } from "@/lib/view-model";
import { getWeakestCompetencies } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";

export const metadata: Metadata = {
  title: "Progression — Compétences",
  description:
    "Maîtrise par compétence : notions fragiles, badges attribués dans le temps et analyse des erreurs."
};

export default async function ProgressionPage() {
  const user = await getCurrentUser();
  const [model, progression] = await Promise.all([
    getProgressModel(user?.id),
    getCanonicalLearningProgression(user?.id)
  ]);
  const weakest = getWeakestCompetencies(model.competencies, 6);

  return (
    <div className="page-stack">
      <PageHeader
        label="Progression"
        title="Maîtrise par compétence, pas score global opaque"
        description="La progression met en avant les notions fragiles, les erreurs récurrentes et la prochaine action utile."
        aside={
          <div className="hero-score">
            <span>{user ? "Erreurs" : "Mode"}</span>
            <strong>{user ? model.errorJournal.length : "Neutre"}</strong>
          </div>
        }
      />

      <section className="domain-overview">
        {progression.tracks.map((track) => (
          <article
            key={track.track.trackId}
            className="domain-card"
            data-canonical-track={track.track.trackId}
            data-canonical-score={track.score ?? "neutral"}
          >
            <div className="domain-card-title">
              <span>{track.track.title}</span>
              <strong>{track.score === null ? "État neutre" : `${Math.round(track.score)}%`}</strong>
            </div>
            <p>{track.nextAction?.title ?? "Tous les niveaux publiés sont acquis."}</p>
            {track.score === null ? (
              <p className="muted">Aucun score personnel en mode démonstration.</p>
            ) : (
              <ProgressMeter value={track.score} label={`Progression ${track.track.title}`} />
            )}
          </article>
        ))}
      </section>

      {user ? <div className="two-column align-start">
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
      </div> : (
        <section className="panel">
          <span className="section-label">Exemple de parcours</span>
          <h2>Aucune maîtrise personnelle simulée</h2>
          <p className="muted">
            Connecte-toi puis soumets un exercice corrigé pour créer tes propres preuves de progression.
          </p>
        </section>
      )}

      {user ? <section className="panel">
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
      </section> : null}
    </div>
  );
}
