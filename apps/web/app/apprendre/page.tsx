import { LearningCard } from "@/components/learning-card";
import { DomainBadge } from "@/components/domain-badge";
import { DiagnosticForm } from "@/components/forms/diagnostic-form";
import { SourceSearchForm } from "@/components/forms/source-search-form";
import { TutorAskForm } from "@/components/forms/tutor-ask-form";
import { getLearningModel } from "@/lib/view-model";
import { getDomain } from "@finance/domain";

export default async function LearnPage() {
  const { learningPath, currentDay, lessons } = await getLearningModel();
  const currentLesson = lessons.find((lesson) => lesson.id === currentDay?.lessonId) ?? lessons[0];

  if (!currentDay || !currentLesson) {
    return null;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Apprendre</span>
          <h1>Comprendre la logique avant de répondre</h1>
          <p>Chaque notion est découpée en concept, règle, raisonnement, exemple, erreur fréquente et exercice lié.</p>
        </div>
      </section>

      <section className="panel focus-panel">
        <div>
          <DomainBadge domainId={currentDay.domainId} />
          <h2>Jour {currentDay.day} · {currentDay.title}</h2>
          <p>{learningPath.goal}</p>
        </div>
        <strong>{currentDay.minutes} min</strong>
      </section>

      <LearningCard lesson={currentLesson} />

      <DiagnosticForm />

      <TutorAskForm />

      <SourceSearchForm />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Séquence</span>
            <h2>Prochains jalons</h2>
          </div>
        </div>
        <div className="learning-days">
          {learningPath.days.map((day) => {
            const domain = getDomain(day.domainId);

            return (
              <article key={day.day} className={`learning-day ${day.status}`}>
                <span style={{ color: domain.accent }}>Jour {day.day}</span>
                <strong>{day.title}</strong>
                <small>{domain.shortName} · {day.minutes} min</small>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
