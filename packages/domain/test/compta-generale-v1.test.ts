import { describe, expect, it } from "vitest";
import {
  COMPTA_GENERALE_V1_TRACK,
  activeCurriculum,
  authoredExerciseVersions,
  comptaGeneraleV1Competencies,
  comptaGeneraleV1ExerciseVersions,
  comptaGeneraleV1Exercises,
  comptaGeneraleV1Levels,
  comptaGeneraleV1MiniCase,
  competencies,
  exercises,
  getComptaGeneraleV1Exercises,
  getComptaGeneraleV1Level,
  getEvaluator,
  getTrackLevels,
  isSpecEvaluationType
} from "../src";

/**
 * Content integrity for the comptabilité générale v1 module.
 *
 * The grading behaviour itself is covered by the golden cases every authored
 * version ships, which `packages/db/test/evaluator-migration.test.ts` runs. What
 * is checked here is the wiring nothing else would catch: that every exercise is
 * reachable, typed, attached to a level and a competency, and that the mini-case
 * is a path through exercises that exist.
 */

const EXPECTED_COUNT = 14;

describe("the module inventory", () => {
  it("ships between 12 and 15 exercises, the scope this module was sized for", () => {
    expect(comptaGeneraleV1Exercises).toHaveLength(EXPECTED_COUNT);
    expect(comptaGeneraleV1Exercises.length).toBeGreaterThanOrEqual(12);
    expect(comptaGeneraleV1Exercises.length).toBeLessThanOrEqual(15);
  });

  it("uses unique ids that do not collide with the existing catalogue", () => {
    const ids = comptaGeneraleV1Exercises.map((exercise) => exercise.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(exercises.filter((exercise) => exercise.id === id), id).toHaveLength(1);
    }
  });

  it("covers each of the five topics the module promises", () => {
    // Read off the ids rather than a hand-kept list: a topic silently dropped
    // during an edit is exactly what this is here to catch.
    const ids = comptaGeneraleV1Exercises.map((exercise) => exercise.id).join(" ");

    for (const topic of ["achat", "vente", "tva", "immo", "bancaire"]) {
      expect(ids, `no exercise covers "${topic}"`).toContain(topic);
    }
  });

  it("splits the exercises across both levels", () => {
    expect(getComptaGeneraleV1Exercises(1).length).toBeGreaterThanOrEqual(5);
    expect(getComptaGeneraleV1Exercises(2).length).toBeGreaterThanOrEqual(5);
    expect(getComptaGeneraleV1Exercises(1).length + getComptaGeneraleV1Exercises(2).length).toBe(
      EXPECTED_COUNT
    );
  });

  it("attaches every exercise to a level of its own track", () => {
    const levelIds = new Set(
      getTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK).map((level) => level.id)
    );

    for (const exercise of comptaGeneraleV1Exercises) {
      const levelId = getComptaGeneraleV1Level(exercise.id);

      expect(levelId, exercise.id).not.toBeNull();
      expect(levelIds.has(levelId as string), `${exercise.id} → ${levelId}`).toBe(true);
    }

    expect(getComptaGeneraleV1Level("ex-does-not-exist")).toBeNull();
  });

  it("targets only competencies its levels declare", () => {
    const known = new Set(competencies.map((competency) => competency.id));
    const targeted = new Set(comptaGeneraleV1Levels.flatMap((level) => level.competencyIds));

    for (const competency of comptaGeneraleV1Competencies) {
      expect(known.has(competency.id), competency.id).toBe(true);
    }

    for (const exercise of comptaGeneraleV1Exercises) {
      expect(exercise.competencyIds.length, exercise.id).toBeGreaterThan(0);

      for (const competencyId of exercise.competencyIds) {
        // An exercise feeding a competency no level measures cannot move any
        // progression bar, so it would be work that never counts.
        expect(targeted.has(competencyId), `${exercise.id} → ${competencyId}`).toBe(true);
      }
    }
  });
});

describe("every exercise is graded by a typed evaluator", () => {
  it("has exactly one authored version, and none falls back to the rubric matcher", () => {
    expect(comptaGeneraleV1ExerciseVersions).toHaveLength(EXPECTED_COUNT);

    for (const exercise of comptaGeneraleV1Exercises) {
      const versions = authoredExerciseVersions.filter(
        (version) => version.exerciseId === exercise.id
      );

      expect(versions, exercise.id).toHaveLength(1);
      expect(versions[0].evaluationType, exercise.id).not.toBe("legacy_rubric");
      expect(isSpecEvaluationType(versions[0].evaluationType), exercise.id).toBe(true);
    }
  });

  it("uses the three evaluators the module needs", () => {
    const types = new Set(comptaGeneraleV1ExerciseVersions.map((version) => version.evaluationType));

    expect(types).toEqual(new Set(["journal_entry", "numeric", "multiple_choice"]));
  });

  it("ships a golden case that fails as well as one that passes", () => {
    for (const version of comptaGeneraleV1ExerciseVersions) {
      const scores = version.testCases.map((testCase) => testCase.expectedScore);

      expect(scores, `${version.exerciseId} has no perfect case`).toContain(20);
      // A spec with only a passing case cannot detect a change that makes it
      // accept everything.
      expect(
        scores.some((score) => score < 20),
        `${version.exerciseId} has no failing case`
      ).toBe(true);
    }
  });

  it("expects a balanced entry wherever it expects an entry", () => {
    for (const version of comptaGeneraleV1ExerciseVersions) {
      if (version.evaluationType !== "journal_entry") {
        continue;
      }

      // assertValidSpec rejects an unbalanced expectation; running it here names
      // the exercise rather than failing somewhere inside the seed.
      expect(() =>
        getEvaluator("journal_entry").assertValidSpec(version.spec as never)
      , version.exerciseId).not.toThrow();
    }
  });
});

describe("the mini-case", () => {
  it("is a path through exercises that exist, in the module", () => {
    const moduleIds = new Set(comptaGeneraleV1Exercises.map((exercise) => exercise.id));

    expect(comptaGeneraleV1MiniCase.steps.length).toBeGreaterThanOrEqual(5);

    for (const step of comptaGeneraleV1MiniCase.steps) {
      expect(moduleIds.has(step.exerciseId), step.exerciseId).toBe(true);
      expect(step.instruction.length).toBeGreaterThan(0);
    }
  });

  it("justifies every step by a document in its own dossier", () => {
    const documentIds = new Set(comptaGeneraleV1MiniCase.documents.map((doc) => doc.id));

    for (const step of comptaGeneraleV1MiniCase.steps) {
      expect(documentIds.has(step.documentId), `${step.exerciseId} → ${step.documentId}`).toBe(true);
    }
  });

  it("leaves no document without a step, so the dossier has no decoration", () => {
    const used = new Set(comptaGeneraleV1MiniCase.steps.map((step) => step.documentId));

    for (const doc of comptaGeneraleV1MiniCase.documents) {
      expect(used.has(doc.id), `${doc.reference} is never used`).toBe(true);
    }
  });

  it("closes on a VAT position its own steps add up to", () => {
    const { closing } = comptaGeneraleV1MiniCase;

    // The declaration the case ends on must be the one the entries imply,
    // otherwise the month "closes" on a number nothing produced.
    expect(closing.expectedTvaCollectee - closing.expectedTvaDeductible).toBe(
      closing.expectedTvaADecaisser
    );
  });

  it("ends on a step that is actually marked", () => {
    const last = comptaGeneraleV1MiniCase.steps.at(-1);
    const version = comptaGeneraleV1ExerciseVersions.find(
      (candidate) => candidate.exerciseId === last?.exerciseId
    );

    expect(version?.evaluationType).toBe("numeric");

    // And it is the closing figure, not some other number.
    expect((version?.spec as { expected: number }).expected).toBe(
      comptaGeneraleV1MiniCase.closing.expectedTvaADecaisser
    );
  });

  it("is attached to a level of its own track", () => {
    const levelIds = getTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK).map(
      (level) => level.id
    );

    expect(comptaGeneraleV1MiniCase.trackId).toBe(COMPTA_GENERALE_V1_TRACK);
    expect(levelIds).toContain(comptaGeneraleV1MiniCase.levelId);
  });

  it("cites its sources", () => {
    expect(comptaGeneraleV1MiniCase.sourceReferences.length).toBeGreaterThan(0);

    for (const source of comptaGeneraleV1MiniCase.sourceReferences) {
      expect(source.document.length).toBeGreaterThan(0);
      expect(source.pack.length).toBeGreaterThan(0);
    }
  });
});
