import Link from "next/link";
import { notFound } from "next/navigation";
import { PaywallNotice } from "@/components/paywall-notice";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import { EXCEL_LAB_BASE, getExcelLabModel, parseLevelParam } from "@/lib/excel-lab";

export default async function ExcelLabLevelPage({
  params
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: rawLevel } = await params;
  const position = parseLevelParam(rawLevel);
  const user = await getCurrentUser();
  const access = await resolveEntitlement("excel-finance-lab");
  const model = await getExcelLabModel(user?.id);
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
          <span className="section-label">Excel Finance Lab · niveau {level.level}</span>
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

      {access.allowed ? null : (
        <PaywallNotice reason={access.reason} feature={access.feature} moduleLabel="Excel Finance Lab" />
      )}

      <section className="course-list">
        {(access.allowed ? exercises : []).map((definition) => (
          <article
            key={definition.exercise.id}
            className="panel"
            data-exercise-id={definition.exercise.id}
          >
            <div className="panel-heading">
              <div>
                <span className="section-label">{definition.datasetId}</span>
                <h2>{definition.exercise.title}</h2>
                <p>{definition.exercise.estimatedMinutes} minutes</p>
              </div>
              {!user && definition.exercise.id !== "ex-xl-chiffre-affaires" ? (
                <span className="secondary-action" aria-disabled="true">
                  Réservé après inscription
                </span>
              ) : (
                <Link
                  className="primary-action"
                  href={`${EXCEL_LAB_BASE}/exercices/${definition.exercise.id}`}
                >
                  Ouvrir l'exercice
                </Link>
              )}
            </div>
            <div className="module-meta">
              {definition.exercise.competencyIds.map((competencyId) => (
                <span key={competencyId}>{competencyId}</span>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
