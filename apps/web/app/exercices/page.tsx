import type { Metadata } from "next";
import { ExercisePanel } from "@/components/exercise-panel";
import { DomainBadge } from "@/components/domain-badge";
import { AnyExerciseForm } from "@/components/forms/any-exercise-form";
import { PageHeader } from "@/components/ui/page-header";
import { DISCOVERY_SESSION_SUMMARY } from "@/lib/discovery-session";
import { getExercises } from "@finance/db";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Exercices — S'entraîner",
  description: "S'entraîner avec barème affiché, compétence cible et correction structurée."
};

export default async function ExercisesPage() {
  const exercises = await getExercises();
  const firstExercise = exercises[0];

  return (
    <div className="page-stack">
      <PageHeader
        label="Exercices"
        title="S'entraîner avec barème et compétence cible"
        description="Le MVP affiche les exercices seedés ; la génération IA gardera ce format structuré."
      />

      {/* Ce bloc portait un bouton désactivé et un badge « Bientôt disponible ».
          Une action principale visible doit mener quelque part : elle mène
          maintenant à une session réelle. */}
      <section className="generator-panel">
        <div>
          <span className="section-label">Commencer</span>
          <h2>Session découverte</h2>
          <p>{DISCOVERY_SESSION_SUMMARY}</p>
        </div>
        <Link className="primary-action inline-link" href="/exercices/session-decouverte">
          Lancer la session découverte
        </Link>
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

      {firstExercise ? <AnyExerciseForm exercise={firstExercise} /> : null}

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
