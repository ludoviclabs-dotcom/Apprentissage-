import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { getFeatures } from "@/lib/features";
import { COMPTA_MODULE_BASE, getCaseStudyStep, parseLevelParam } from "@/lib/compta-module";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExerciseAccess } from "@/lib/learning-progression";

/**
 * Une étape d'un case study N3/N4 : la pièce à gauche, le travail qu'elle
 * justifie à droite.
 *
 * Même architecture que le mini-cas N2 : l'étape EST un exercice du niveau —
 * même id, même spécification, même évaluateur — soumis avec
 * `activityContext: "case_study"` pour alimenter la composante caseStudy de la
 * progression. La dernière étape est le diagnostic du niveau.
 */
export default async function ComptaCaseStudyStepPage({
  params
}: {
  params: Promise<{ slug: string; step: string }>;
}) {
  const { slug, step: rawStep } = await params;
  const position = parseLevelParam(rawStep);
  const step = position === null ? null : getCaseStudyStep(slug, position);

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
  const isLast = step.nextHref === null;
  const caseHref = `${COMPTA_MODULE_BASE}/cas/${step.caseStudy.slug}`;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">
            {step.caseStudy.title} · étape {step.index}/{step.total}
          </span>
          <h1>{step.instruction}</h1>
          <p>{step.exercise.exercise.title}</p>
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
        {step.exercise.exercise.statement.split("\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>

      <ModuleExerciseForm
        exerciseId={step.exercise.exercise.id}
        kind={step.exercise.kind}
        options={step.exercise.options}
        persistence={features.persistence}
        nextHref={step.nextHref ?? caseHref}
        nextLabel={isLast ? "Terminer le cas" : "Étape suivante"}
        activityContext="case_study"
      />
    </div>
  );
}
