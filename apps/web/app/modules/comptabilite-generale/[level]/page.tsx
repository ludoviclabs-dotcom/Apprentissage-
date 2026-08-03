import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  COMPTA_MODULE_BASE,
  getComptaModuleModel,
  parseLevelParam
} from "@/lib/compta-module";

const KIND_LABEL: Record<string, string> = {
  journal_entry: "Écriture au journal",
  numeric: "Calcul",
  multiple_choice: "QCM",
  text: "Rédaction"
};

export default async function ComptaGeneraleLevelPage({
  params
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: rawLevel } = await params;
  const position = parseLevelParam(rawLevel);
  const user = await getCurrentUser();
  const model = await getComptaModuleModel(user?.id);
  const levelState =
    position === null
      ? null
      : model.levelStates.find((candidate) => candidate.definition.level === position) ?? null;

  if (!levelState?.canOpen) {
    notFound();
  }

  const level = levelState.definition;
  const exercises = model.exercisesByLevel.get(level.id) ?? [];
  const snapshot = levelState.snapshot;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Niveau {level.level}</span>
          <h1>{level.title}</h1>
          <p>{level.objective}</p>
        </div>
        <div className="hero-score">
          <span>Score</span>
          <strong>{user ? `${Math.round(snapshot.score)}%` : "Exemple"}</strong>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Exercices</span>
          <strong>{exercises.length}</strong>
        </article>
        <article>
          <span>Durée</span>
          <strong>{level.estimatedMinutes} min</strong>
        </article>
        <article>
          <span>État</span>
          <strong>{snapshot.status}</strong>
        </article>
        <article>
          <span>Seuil</span>
          <strong>{model.passingScore}%</strong>
        </article>
      </section>

      <section className="course-list">
        {exercises.map((view) => (
          <article key={view.exercise.id} className="panel" data-exercise-id={view.exercise.id}>
            <div className="panel-heading">
              <div>
                <span className="section-label">{KIND_LABEL[view.kind] ?? view.kind}</span>
                <h2>{view.exercise.title}</h2>
                <p>{view.exercise.estimatedMinutes} minutes</p>
              </div>
              {!user && view.exercise.id !== "ex-cgv1-achat-marchandises" ? (
                <span className="secondary-action" aria-disabled="true">
                  Réservé après inscription
                </span>
              ) : (
                <Link className="primary-action" href={view.href}>
                  Faire l'exercice
                </Link>
              )}
            </div>
            <div className="module-meta">
              {view.exercise.competencyIds.map((competencyId) => (
                <span key={competencyId}>{competencyId}</span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Suite</span>
            <h2>Mettre les écritures bout à bout</h2>
            <p>Le mini-cas reprend ces opérations sur un mois complet, pièces à l'appui.</p>
          </div>
          <Link className="primary-action" href={`${COMPTA_MODULE_BASE}/cas-pratique`}>
            Ouvrir le mini-cas
          </Link>
        </div>
      </section>
    </div>
  );
}
