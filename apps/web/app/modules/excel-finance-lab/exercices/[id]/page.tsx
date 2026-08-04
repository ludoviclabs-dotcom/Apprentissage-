import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkbookDraft } from "@finance/db";
import { exportTresorerieVba, getModuleSourceReferences } from "@finance/domain";
import { PaywallNotice } from "@/components/paywall-notice";
import { SourceReference } from "@/components/source-reference";
import { LabExerciseForm } from "@/components/forms/lab-exercise-form";
import { FormulaExerciseForm } from "@/components/forms/formula-exercise-form";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { VbaViewer } from "@/components/excel/vba-viewer";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import { getFeatures } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExerciseAccess } from "@/lib/learning-progression";
import { EXCEL_LAB_BASE, getLabExercise, nextLabExercise } from "@/lib/excel-lab";
import { choiceOptions } from "@/lib/typed-exercise";

/**
 * One lab exercise, answered in the form its evaluator expects.
 *
 * Three kinds since PR-12b: the N1/N2 grids (typed-in, pattern-checked), the
 * N3/N4 engine grids (formulas parsed and recalculated), and the QCM
 * diagnostics. The expected answer is never rendered — the correction shows it
 * once an attempt has been marked.
 *
 * The VBA reading exercise additionally shows its module in a read-only
 * editor with a local download; the platform never executes a macro.
 */
export default async function ExcelLabExercisePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = getLabExercise(id);

  if (!view) {
    notFound();
  }

  const user = await getCurrentUser();
  const levelAccess = await getExerciseAccess({ userId: user?.id, exerciseId: id });

  if (!levelAccess.allowed) {
    notFound();
  }

  const features = getFeatures();
  const access = await resolveEntitlement("excel-finance-lab");
  const { exercise } = view;
  const next = nextLabExercise(exercise.id);
  const nextAccess = next
    ? await getExerciseAccess({ userId: user?.id, exerciseId: next.exercise.id })
    : null;

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

  // The draft is restored only when it can also be saved: database active,
  // accounts on, somebody signed in — the same gate as the save route.
  const draftEnabled = features.persistence.enabled && features.auth.enabled && user !== null;
  const draft =
    draftEnabled && view.kind === "formula-grid" ? await getWorkbookDraft(user.id, exercise.id) : null;
  const initialCells = draft
    ? Object.fromEntries(Object.entries(draft).map(([ref, raw]) => [ref, String(raw)]))
    : null;

  const nextHref =
    next && nextAccess?.allowed ? `${EXCEL_LAB_BASE}/exercices/${next.exercise.id}` : undefined;
  const sources = getModuleSourceReferences(exercise.id) ?? [];
  const isVbaReading = exercise.id === "ex-xl-n4-vba-lecture";

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Excel Finance Lab · niveau {exercise.level}</span>
          <h1>{exercise.title}</h1>
          <p>
            {exercise.estimatedMinutes} minutes · jeu de données {view.datasetId}
          </p>
        </div>
        <Link className="secondary-action" href={`${EXCEL_LAB_BASE}/${exercise.level}`}>
          Retour au niveau
        </Link>
      </section>

      <section className="panel">
        <span className="section-label">Énoncé</span>
        {(isVbaReading
          ? // Le module VBA est affiché par l'éditeur dédié juste en dessous ;
            // le répéter en paragraphes doublerait vingt lignes de code. Seuls
            // l'introduction et la question restent ici.
            exercise.statement.replace(exportTresorerieVba, "").split("\n")
          : exercise.statement.split("\n")
        )
          .filter((paragraph) => paragraph.trim() !== "")
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        <div className="module-meta">
          {exercise.competencyIds.map((competencyId) => (
            <span key={competencyId}>{competencyId}</span>
          ))}
        </div>
      </section>

      {isVbaReading ? (
        <section className="panel">
          <span className="section-label">Module VBA — lecture seule</span>
          <VbaViewer code={exportTresorerieVba} filename="export_tresorerie.bas" />
        </section>
      ) : null}

      {view.kind === "formula-grid" && view.grid ? (
        <FormulaExerciseForm
          exerciseId={exercise.id}
          grid={view.grid}
          persistence={features.persistence}
          draftEnabled={draftEnabled}
          initialCells={initialCells}
          nextHref={nextHref}
        />
      ) : view.kind === "pattern-grid" && view.grid ? (
        <LabExerciseForm
          exerciseId={exercise.id}
          grid={view.grid}
          persistence={features.persistence}
          nextHref={nextHref}
        />
      ) : (
        <ModuleExerciseForm
          exerciseId={exercise.id}
          kind="multiple_choice"
          options={choiceOptions(exercise.id)}
          persistence={features.persistence}
          nextHref={nextHref}
          nextLabel="Exercice suivant"
        />
      )}

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={sources} />
      </section>
    </div>
  );
}
