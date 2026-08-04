import Link from "next/link";
import type { Lesson } from "@finance/domain";
import { DomainBadge } from "./domain-badge";
import { SourceReference } from "./source-reference";

export function LearningCard({
  lesson,
  /** Affiche la sortie vers l'exercice lié. Réservé aux écrans où la leçon est
      l'objet principal — l'accueil ne double pas son CTA « Continuer ». */
  showExerciseAction = false
}: {
  lesson: Lesson;
  showExerciseAction?: boolean;
}) {
  return (
    <section className="panel lesson-panel">
      <div className="panel-heading">
        <div>
          <DomainBadge domainId={lesson.domainId} />
          <h2>{lesson.title}</h2>
        </div>
      </div>

      <div className="logic-grid">
        <article className="logic-block logic-block--concept">
          <span>Concept</span>
          <p>{lesson.concept}</p>
        </article>
        <article className="logic-block logic-block--rule">
          <span>Règle</span>
          <p>{lesson.rule}</p>
        </article>
        <article className="logic-block logic-block--reasoning">
          <span>Raisonnement</span>
          <p>{lesson.reasoning}</p>
        </article>
        <article className="logic-block logic-block--example">
          <span>Exemple</span>
          <p>{lesson.example}</p>
        </article>
        <article className="logic-block logic-block--error">
          <span>Erreur fréquente</span>
          <p>{lesson.frequentError}</p>
        </article>
        <article className="logic-block logic-block--exercise">
          <span>Exercice lié</span>
          <p className="logic-block-id">{lesson.linkedExerciseId}</p>
          {showExerciseAction ? (
            <Link className="lesson-exercise-action" href={`/exercices/${lesson.linkedExerciseId}`}>
              Faire l&apos;exercice
            </Link>
          ) : null}
        </article>
      </div>

      <SourceReference sources={lesson.sourceReferences} />
    </section>
  );
}
