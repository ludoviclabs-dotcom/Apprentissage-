import Link from "next/link";
import { SourceReference } from "@/components/source-reference";
import { getKnowledgeModel } from "@/lib/view-model";

export default async function CoursPage() {
  const model = await getKnowledgeModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Cours</span>
          <h1>Lecons structurees autour de la logique</h1>
          <p>
            Chaque lecon expose concept, regle, raisonnement, exemple, erreur frequente et exercice lie.
          </p>
        </div>
        <Link href="/exercices" className="primary-action">
          Pratiquer
        </Link>
      </section>

      <div className="course-list">
        {model.lessons.map((lesson) => (
          <article key={lesson.id} className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">{lesson.domainId}</span>
                <h2>{lesson.title}</h2>
              </div>
              <Link className="secondary-action" href={`/exercices/${lesson.linkedExerciseId}`}>
                Exercice lie
              </Link>
            </div>
            <div className="logic-grid">
              <article>
                <span>Concept</span>
                <p>{lesson.concept}</p>
              </article>
              <article>
                <span>Regle</span>
                <p>{lesson.rule}</p>
              </article>
              <article>
                <span>Raisonnement</span>
                <p>{lesson.reasoning}</p>
              </article>
              <article>
                <span>Erreur frequente</span>
                <p>{lesson.frequentError}</p>
              </article>
            </div>
            <div className="expected-answer">
              <strong>Exemple</strong>
              <p>{lesson.example}</p>
            </div>
            <SourceReference sources={lesson.sourceReferences} />
          </article>
        ))}
      </div>
    </div>
  );
}
