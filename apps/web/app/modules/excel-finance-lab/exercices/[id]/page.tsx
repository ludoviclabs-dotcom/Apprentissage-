import Link from "next/link";
import { notFound } from "next/navigation";
import { PaywallNotice } from "@/components/paywall-notice";
import { SourceReference } from "@/components/source-reference";
import { LabExerciseForm } from "@/components/forms/lab-exercise-form";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import { getFeatures } from "@/lib/features";
import { EXCEL_LAB_BASE, getLabExercise, nextLabExercise } from "@/lib/excel-lab";
import { excelLabSources } from "@finance/domain";

/**
 * One lab exercise.
 *
 * The expected answer is not rendered — the correction shows it once an attempt
 * has been marked. Printing the figure beside a grid that asks for it would make
 * the exercise a copying test, the failure PR-04 and PR-05 each had to fix on
 * their own screens.
 */
export default async function ExcelLabExercisePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const definition = getLabExercise(id);

  if (!definition) {
    notFound();
  }

  const features = getFeatures();
  const access = await resolveEntitlement("excel-finance-lab");
  const { exercise } = definition;
  const next = nextLabExercise(exercise.id);

  // The statement itself is withheld, not just the answer form. A locked
  // exercise that still prints its énoncé and its grid has given away the
  // thing being sold and only taken back the marking.
  if (!access.allowed) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Excel Finance Lab · niveau {exercise.level}</span>
            <h1>{exercise.title}</h1>
            <p>{exercise.estimatedMinutes} minutes</p>
          </div>
          <Link className="secondary-action" href={EXCEL_LAB_BASE}>
            Retour au lab
          </Link>
        </section>
        <PaywallNotice
          reason={access.reason}
          feature={access.feature}
          moduleLabel="Excel Finance Lab"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Excel Finance Lab · niveau {exercise.level}</span>
          <h1>{exercise.title}</h1>
          <p>
            {exercise.estimatedMinutes} minutes · jeu de données {definition.datasetId}
          </p>
        </div>
        <Link className="secondary-action" href={`${EXCEL_LAB_BASE}/${exercise.level}`}>
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

      <LabExerciseForm
        exerciseId={exercise.id}
        grid={definition.grid}
        persistence={features.persistence}
        nextHref={next ? `${EXCEL_LAB_BASE}/exercices/${next.exercise.id}` : undefined}
      />

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={excelLabSources} />
      </section>
    </div>
  );
}
