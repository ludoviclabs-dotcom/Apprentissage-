import { authoredExerciseVersions } from "@finance/domain";
import type { ChoiceOption, ModuleExerciseKind } from "@/components/forms/module-exercise-form";

/**
 * Quel formulaire pour quel exercice — décidé par la spécification active,
 * jamais par `Exercise.type`, pour la même raison que `submitAttempt` : les
 * deux divergent dans le catalogue historique, et un champ numérique rendu
 * pour un exercice noté en prose garantirait un zéro.
 *
 * Depuis PR-12a les pages génériques (/exercices) en ont besoin autant que le
 * module : dix exercices du parcours sont notés par un évaluateur typé et
 * doivent être répondus dans ses termes.
 */
export function exerciseKind(exerciseId: string): ModuleExerciseKind {
  const authored = authoredExerciseVersions.find((version) => version.exerciseId === exerciseId);

  switch (authored?.evaluationType) {
    case "journal_entry":
      return "journal_entry";
    case "numeric":
      return "numeric";
    case "multiple_choice":
      return "multiple_choice";
    default:
      // `short_text_rubric`, `legacy_rubric` et les non-migrés : la prose.
      return "text";
  }
}

/**
 * Les options d'un QCM, SANS `correctOptionIds` : ce qui part vers le client
 * ne doit jamais contenir le corrigé.
 */
export function choiceOptions(exerciseId: string): ChoiceOption[] {
  const authored = authoredExerciseVersions.find((version) => version.exerciseId === exerciseId);

  if (authored?.evaluationType !== "multiple_choice") {
    return [];
  }

  const spec = authored.spec as { options?: ChoiceOption[] };

  return (spec.options ?? []).map((option) => ({
    id: option.id,
    label: option.label,
    ...(option.rationale ? { rationale: option.rationale } : {})
  }));
}
