import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { EXCEL_LAB_BASE, getExcelLabModel, getLabLevel, parseLevelParam } from "@/lib/excel-lab";

export default async function ExcelLabLevelPage({
  params
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: rawLevel } = await params;
  const position = parseLevelParam(rawLevel);
  const level = position === null ? null : getLabLevel(position);

  if (!level) {
    notFound();
  }

  const user = await getCurrentUser();
  const model = await getExcelLabModel(user?.id);
  const exercises = model.exercisesByLevel.get(level.id) ?? [];
  const snapshot = model.snapshots.find((item) => item.levelId === level.id);

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
          <strong>{Math.round(snapshot?.score ?? 0)}%</strong>
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
          <strong>{snapshot?.status ?? "à commencer"}</strong>
        </article>
        <article>
          <span>Seuil</span>
          <strong>{model.passingScore}%</strong>
        </article>
      </section>

      <section className="course-list">
        {exercises.map((definition) => (
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
              <Link
                className="primary-action"
                href={`${EXCEL_LAB_BASE}/exercices/${definition.exercise.id}`}
              >
                Ouvrir l'exercice
              </Link>
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
