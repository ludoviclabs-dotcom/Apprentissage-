import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceReference } from "@/components/source-reference";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { getFeatures } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExerciseAccess } from "@/lib/learning-progression";
import { COMPTA_MODULE_BASE, getModuleExercise } from "@/lib/compta-module";
import { comptaGeneraleV1Sources } from "@finance/domain";

/**
 * One module exercise.
 *
 * The expected answer is not rendered. It is the correction's job to show it
 * once an attempt has been marked — printing it beside the statement would make
 * the exercise a reading comprehension test, the same failure the review screen
 * fixed in PR-04.
 */
export default async function ComptaGeneraleExercisePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = getModuleExercise(id);

  if (!view) {
    notFound();
  }

  const user = await getCurrentUser();
  const levelAccess = await getExerciseAccess({ userId: user?.id, exerciseId: id });

  if (!levelAccess.allowed) {
    notFound();
  }

  const features = getFeatures();
  const { exercise } = view;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Comptabilité générale · niveau {exercise.level}</span>
          <h1>{exercise.title}</h1>
          <p>{exercise.estimatedMinutes} minutes · correction déterministe</p>
        </div>
        <Link className="secondary-action" href={`${COMPTA_MODULE_BASE}/${exercise.level}`}>
          Retour au niveau
        </Link>
      </section>

      <section className="panel">
        <span className="section-label">Énoncé</span>
        {exercise.statement.split("\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <div className="module-meta">
          {exercise.competencyIds.map((competencyId) => (
            <span key={competencyId}>{competencyId}</span>
          ))}
        </div>
      </section>

      <ModuleExerciseForm
        exerciseId={exercise.id}
        kind={view.kind}
        options={view.options}
        persistence={features.persistence}
      />

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={comptaGeneraleV1Sources} />
      </section>
    </div>
  );
}
