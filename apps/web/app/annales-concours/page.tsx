import { ExamSessionForm } from "@/components/forms/exam-session-form";
import { getExamModel } from "@/lib/view-model";

export default async function AnnalesConcoursPage() {
  const model = await getExamModel();
  const exam = model.examSessions[0];

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Annales & Concours</span>
          <h1>Mode examen court et reprise des erreurs</h1>
          <p>
            Le MVP propose une session chronometree courte. Les overlays DCG, DSCG, CFA ou concours restent a
            preciser quand la cible exacte sera fixee.
          </p>
        </div>
        <div className="hero-score">
          <span>Duree</span>
          <strong>{exam.durationMinutes}m</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Session pilote</span>
            <h2>{exam.title}</h2>
          </div>
          <span className="state-token processing">{exam.status}</span>
        </div>
        <p>
          La session melange QCM, calcul, ecriture, justification et mini-cas pour verifier le choix de methode,
          pas seulement la memoire immediate.
        </p>
        <ExamSessionForm exam={exam} exercises={model.exercises} />
      </section>

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
