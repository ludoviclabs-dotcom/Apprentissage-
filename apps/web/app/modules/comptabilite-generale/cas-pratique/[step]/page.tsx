import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { getFeatures } from "@/lib/features";
import { COMPTA_MODULE_BASE, getMiniCaseStep, parseLevelParam } from "@/lib/compta-module";
import { comptaGeneraleV1MiniCase } from "@finance/domain";

/**
 * One step of the mini-case: the piece on the left, the entry it justifies on
 * the right.
 *
 * The step is a real graded exercise, not a display of one — the same id, the
 * same specification, the same evaluator. That is what keeps the case honest:
 * finishing it means the same entries were marked correct, and it also means the
 * case feeds progression and the review queue exactly as the drills do.
 */
export default async function ComptaGeneraleMiniCaseStepPage({
  params
}: {
  params: Promise<{ step: string }>;
}) {
  const { step: rawStep } = await params;
  const position = parseLevelParam(rawStep);
  const step = position === null ? null : getMiniCaseStep(position);

  if (!step) {
    notFound();
  }

  const features = getFeatures();
  const isLast = step.nextHref === null;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">
            {comptaGeneraleV1MiniCase.title} · étape {step.index}/{step.total}
          </span>
          <h1>{step.instruction}</h1>
          <p>{step.exercise.exercise.title}</p>
        </div>
        <Link className="secondary-action" href={`${COMPTA_MODULE_BASE}/cas-pratique`}>
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
        {step.exercise.exercise.statement.split("\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <ModuleExerciseForm
        exerciseId={step.exercise.exercise.id}
        kind={step.exercise.kind}
        options={step.exercise.options}
        persistence={features.persistence}
        nextHref={step.nextHref ?? `${COMPTA_MODULE_BASE}/cas-pratique`}
        nextLabel={isLast ? "Terminer le cas" : "Étape suivante"}
      />

      {isLast ? (
        <section className="panel">
          <span className="section-label">Clôture</span>
          <h2>{comptaGeneraleV1MiniCase.closing.label}</h2>
          <p>
            TVA collectée {comptaGeneraleV1MiniCase.closing.expectedTvaCollectee.toLocaleString("fr-FR")} € ·
            TVA déductible {comptaGeneraleV1MiniCase.closing.expectedTvaDeductible.toLocaleString("fr-FR")} € ·
            TVA à décaisser{" "}
            {comptaGeneraleV1MiniCase.closing.expectedTvaADecaisser.toLocaleString("fr-FR")} €.
          </p>
        </section>
      ) : null}
    </div>
  );
}
