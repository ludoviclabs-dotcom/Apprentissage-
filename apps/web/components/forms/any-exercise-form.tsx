import type { Exercise } from "@finance/domain";
import { ExerciseAttemptForm } from "@/components/forms/exercise-attempt-form";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { getFeatures } from "@/lib/features";
import { choiceOptions, exerciseKind } from "@/lib/typed-exercise";

/**
 * Le bon formulaire pour n'importe quel exercice du catalogue.
 *
 * Un exercice noté par un évaluateur typé se répond dans ses termes — journal,
 * nombre, cases à cocher — y compris depuis les pages génériques /exercices.
 * Avant PR-12a seules les pages de module le faisaient : un exercice du
 * parcours migré vers `numeric` aurait reçu de la prose et une erreur 400.
 * La prose reste le formulaire des exercices `short_text_rubric` et legacy.
 */
export function AnyExerciseForm({ exercise }: { exercise: Exercise }) {
  const kind = exerciseKind(exercise.id);

  if (kind === "text") {
    return <ExerciseAttemptForm exercise={exercise} />;
  }

  return (
    <ModuleExerciseForm
      exerciseId={exercise.id}
      kind={kind}
      options={choiceOptions(exercise.id)}
      persistence={getFeatures().persistence}
    />
  );
}
