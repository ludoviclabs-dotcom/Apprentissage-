import type { Exercise } from "@finance/domain";
import { DomainBadge } from "./domain-badge";

export function ExercisePanel({ exercise }: { exercise: Exercise }) {
  return (
    <section className="panel exercise-panel">
      <div className="panel-heading">
        <div>
          <DomainBadge domainId={exercise.domainId} />
          <h2>{exercise.title}</h2>
        </div>
        <div className="module-meta">
          <span>{exercise.type}</span>
          <span>{exercise.estimatedMinutes} min</span>
        </div>
      </div>

      <p className="statement">{exercise.statement}</p>

      <div className="rubric-table">
        {exercise.rubric.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.points} pts</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
