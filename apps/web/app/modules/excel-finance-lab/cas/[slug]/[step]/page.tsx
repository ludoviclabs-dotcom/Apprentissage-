import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkbookDraft } from "@finance/db";
import { FormulaExerciseForm } from "@/components/forms/formula-exercise-form";
import { LabExerciseForm } from "@/components/forms/lab-exercise-form";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { PaywallNotice } from "@/components/paywall-notice";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import { getFeatures } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExerciseAccess } from "@/lib/learning-progression";
import { excelCaseHref, getExcelCaseStep, parseLevelParam } from "@/lib/excel-lab";
import { choiceOptions } from "@/lib/typed-exercise";

/**
 * Une étape d'un case study Excel : la pièce à gauche, le travail à droite.
 *
 * Même architecture que les cas compta de PR-12a : l'étape EST un exercice du
 * niveau — même id, même spécification, même évaluateur — soumis avec
 * `activityContext: "case_study"` pour alimenter la composante caseStudy de la
 * progression. La dernière étape est le diagnostic du niveau.
 */
export default async function ExcelCaseStudyStepPage({
  params
}: {
  params: Promise<{ slug: string; step: string }>;
}) {
  const { slug, step: rawStep } = await params;
  const position = parseLevelParam(rawStep);
  const step = position === null ? null : getExcelCaseStep(slug, position);

  if (!step) {
    notFound();
  }

  const user = await getCurrentUser();
  const levelAccess = await getExerciseAccess({
    userId: user?.id,
    exerciseId: step.exercise.exercise.id
  });

  if (!levelAccess.allowed) {
    notFound();
  }

  const features = getFeatures();
  const access = await resolveEntitlement("excel-finance-lab");
  const isLast = step.nextHref === null;
  const caseHref = excelCaseHref(step.caseStudy);
  const exercise = step.exercise.exercise;

  if (!access.allowed) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">
              {step.caseStudy.title} · étape {step.index}/{step.total}
            </span>
            <h1>{step.instruction}</h1>
          </div>
          <Link className="secondary-action" href={caseHref}>
            Revoir le dossier
          </Link>
        </section>
        <PaywallNotice reason={access.reason} feature={access.feature} moduleLabel="Excel Finance Lab" />
      </div>
    );
  }

  const draftEnabled = features.persistence.enabled && features.auth.enabled && user !== null;
  const draft =
    draftEnabled && step.exercise.kind === "formula-grid"
      ? await getWorkbookDraft(user.id, exercise.id)
      : null;
  const initialCells = draft
    ? Object.fromEntries(Object.entries(draft).map(([ref, raw]) => [ref, String(raw)]))
    : null;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">
            {step.caseStudy.title} · étape {step.index}/{step.total}
          </span>
          <h1>{step.instruction}</h1>
          <p>{exercise.title}</p>
        </div>
        <Link className="secondary-action" href={caseHref}>
          Revoir le dossier
        </Link>
      </section>

      <section className="panel">
        <span className="section-label">Pièce {step.document.date}</span>
        <h2>{step.document.reference}</h2>
        <p>{step.document.summary}</p>
      </section>

      <section className="panel">
        <span className="section-label">Énoncé</span>
        {exercise.statement.split("\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      {step.exercise.kind === "formula-grid" && step.exercise.grid ? (
        <FormulaExerciseForm
          exerciseId={exercise.id}
          grid={step.exercise.grid}
          persistence={features.persistence}
          draftEnabled={draftEnabled}
          initialCells={initialCells}
          nextHref={step.nextHref ?? caseHref}
          nextLabel={isLast ? "Terminer le cas" : "Étape suivante"}
          activityContext="case_study"
        />
      ) : step.exercise.kind === "pattern-grid" && step.exercise.grid ? (
        <LabExerciseForm
          exerciseId={exercise.id}
          grid={step.exercise.grid}
          persistence={features.persistence}
          nextHref={step.nextHref ?? caseHref}
          nextLabel={isLast ? "Terminer le cas" : "Étape suivante"}
        />
      ) : (
        <ModuleExerciseForm
          exerciseId={exercise.id}
          kind="multiple_choice"
          options={choiceOptions(exercise.id)}
          persistence={features.persistence}
          nextHref={step.nextHref ?? caseHref}
          nextLabel={isLast ? "Terminer le cas" : "Étape suivante"}
          activityContext="case_study"
        />
      )}
    </div>
  );
}
