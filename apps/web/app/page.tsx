import { CompetencyMap } from "@/components/competency-map";
import { CorrectionSummary } from "@/components/correction-summary";
import { DomainBadge } from "@/components/domain-badge";
import { ExercisePanel } from "@/components/exercise-panel";
import { LearningCard } from "@/components/learning-card";
import { ProgressMeter } from "@/components/progress-meter";
import { getDashboardModel } from "@/lib/view-model";
import { getDomain } from "@finance/domain";

export default function DashboardPage() {
  const model = getDashboardModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Tableau de bord</span>
          <h1>Remise à niveau pilotée par compétences</h1>
          <p>
            Aujourd'hui : jour {model.currentDay.day} sur {model.learningPath.durationDays}, avec une priorité
            sur la logique avant l'automatisme.
          </p>
        </div>
        <div className="hero-score">
          <span>Niveau global</span>
          <strong>{model.overallAverage}%</strong>
        </div>
      </section>

      <section className="domain-overview" aria-label="Niveau par domaine">
        {model.domains.map((domain) => (
          <article key={domain.id} className="domain-card">
            <div className="domain-card-title">
              <span style={{ backgroundColor: domain.softAccent, color: domain.accent }}>{domain.shortName}</span>
              <strong>{domain.average}%</strong>
            </div>
            <p>{domain.description}</p>
            <ProgressMeter value={domain.average} color={domain.accent} label={`Progression ${domain.name}`} />
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Priorités</span>
              <h2>À traiter cette semaine</h2>
            </div>
          </div>
          <div className="priority-list">
            {model.priorities.map((priority) => (
              <article key={priority.id} className="priority-row">
                <DomainBadge domainId={priority.domainId} />
                <div>
                  <strong>{priority.title}</strong>
                  <p>{priority.reason}</p>
                  <small>{priority.action}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Parcours 30 jours</span>
              <h2>{model.learningPath.name}</h2>
            </div>
          </div>
          <div className="timeline-list">
            {model.learningPath.days.map((day) => {
              const domain = getDomain(day.domainId);

              return (
                <article key={day.day} className={`timeline-row ${day.status}`}>
                  <span style={{ borderColor: domain.accent }}>{day.day}</span>
                  <div>
                    <strong>{day.title}</strong>
                    <small>
                      {domain.shortName} · {day.minutes} min · {day.status}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <div className="two-column">
        <LearningCard lesson={model.currentLesson} />
        <ExercisePanel exercise={model.currentExercise} />
      </div>

      <div className="two-column align-start">
        <CorrectionSummary correction={model.latestCorrection} />
        <CompetencyMap competencies={model.weakestCompetencies} />
      </div>
    </div>
  );
}
