import { ExercisePanel } from "@/components/exercise-panel";
import { DomainBadge } from "@/components/domain-badge";
import { ExerciseAttemptForm } from "@/components/forms/exercise-attempt-form";
import { getExerciseModel } from "@/lib/view-model";
import Link from "next/link";

export default function ExercisesPage() {
  const { exercises } = getExerciseModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Exercices</span>
          <h1>S'entraîner avec barème et compétence cible</h1>
          <p>Le MVP affiche les exercices seedés ; la génération IA gardera ce format structuré.</p>
        </div>
      </section>

      <section className="generator-panel">
        <div>
          <span className="section-label">Générer</span>
          <h2>Session recommandée</h2>
          <p>5 QCM, 1 cas pratique, 1 correction guidée, 1 fiche de remédiation.</p>
        </div>
        <button type="button" className="primary-action">Préparer la session</button>
      </section>

      <div className="two-column">
        {exercises.map((exercise) => (
          <div key={exercise.id} className="linked-panel">
            <ExercisePanel exercise={exercise} />
            <Link href={`/exercices/${exercise.id}`} className="secondary-action inline-link">
              Ouvrir le détail
            </Link>
          </div>
        ))}
      </div>

      <ExerciseAttemptForm exercise={exercises[0]} />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Compétences ciblées</span>
            <h2>Chaque exercice indique pourquoi il existe</h2>
          </div>
        </div>
        <div className="tag-cloud">
          {exercises.flatMap((exercise) =>
            exercise.competencyIds.map((competencyId) => (
              <span key={`${exercise.id}-${competencyId}`}>
                <DomainBadge domainId={exercise.domainId} />
                {competencyId}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
