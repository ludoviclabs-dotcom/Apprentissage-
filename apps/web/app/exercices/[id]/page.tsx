import { notFound } from "next/navigation";
import { getExerciseById } from "@finance/db";
import { getRequiredEntitlement } from "@finance/domain";
import { ExercisePanel } from "@/components/exercise-panel";
import { AnyExerciseForm } from "@/components/forms/any-exercise-form";
import { PaywallNotice } from "@/components/paywall-notice";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import { getExerciseAccess } from "@/lib/learning-progression";

/**
 * The generic exercise page.
 *
 * IT ASKS THE SAME REGISTRY AS THE MODULE ROUTES. A module exercise reached
 * here used to render its statement, its rubric and — since the lab grids
 * arrived in `AnyExerciseForm` — a working grid, whatever the learner had
 * unlocked or paid for. The module route withholds all of that on purpose:
 * "a locked exercise that still prints its énoncé and its grid has given away
 * the thing being sold and only taken back the marking". Two routes onto the
 * same exercise cannot disagree about that, so this one applies the identical
 * two-stage gate: the level first, then the entitlement.
 *
 * Exercises outside every module — the seeded catalogue, which is most of it —
 * resolve to `outside-canonical-curriculum` and are unaffected.
 */
export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = await getExerciseById(id);

  if (!exercise) {
    notFound();
  }

  const user = await getCurrentUser();
  const levelAccess = await getExerciseAccess({ userId: user?.id, exerciseId: id });

  // A level the learner has not reached is withheld entirely, as on the module
  // route: 404 rather than a teaser.
  if (!levelAccess.allowed) {
    notFound();
  }

  const requiredEntitlement = getRequiredEntitlement(id);
  const access = requiredEntitlement ? await resolveEntitlement(requiredEntitlement) : null;

  if (access && !access.allowed) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Exercice</span>
            <h1>{exercise.title}</h1>
            <p>
              Niveau {exercise.level} · {exercise.estimatedMinutes} minutes
            </p>
          </div>
        </section>
        <PaywallNotice
          reason={access.reason}
          feature={access.feature}
          moduleLabel="Ce module"
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Exercice</span>
          <h1>{exercise.title}</h1>
          <p>Niveau {exercise.level} · {exercise.estimatedMinutes} minutes</p>
        </div>
      </section>

      <ExercisePanel exercise={exercise} />
      <AnyExerciseForm exercise={exercise} />
    </div>
  );
}
