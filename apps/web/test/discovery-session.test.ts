import { describe, expect, it } from "vitest";
import {
  authoredExerciseVersions,
  exercises,
  getModuleLevelForExercise,
  getRequiredEntitlement
} from "@finance/domain";
import {
  DISCOVERY_SESSION_EXERCISE_IDS,
  DISCOVERY_SESSION_LENGTH,
  DiscoverySessionUnavailableError,
  buildDiscoverySteps,
  isDiscoveryExercise
} from "@/lib/discovery-session";

/**
 * Ce que la session découverte promet sur /exercices : « 5 exercices guidés ».
 *
 * Ces tests vérifient les trois propriétés qui rendent cette promesse tenable
 * sans compte, sans base et sans progression — parce qu'aucune d'elles n'est
 * évidente en lisant la liste d'identifiants, et que chacune casse en silence
 * si quelqu'un rattache un de ces exercices à un module ou à une offre.
 */

describe("sélection de la session découverte", () => {
  it("propose exactement cinq exercices", () => {
    expect(DISCOVERY_SESSION_EXERCISE_IDS).toHaveLength(5);
    expect(DISCOVERY_SESSION_LENGTH).toBe(5);
  });

  it("ne répète aucun exercice", () => {
    expect(new Set(DISCOVERY_SESSION_EXERCISE_IDS).size).toBe(DISCOVERY_SESSION_LENGTH);
  });

  it("ne retient que des exercices présents dans le catalogue", () => {
    const catalogue = new Set(exercises.map((exercise) => exercise.id));

    for (const id of DISCOVERY_SESSION_EXERCISE_IDS) {
      expect(catalogue.has(id), `${id} absent du catalogue`).toBe(true);
    }
  });

  /**
   * La propriété la plus fragile. `getExerciseAccess` verrouille un exercice
   * rattaché à un niveau tant que la progression ne l'a pas ouvert ; en mode
   * découverte il n'y a pas de progression, donc pas d'ouverture. Un exercice
   * de niveau dans cette liste produirait un 403 au premier clic — et le CTA
   * principal redeviendrait mort, sous une autre forme.
   */
  it("n'inclut aucun exercice rattaché à un niveau de module", () => {
    for (const id of DISCOVERY_SESSION_EXERCISE_IDS) {
      expect(getModuleLevelForExercise(id), `${id} appartient à un niveau`).toBeNull();
    }
  });

  it("n'inclut aucun exercice derrière une offre payante", () => {
    for (const id of DISCOVERY_SESSION_EXERCISE_IDS) {
      expect(getRequiredEntitlement(id), `${id} exige un abonnement`).toBeNull();
    }
  });

  /**
   * Chaque exercice a une spécification d'évaluation : sans elle, la notation
   * retomberait sur le classificateur de prose hérité, qui donne un zéro à une
   * réponse juste exprimée autrement. La vitrine du produit ne peut pas être
   * notée par le moteur que les évaluateurs typés ont remplacé.
   */
  it("ne retient que des exercices notés par un évaluateur typé", () => {
    const authored = new Set(authoredExerciseVersions.map((version) => version.exerciseId));

    for (const id of DISCOVERY_SESSION_EXERCISE_IDS) {
      expect(authored.has(id), `${id} n'a pas de version notée`).toBe(true);
    }
  });

  it("couvre au moins trois familles de réponse", () => {
    const families = new Set(buildDiscoverySteps(exercises).map((step) => step.kind));

    expect(families.size).toBeGreaterThanOrEqual(3);
    expect(families.has("multiple_choice")).toBe(true);
    expect(families.has("numeric")).toBe(true);
    expect(families.has("journal_entry")).toBe(true);
  });
});

describe("construction des étapes", () => {
  it("est déterministe : deux appels donnent le même ordre", () => {
    const first = buildDiscoverySteps(exercises).map((step) => step.exerciseId);
    const second = buildDiscoverySteps(exercises).map((step) => step.exerciseId);

    expect(first).toEqual(second);
    expect(first).toEqual([...DISCOVERY_SESSION_EXERCISE_IDS]);
  });

  it("ne dépend pas de l'ordre du catalogue", () => {
    const reversed = buildDiscoverySteps([...exercises].reverse());

    expect(reversed.map((step) => step.exerciseId)).toEqual([...DISCOVERY_SESSION_EXERCISE_IDS]);
  });

  it("numérote les étapes de 1 à 5", () => {
    expect(buildDiscoverySteps(exercises).map((step) => step.index)).toEqual([1, 2, 3, 4, 5]);
  });

  /**
   * Un QCM part avec ses options mais jamais avec `correctOptionIds` : le
   * corrigé descendrait dans le HTML avant la réponse.
   */
  it("n'envoie jamais le corrigé d'un QCM au client", () => {
    for (const step of buildDiscoverySteps(exercises)) {
      for (const option of step.options) {
        expect(Object.keys(option).sort()).not.toContain("correctOptionIds");
        expect(Object.keys(option).every((key) => ["id", "label", "rationale"].includes(key))).toBe(
          true
        );
      }
    }
  });

  it("échoue franchement plutôt que de servir une session tronquée", () => {
    const amputated = exercises.filter(
      (exercise) => exercise.id !== DISCOVERY_SESSION_EXERCISE_IDS[0]
    );

    expect(() => buildDiscoverySteps(amputated)).toThrow(DiscoverySessionUnavailableError);
  });
});

describe("liste blanche de la route de correction", () => {
  it("reconnaît les exercices de la session", () => {
    for (const id of DISCOVERY_SESSION_EXERCISE_IDS) {
      expect(isDiscoveryExercise(id)).toBe(true);
    }
  });

  /**
   * La correction sans authentification ne doit pas devenir un contournement du
   * paywall : `ex-xl-marge-commerciale` exige l'offre du lab Excel.
   */
  it("refuse un exercice payant et un identifiant inconnu", () => {
    expect(isDiscoveryExercise("ex-xl-marge-commerciale")).toBe(false);
    expect(isDiscoveryExercise("ex-inexistant")).toBe(false);
  });
});
