import type { Exercise } from "@finance/domain";
import { ExerciseAttemptForm } from "@/components/forms/exercise-attempt-form";
import { FormulaExerciseForm } from "@/components/forms/formula-exercise-form";
import { LabExerciseForm } from "@/components/forms/lab-exercise-form";
import { ModuleExerciseForm } from "@/components/forms/module-exercise-form";
import { getFeatures } from "@/lib/features";
import { getLabExercise } from "@/lib/excel-lab";
import { choiceOptions, exerciseKind } from "@/lib/typed-exercise";

/**
 * Le bon formulaire pour n'importe quel exercice du catalogue.
 *
 * Un exercice noté par un évaluateur typé se répond dans ses termes — journal,
 * nombre, cases à cocher, grille — y compris depuis les pages génériques
 * /exercices. Avant PR-12b, un exercice du lab Excel ouvert par là recevait un
 * champ de prose et une erreur 400 ; il reçoit désormais sa grille, celle de
 * PR-06 ou celle du moteur selon son évaluateur.
 */
export function AnyExerciseForm({ exercise }: { exercise: Exercise }) {
  const lab = getLabExercise(exercise.id);

  if (lab?.kind === "formula-grid" && lab.grid) {
    return (
      <FormulaExerciseForm
        exerciseId={exercise.id}
        grid={lab.grid}
        persistence={getFeatures().persistence}
      />
    );
  }

  if (lab?.kind === "pattern-grid" && lab.grid) {
    return (
      <LabExerciseForm
        exerciseId={exercise.id}
        grid={lab.grid}
        persistence={getFeatures().persistence}
      />
    );
  }

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
