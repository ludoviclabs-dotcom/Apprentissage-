import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { getDomain, type Correction } from "@finance/domain";
import { ExerciseCard } from "@/components/exercise-card";
import { AnyExerciseForm } from "@/components/forms/any-exercise-form";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DISCOVERY_SESSION_SUMMARY } from "@/lib/discovery-session";
import { getExerciseModel } from "@/lib/view-model";

export const metadata: Metadata = {
  title: "Exercices — S'entraîner",
  description: "S'entraîner avec barème affiché, compétence cible et correction structurée."
};

/**
 * Le catalogue d'exercices.
 *
 * Les scores affichés sur les cartes proviennent de l'historique de corrections
 * du compte connecté, et de lui seul. Sans compte, `getCorrectionHistory`
 * renvoie le jeu seedé : le lire ici ferait dire à la page « tu as eu 16/20 » à
 * quelqu'un qui vient d'arriver.
 */
function lastScoreByExercise(corrections: Correction[]): Map<string, number> {
  const scores = new Map<string, number>();

  // `getCorrectionHistory` trie du plus récent au plus ancien : la première
  // occurrence rencontrée pour un exercice est donc la dernière tentative.
  for (const correction of corrections) {
    if (!scores.has(correction.exerciseId)) {
      scores.set(correction.exerciseId, correction.score);
    }
  }

  return scores;
}

export default async function ExercisesPage() {
  const user = await getCurrentUser();
  const model = await getExerciseModel(user?.id);
  const { exercises } = model;
  const firstExercise = exercises[0];
  const scores = user ? lastScoreByExercise(model.corrections) : null;

  // Une compétence par pastille, dédoublonnée, avec l'accent de son domaine.
  const competencies = new Map<string, string>();

  for (const exercise of exercises) {
    for (const competencyId of exercise.competencyIds) {
      if (!competencies.has(competencyId)) {
        competencies.set(competencyId, getDomain(exercise.domainId).accent);
      }
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        label="Exercices"
        title="S'entraîner avec barème et compétence cible"
        description="Chaque exercice affiche son barème, la compétence qu'il cible et une correction structurée."
      />

      <section className="cta-panel">
        <div>
          <span className="section-label">Commencer</span>
          <h2>Session découverte</h2>
          <p>
            Des exercices guidés, corrigés à la volée : QCM, calcul, écriture au journal et
            justification rédigée. Aucune donnée enregistrée.
          </p>
        </div>
        <div className="cta-panel-action">
          <Link className="primary-action action-lg inline-link" href="/exercices/session-decouverte">
            Lancer la session découverte
          </Link>
          {/* Le décompte et la durée viennent de la session elle-même : la
              maquette annonçait « 3 exercices » alors que la session en sert
              cinq, et deux chiffres pour une même chose finissent toujours par
              diverger. */}
          <span className="cta-panel-meta">{DISCOVERY_SESSION_SUMMARY}</span>
        </div>
      </section>

      <section className="exercise-grid" aria-label="Catalogue d'exercices">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            lastScore={scores?.get(exercise.id)}
          />
        ))}
      </section>

      {firstExercise ? <AnyExerciseForm exercise={firstExercise} /> : null}

      <section className="panel competency-panel">
        <div>
          <span className="section-label">Compétences ciblées</span>
          <h2>Chaque exercice indique pourquoi il existe</h2>
        </div>
        <div className="competency-chips">
          {[...competencies].map(([competencyId, accent]) => (
            <span key={competencyId}>
              <span
                className="competency-dot"
                style={{ "--competency-color": accent } as CSSProperties}
                aria-hidden="true"
              />
              {competencyId}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
