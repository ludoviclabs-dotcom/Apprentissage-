import Link from "next/link";
import { LevelTrack } from "@/components/level-track";
import { SourceReference } from "@/components/source-reference";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COMPTA_MODULE_BASE, getComptaModuleModel } from "@/lib/compta-module";
import { comptaGeneraleV1Sources } from "@finance/domain";

/**
 * The module's front door.
 *
 * Levels, their gating and their scores are rendered by the PR-02 `LevelTrack`
 * component rather than by a second implementation: the unlock decision is taken
 * server-side by `evaluateTrack`, and a page that decided it again in the browser
 * could show a level as open that the server would refuse.
 */
export default async function ComptaGeneraleModulePage() {
  const user = await getCurrentUser();
  const model = await getComptaModuleModel(user?.id);
  const totalExercises = [...model.exercisesByLevel.values()].reduce(
    (sum, list) => sum + list.length,
    0
  );

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Module</span>
          <h1>Comptabilité générale — parcours v1</h1>
          <p>
            Le cycle complet d'une facture, de l'achat au règlement : {totalExercises} exercices
            corrigés automatiquement, un journal interactif et un mini-cas de fin de mois.
          </p>
        </div>
        <div
          className="hero-score"
          data-canonical-track="track-compta-generale-v1"
          data-canonical-score={model.score ?? "neutral"}
        >
          <span>{model.score === null ? "Exemple de parcours" : "Progression"}</span>
          <strong>{model.score === null ? "État neutre" : `${Math.round(model.score)}%`}</strong>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Niveaux</span>
          <strong>{model.levels.length}</strong>
        </article>
        <article>
          <span>Exercices</span>
          <strong>{totalExercises}</strong>
        </article>
        <article>
          <span>Étapes du cas</span>
          <strong>{model.miniCase.steps.length}</strong>
        </article>
        <article>
          <span>Seuil</span>
          <strong>{model.passingScore}%</strong>
        </article>
      </section>

      {model.progressionTracked ? null : (
        <p className="muted">
          Progression non suivie : connecte-toi avec une base active pour que chaque exercice corrigé
          alimente le niveau. Les exercices restent corrigés et notés.
        </p>
      )}

      <LevelTrack
        levels={model.levels}
        snapshots={model.snapshots}
        passingScore={model.passingScore}
        rulesLabel={model.rulesLabel}
      />

      <section className="course-list">
        {model.levels.map((level) => {
          const exercises = model.exercisesByLevel.get(level.id) ?? [];
          const state = model.levelStates.find((candidate) => candidate.definition.id === level.id);

          return (
            <article key={level.id} className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-label">Niveau {level.level}</span>
                  <h2>{level.title}</h2>
                  <p>{level.objective}</p>
                </div>
                {state?.href ? (
                  <Link className="primary-action" href={state.href}>
                    Ouvrir le niveau {level.level}
                  </Link>
                ) : (
                  <span className="secondary-action" aria-disabled="true">
                    Niveau verrouillé
                  </span>
                )}
              </div>
              <div className="module-meta">
                <span>{exercises.length} exercices</span>
                <span>{level.estimatedMinutes} min</span>
                {level.criticalCompetencyIds.map((competencyId) => (
                  <span key={competencyId}>Critique : {competencyId}</span>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Mini-cas</span>
            <h2>{model.miniCase.title}</h2>
            <p>{model.miniCase.context}</p>
          </div>
          <Link className="primary-action" href={`${COMPTA_MODULE_BASE}/cas-pratique`}>
            Ouvrir le cas
          </Link>
        </div>
        <SourceReference sources={comptaGeneraleV1Sources} />
      </section>
    </div>
  );
}
