import { describe, expect, it } from "vitest";
import {
  assertValidAuthoredVersions,
  authoredExerciseVersions,
  exercises,
  getEvaluator,
  isSpecEvaluationType,
  type AuthoredExerciseVersion,
  type EvaluationResult
} from "@finance/domain";
import { gradeExercise } from "../src/repository";
import { renderSubmission, type SubmissionPayload } from "../src/submit-attempt";

/**
 * Proves the migration is worth making.
 *
 * Two halves. The first runs every authored exercise version against its own
 * golden cases, so a later specification edit that changes a mark fails here
 * rather than silently re-grading learners. The second pins the *previous*
 * grader's behaviour on the same inputs: those assertions document real,
 * reproduced defects, and they are the reason this engine exists.
 *
 * Nothing here touches a database — evaluators are pure functions.
 */

function exerciseById(id: string) {
  const exercise = exercises.find((item) => item.id === id);

  if (!exercise) {
    throw new Error(`Fixture references unknown exercise "${id}".`);
  }

  return exercise;
}

function evaluate(version: AuthoredExerciseVersion, payload: SubmissionPayload): EvaluationResult {
  if (!isSpecEvaluationType(version.evaluationType)) {
    throw new Error(`"${version.evaluationType}" has no registered evaluator.`);
  }

  switch (version.evaluationType) {
    case "numeric":
      if (payload.kind !== "numeric") throw new Error("payload mismatch");
      return getEvaluator("numeric").evaluate(version.spec as never, { value: payload.value });
    case "multiple_choice":
      if (payload.kind !== "choice") throw new Error("payload mismatch");
      return getEvaluator("multiple_choice").evaluate(version.spec as never, {
        selectedOptionIds: payload.selectedOptionIds
      });
    case "journal_entry":
      if (payload.kind !== "journal") throw new Error("payload mismatch");
      return getEvaluator("journal_entry").evaluate(version.spec as never, { lines: payload.lines });
    case "short_text_rubric":
      if (payload.kind !== "text") throw new Error("payload mismatch");
      return getEvaluator("short_text_rubric").evaluate(version.spec as never, { text: payload.text });
  }
}

describe("authored exercise versions", () => {
  it("are valid", () => {
    expect(() => assertValidAuthoredVersions()).not.toThrow();
  });

  it("only reference exercises that exist", () => {
    for (const version of authoredExerciseVersions) {
      expect(() => exerciseById(version.exerciseId), version.id).not.toThrow();
    }
  });

  it("each ship at least one golden case", () => {
    for (const version of authoredExerciseVersions) {
      expect(version.testCases.length, version.id).toBeGreaterThan(0);
    }
  });
});

describe("golden cases", () => {
  for (const version of authoredExerciseVersions) {
    for (const testCase of version.testCases) {
      it(`${version.exerciseId} · ${testCase.name}`, () => {
        const result = evaluate(version, testCase.submission as SubmissionPayload);

        expect(result.score).toBeCloseTo(testCase.expectedScore, 1);

        for (const [criterionId, expected] of Object.entries(testCase.expectedOutcomes ?? {})) {
          const criterion = result.criteria.find((item) => item.id === criterionId);

          expect(criterion, `${criterionId} missing from result`).toBeDefined();
          expect(criterion?.outcome, criterionId).toBe(expected);
        }
      });
    }
  }

  it("are deterministic", () => {
    for (const version of authoredExerciseVersions) {
      for (const testCase of version.testCases) {
        const payload = testCase.submission as SubmissionPayload;

        expect(evaluate(version, payload)).toEqual(evaluate(version, payload));
      }
    }
  });
});

/**
 * Each case below was reproduced against the shipped grader before this PR. The
 * assertions on `legacy` are not aspirational — they are what it still does, and
 * they are why these exercises were migrated first.
 */
describe("defects the previous grader had", () => {
  it("failed the reference answer of ex-ias37-comparison", () => {
    const exercise = exerciseById("ex-ias37-comparison");
    const legacy = gradeExercise(exercise, exercise.expectedAnswer);

    // The seeded model answer — a perfect response by definition — scored 3/20.
    expect(legacy.score).toBeLessThan(10);

    const version = authoredExerciseVersions.find((item) => item.exerciseId === exercise.id)!;
    const migrated = evaluate(version, { kind: "text", text: exercise.expectedAnswer });

    expect(migrated.score).toBe(20);
  });

  it("scored a reversed journal entry at least as high as the correct one", () => {
    const exercise = exerciseById("ex-ecriture-provision-simple");
    const correct = gradeExercise(
      exercise,
      "Debit 6815 dotation aux provisions 14 000 EUR ; credit 1511 provision pour risques et charges 14 000 EUR."
    );
    const inverted = gradeExercise(
      exercise,
      "Il faut crediter la dotation et debiter la provision pour risques et charges, pour un montant coherent, avec un libelle clair."
    );

    // The direction of the entry was invisible to the matcher.
    expect(inverted.score).toBeGreaterThanOrEqual(correct.score);

    const version = authoredExerciseVersions.find((item) => item.exerciseId === exercise.id)!;
    const migratedCorrect = evaluate(version, {
      kind: "journal",
      lines: [
        { account: "6815", debit: 14000 },
        { account: "1511", credit: 14000 }
      ]
    });
    const migratedInverted = evaluate(version, {
      kind: "journal",
      lines: [
        { account: "6815", credit: 14000 },
        { account: "1511", debit: 14000 }
      ]
    });

    expect(migratedCorrect.score).toBeGreaterThan(migratedInverted.score);
    expect(
      migratedInverted.feedback.accountingTreatmentErrors.length,
      "the learner must be told the direction is wrong"
    ).toBeGreaterThan(0);
  });

  it("gave the same mark to a right and a wrong number", () => {
    const exercise = exerciseById("ex-provision-calcul-fourchette");
    const right = gradeExercise(
      exercise,
      "Je retiens une estimation centrale de 14 000 EUR car aucun point de la fourchette n'est plus probable ; le montant reclame seul ne suffit pas a justifier."
    );
    const wrong = gradeExercise(
      exercise,
      "Je retiens une estimation centrale de 13 000 EUR car aucun point de la fourchette n'est plus probable ; le montant reclame seul ne suffit pas a justifier."
    );

    // The figure was never an input: it was shredded into sub-4-character tokens.
    expect(wrong.score).toBe(right.score);

    const version = authoredExerciseVersions.find((item) => item.exerciseId === exercise.id)!;

    expect(evaluate(version, { kind: "numeric", value: 14000 }).score).toBe(20);
    expect(evaluate(version, { kind: "numeric", value: 13000 }).score).toBe(0);
  });

  it("rewarded selecting the distractor on ex-provision-qcm-conditions", () => {
    const exercise = exerciseById("ex-provision-qcm-conditions");
    const wrong = gradeExercise(
      exercise,
      "Les conditions utiles sont l'obligation actuelle, la sortie probable et le paiement deja effectue ; l'estimation fiable n'est pas requise. Exclusion."
    );

    // Asserting the exclusion criterion *is* a condition scored full marks.
    expect(wrong.score).toBeGreaterThanOrEqual(16);

    const version = authoredExerciseVersions.find((item) => item.exerciseId === exercise.id)!;
    const migrated = evaluate(version, {
      kind: "choice",
      selectedOptionIds: ["obligation", "sortie", "paiement"]
    });

    expect(migrated.score).toBeLessThan(16);
    expect(migrated.feedback.reasoningErrors.join(" ")).toContain("éteint l'obligation");
  });
});

describe("renderSubmission", () => {
  it("produces a readable answer string for every payload kind", () => {
    expect(renderSubmission({ kind: "text", text: "abc" })).toBe("abc");
    expect(renderSubmission({ kind: "numeric", value: 14000 })).toBe("14000");
    expect(renderSubmission({ kind: "choice", selectedOptionIds: ["a", "b"] })).toBe("a, b");
    expect(renderSubmission({ kind: "journal", lines: [{ account: "6815", debit: 100 }] })).toContain("6815");
  });
});
