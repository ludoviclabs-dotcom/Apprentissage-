import { getExercises } from "@finance/db";
import type { Exercise } from "@finance/domain";
import { choiceOptions, exerciseKind } from "@/lib/typed-exercise";
import type { ChoiceOption, ModuleExerciseKind } from "@/components/forms/module-exercise-form";

/**
 * La session découverte : cinq exercices, une fois, sans compte.
 *
 * Elle remplace le bloc « Session recommandée » dont le bouton était désactivé
 * derrière un badge « Bientôt disponible ». Un CTA principal visible doit être
 * cliquable ; sinon il ne doit pas exister.
 *
 * TROIS CONTRAINTES GOUVERNENT CE FICHIER.
 *
 * 1. La sélection est une constante, pas un tirage. Aucun `Math.random`, aucune
 *    dépendance à la date ou à l'ordre du catalogue : deux visiteurs, ou le même
 *    visiteur après un rechargement, voient la même session. C'est aussi ce qui
 *    rend la session testable sans figer le seed.
 *
 * 2. Les cinq exercices sont hors module. `getExerciseAccess` verrouille les
 *    exercices rattachés à un niveau tant que la progression ne l'a pas ouvert —
 *    et une progression, en mode découverte, n'existe pas. Un exercice de niveau
 *    aurait donc produit un 403 au premier clic. `discovery-session.test.ts`
 *    vérifie cette propriété pour chaque identifiant.
 *
 * 3. Aucun n'exige d'entitlement. La session est la vitrine du produit : elle ne
 *    peut pas buter sur le paywall du lab Excel.
 *
 * L'ordre est pédagogique : reconnaître (QCM), calculer, écrire, calculer dans
 * un autre domaine, justifier.
 */

export const DISCOVERY_SESSION_EXERCISE_IDS = [
  "ex-provision-qcm-conditions",
  "ex-provision-calcul-fourchette",
  "ex-ecriture-provision-simple",
  "ex-methode-abc-1",
  "ex-ias37-comparison"
] as const;

export const DISCOVERY_SESSION_LENGTH = DISCOVERY_SESSION_EXERCISE_IDS.length;

/** Le résumé affiché sur /exercices et en tête de session. */
export const DISCOVERY_SESSION_SUMMARY =
  "5 exercices guidés · environ 12 minutes · correction immédiate";

export interface DiscoveryStep {
  /** 1-indexé : c'est ce que lit le visiteur (« Étape 2 sur 5 »). */
  index: number;
  exerciseId: string;
  title: string;
  statement: string;
  domainId: string;
  kind: ModuleExerciseKind;
  /** Vide hors QCM. Ne contient jamais `correctOptionIds`. */
  options: ChoiceOption[];
  competencyIds: string[];
  estimatedMinutes: number;
}

export class DiscoverySessionUnavailableError extends Error {
  constructor(missing: string[]) {
    super(`Exercices de la session découverte absents du catalogue : ${missing.join(", ")}`);
    this.name = "DiscoverySessionUnavailableError";
  }
}

/**
 * Construit les étapes depuis le catalogue.
 *
 * Un identifiant absent est une erreur, pas un trou silencieux : une session
 * annoncée « 5 exercices » qui en sert trois est un mensonge d'interface, et le
 * cas se produit exactement quand quelqu'un renomme un exercice sans regarder
 * ici. La page traduit l'erreur en état honnête plutôt qu'en 500.
 */
export function buildDiscoverySteps(catalogue: readonly Exercise[]): DiscoveryStep[] {
  const byId = new Map(catalogue.map((exercise) => [exercise.id, exercise]));
  const missing = DISCOVERY_SESSION_EXERCISE_IDS.filter((id) => !byId.has(id));

  if (missing.length > 0) {
    throw new DiscoverySessionUnavailableError(missing);
  }

  return DISCOVERY_SESSION_EXERCISE_IDS.map((id, position) => {
    const exercise = byId.get(id) as Exercise;

    return {
      index: position + 1,
      exerciseId: exercise.id,
      title: exercise.title,
      statement: exercise.statement,
      domainId: exercise.domainId,
      kind: exerciseKind(exercise.id),
      options: choiceOptions(exercise.id),
      competencyIds: exercise.competencyIds,
      estimatedMinutes: exercise.estimatedMinutes
    } satisfies DiscoveryStep;
  });
}

export async function getDiscoverySteps(): Promise<DiscoveryStep[]> {
  return buildDiscoverySteps(await getExercises());
}

/** Un identifiant appartient-il à la session ? La route de correction l'exige. */
export function isDiscoveryExercise(exerciseId: string): boolean {
  return (DISCOVERY_SESSION_EXERCISE_IDS as readonly string[]).includes(exerciseId);
}
