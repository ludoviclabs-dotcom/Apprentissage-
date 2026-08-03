import type { Metadata } from "next";
import { ExamSessionForm } from "@/components/forms/exam-session-form";
import { getFeatures } from "@/lib/features";
import { statusLabel } from "@/lib/status-labels";
import { getExamModel } from "@/lib/view-model";

export const metadata: Metadata = {
  title: "Annales & concours — S'entraîner",
  description: "Annales blanches et examens courts construits à partir du corpus."
};

export default async function AnnalesConcoursPage() {
  const model = await getExamModel();
  const features = getFeatures();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Annales & Concours</span>
          <h1>Annales blanches et examens courts</h1>
          <p>
            Des sessions construites à partir du corpus : QCM, calcul, écriture, justification et mini-cas, pour
            vérifier le choix de méthode et pas seulement la mémoire immédiate. La durée affichée est indicative :
            le chronomètre n'est pas encore implémenté.
          </p>
        </div>
        <div className="hero-score">
          <span>Sessions</span>
          <strong>{model.examSessions.length}</strong>
        </div>
      </section>

      {model.examSessions.map((exam) => (
        <section key={exam.id} className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">
                {exam.durationMinutes} min · {exam.exerciseIds.length} exercices
              </span>
              <h2>{exam.title}</h2>
            </div>
            <span className="state-token processing">{statusLabel(exam.status)}</span>
          </div>
          <ExamSessionForm
            exam={exam}
            exercises={model.exercises}
            writes={features.writes}
            persistence={features.persistence}
          />
        </section>
      ))}

      <section className="exercise-type-grid">
        {model.exercises.slice(0, 8).map((exercise) => (
          <article key={exercise.id} className="panel">
            <span className="section-label">{exercise.type}</span>
            <h2>{exercise.title}</h2>
            <p>{exercise.statement}</p>
            <span className="time-chip">{exercise.estimatedMinutes} min</span>
          </article>
        ))}
      </section>
    </div>
  );
}
