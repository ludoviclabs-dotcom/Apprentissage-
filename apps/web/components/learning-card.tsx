import type { Lesson } from "@finance/domain";
import { DomainBadge } from "./domain-badge";
import { SourceReference } from "./source-reference";

export function LearningCard({ lesson }: { lesson: Lesson }) {
  return (
    <section className="panel lesson-panel">
      <div className="panel-heading">
        <div>
          <DomainBadge domainId={lesson.domainId} />
          <h2>{lesson.title}</h2>
        </div>
      </div>

      <div className="logic-grid">
        <article>
          <span>Concept</span>
          <p>{lesson.concept}</p>
        </article>
        <article>
          <span>Règle</span>
          <p>{lesson.rule}</p>
        </article>
        <article>
          <span>Raisonnement</span>
          <p>{lesson.reasoning}</p>
        </article>
        <article>
          <span>Exemple</span>
          <p>{lesson.example}</p>
        </article>
        <article>
          <span>Erreur fréquente</span>
          <p>{lesson.frequentError}</p>
        </article>
        <article>
          <span>Exercice lié</span>
          <p>{lesson.linkedExerciseId}</p>
        </article>
      </div>

      <SourceReference sources={lesson.sourceReferences} />
    </section>
  );
}
