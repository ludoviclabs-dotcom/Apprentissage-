import { ExamSessionForm } from "@/components/forms/exam-session-form";
import { getExamModel } from "@/lib/view-model";

export default async function AnnalesConcoursPage() {
  const model = await getExamModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Annales & Concours</span>
          <h1>Annales blanches et examens courts</h1>
          <p>
            Des sessions chronométrées construites à partir du corpus : QCM, calcul, écriture, justification et
            mini-cas, pour vérifier le choix de méthode et pas seulement la mémoire immédiate.
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
            <span className="state-token processing">{exam.status}</span>
          </div>
          <ExamSessionForm exam={exam} exercises={model.exercises} />
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
