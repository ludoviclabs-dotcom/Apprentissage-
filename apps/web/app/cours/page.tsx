import type { Metadata } from "next";
import Link from "next/link";
import { SourceReference } from "@/components/source-reference";
import { getKnowledgeModel } from "@/lib/view-model";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Cours — Apprendre",
  description: "Leçons structurées : concept, règle, raisonnement, exemple et erreur fréquente."
};

export default async function CoursPage() {
  const user = await getCurrentUser();
  const model = await getKnowledgeModel(user?.id);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Cours</span>
          <h1>Leçons structurées autour de la logique</h1>
          <p>
            Chaque leçon expose concept, règle, raisonnement, exemple, erreur fréquente et exercice lié.
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
                Exercice lié
              </Link>
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
                <span>Erreur fréquente</span>
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
