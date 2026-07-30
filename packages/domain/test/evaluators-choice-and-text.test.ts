import { describe, expect, it } from "vitest";
import {
  InvalidEvaluationSpecError,
  multipleChoiceEvaluator,
  shortTextRubricEvaluator,
  toCorrection,
  type MultipleChoiceSpec,
  type ShortTextRubricSpec
} from "../src";

/** Modelled on ex-provision-qcm-conditions: pick the three real conditions. */
const CONDITIONS: MultipleChoiceSpec = {
  label: "Conditions de comptabilisation",
  options: [
    { id: "obligation", label: "Obligation actuelle" },
    { id: "sortie", label: "Sortie probable de ressources" },
    { id: "estimation", label: "Estimation fiable" },
    {
      id: "paiement",
      label: "Paiement déjà effectué",
      rationale: "Un paiement déjà effectué exclut la provision : il n'y a plus d'obligation future."
    }
  ],
  correctOptionIds: ["obligation", "sortie", "estimation"]
};

describe("multipleChoiceEvaluator.assertValidSpec", () => {
  it("accepts a well-formed question", () => {
    expect(() => multipleChoiceEvaluator.assertValidSpec(CONDITIONS)).not.toThrow();
  });

  it("rejects a question where every option is correct", () => {
    // Such a question discriminates nothing.
    expect(() =>
      multipleChoiceEvaluator.assertValidSpec({
        ...CONDITIONS,
        correctOptionIds: CONDITIONS.options.map((option) => option.id)
      })
    ).toThrow(/not every option/);
  });

  it("rejects fewer than two options, duplicates, and unknown keys", () => {
    expect(() =>
      multipleChoiceEvaluator.assertValidSpec({ options: [{ id: "a", label: "A" }], correctOptionIds: ["a"] })
    ).toThrow(InvalidEvaluationSpecError);

    expect(() =>
      multipleChoiceEvaluator.assertValidSpec({
        options: [
          { id: "a", label: "A" },
          { id: "a", label: "A bis" }
        ],
        correctOptionIds: ["a"]
      })
    ).toThrow(/duplicate option id/);

    expect(() =>
      multipleChoiceEvaluator.assertValidSpec({ ...CONDITIONS, correctOptionIds: ["nope"] })
    ).toThrow(/not among the options/);
  });

  it("rejects a question with no correct option", () => {
    expect(() => multipleChoiceEvaluator.assertValidSpec({ ...CONDITIONS, correctOptionIds: [] })).toThrow(
      InvalidEvaluationSpecError
    );
  });
});

describe("multipleChoiceEvaluator.evaluate", () => {
  it("awards full marks for the exact selection", () => {
    const result = multipleChoiceEvaluator.evaluate(CONDITIONS, {
      selectedOptionIds: ["obligation", "sortie", "estimation"]
    });

    expect(result.score).toBe(20);
    expect(result.feedback.reasoningErrors).toHaveLength(0);
  });

  it("penalises the distractor and explains why", () => {
    // The legacy grader gave this answer full marks: it only looked for the
    // substrings "exclusion" and "paiement" anywhere in the prose.
    const result = multipleChoiceEvaluator.evaluate(CONDITIONS, {
      selectedOptionIds: ["obligation", "sortie", "paiement"]
    });

    expect(result.score).toBeLessThan(20);
    expect(result.feedback.reasoningErrors[0]).toContain("exclut la provision");
    expect(result.feedback.missing[0]).toContain("Estimation fiable");
  });

  it("scores zero when everything is selected", () => {
    // Ticking every box demonstrates no discrimination, so it must not pay.
    const result = multipleChoiceEvaluator.evaluate(CONDITIONS, {
      selectedOptionIds: ["obligation", "sortie", "estimation", "paiement"]
    });

    expect(result.score).toBe(0);
  });

  it("scores zero for an empty selection", () => {
    expect(multipleChoiceEvaluator.evaluate(CONDITIONS, { selectedOptionIds: [] }).score).toBe(0);
  });

  it("ignores duplicates and unknown option ids", () => {
    const result = multipleChoiceEvaluator.evaluate(CONDITIONS, {
      selectedOptionIds: ["obligation", "obligation", "sortie", "estimation", "ghost"]
    });

    expect(result.score).toBe(20);
  });

  it("can be made all-or-nothing", () => {
    const strict = { ...CONDITIONS, allowPartialCredit: false };

    expect(
      multipleChoiceEvaluator.evaluate(strict, { selectedOptionIds: ["obligation", "sortie"] }).score
    ).toBe(0);
    expect(
      multipleChoiceEvaluator.evaluate(strict, {
        selectedOptionIds: ["obligation", "sortie", "estimation"]
      }).score
    ).toBe(20);
  });

  it("gives partial credit proportional to net correctness", () => {
    // Two of three right, none wrong.
    const result = multipleChoiceEvaluator.evaluate(CONDITIONS, {
      selectedOptionIds: ["obligation", "sortie"]
    });

    expect(result.score).toBeCloseTo(13.33, 1);
  });

  it("is deterministic", () => {
    const submission = { selectedOptionIds: ["obligation", "sortie"] };

    expect(multipleChoiceEvaluator.evaluate(CONDITIONS, submission)).toEqual(
      multipleChoiceEvaluator.evaluate(CONDITIONS, submission)
    );
  });
});

/** Modelled on ex-ias37-comparison, whose own model answer scored 3/20 before. */
const IAS37: ShortTextRubricSpec = {
  criteria: [
    {
      id: "criteres",
      label: "Critères IAS 37",
      points: 7,
      anyOf: ["ias 37", "obligation actuelle", "critere", "critères", "conditions de comptabilisation"],
      errorKind: "accounting-treatment",
      hint: "Nommer les critères de comptabilisation d'IAS 37."
    },
    {
      id: "documentation",
      label: "Degré de documentation",
      points: 4,
      anyOf: ["documentation", "documente", "justificatif", "piece"],
      errorKind: "source-quality"
    },
    {
      id: "estimation",
      label: "Meilleure estimation",
      points: 5,
      anyOf: ["meilleure estimation", "estimation", "valeur attendue"],
      errorKind: "reasoning"
    },
    {
      id: "annexe",
      label: "Traitement en annexe",
      points: 4,
      anyOf: ["annexe", "passif eventuel", "information en annexe"],
      errorKind: "accounting-treatment"
    }
  ]
};

describe("shortTextRubricEvaluator.assertValidSpec", () => {
  it("rejects a criterion nobody could satisfy", () => {
    // A criterion with no accepted formulation caps every learner below the
    // maximum for no stated reason.
    expect(() =>
      shortTextRubricEvaluator.assertValidSpec({
        criteria: [{ id: "x", label: "X", points: 3, anyOf: [] }]
      })
    ).toThrow(/no accepted formulation/);
  });

  it("rejects a term that both satisfies and disqualifies", () => {
    expect(() =>
      shortTextRubricEvaluator.assertValidSpec({
        criteria: [{ id: "x", label: "X", points: 3, anyOf: ["provision"], mustNotContain: ["Provision"] }]
      })
    ).toThrow(/both accepts and forbids/);
  });

  it("rejects duplicate ids, empty terms and non-positive points", () => {
    expect(() =>
      shortTextRubricEvaluator.assertValidSpec({
        criteria: [
          { id: "x", label: "X", points: 1, anyOf: ["a"] },
          { id: "x", label: "Y", points: 1, anyOf: ["b"] }
        ]
      })
    ).toThrow(/duplicate criterion id/);

    expect(() =>
      shortTextRubricEvaluator.assertValidSpec({
        criteria: [{ id: "x", label: "X", points: 1, anyOf: ["  "] }]
      })
    ).toThrow(/empty expected term/);

    expect(() =>
      shortTextRubricEvaluator.assertValidSpec({
        criteria: [{ id: "x", label: "X", points: 0, anyOf: ["a"] }]
      })
    ).toThrow(/more than zero/);
  });
});

describe("shortTextRubricEvaluator.evaluate", () => {
  it("passes the reference answer that the previous grader failed at 3/20", () => {
    // The seeded model answer for ex-ias37-comparison, verbatim.
    const modelAnswer =
      "La note doit comparer les critères, le degré de documentation, la meilleure estimation, " +
      "et le traitement annexe si les critères ne sont pas satisfaits.";

    const result = shortTextRubricEvaluator.evaluate(IAS37, { text: modelAnswer });

    expect(result.score).toBe(20);
  });

  it("is insensitive to accents and casing", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, {
      text: "LES CRITERES, la DOCUMENTATION, la meilleure ESTIMATION et l'ANNEXE sont traités."
    });

    expect(result.score).toBe(20);
  });

  it("scores an off-topic answer at zero", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, {
      text: "La situation de la creation dune information correcte demande un calcul precis chez Gigi."
    });

    expect(result.score).toBe(0);
    expect(result.feedback.accountingTreatmentErrors.length).toBeGreaterThan(0);
  });

  it("routes each miss to the category the author declared", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, { text: "Aucun élément pertinent ici du tout." });

    expect(result.feedback.accountingTreatmentErrors).toHaveLength(2);
    expect(result.feedback.sourceQualityIssues).toHaveLength(1);
    expect(result.feedback.reasoningErrors).toHaveLength(1);
  });

  it("treats an answer under the minimum length as not attempted", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, { text: "annexe" });

    expect(result.score).toBe(0);
    expect(result.feedback.missing[0]).toContain("trop courte");
  });

  it("awards half credit when a compulsory qualifier is missing", () => {
    const spec: ShortTextRubricSpec = {
      criteria: [
        {
          id: "provision",
          label: "Qualification",
          points: 10,
          anyOf: ["provisionner", "provision"],
          allOf: ["obligation actuelle"]
        }
      ]
    };

    const partial = shortTextRubricEvaluator.evaluate(spec, {
      text: "Il faut provisionner ce litige sans plus de précision."
    });
    const complete = shortTextRubricEvaluator.evaluate(spec, {
      text: "Il faut provisionner : il existe une obligation actuelle envers le tiers."
    });

    expect(partial.score).toBe(10);
    expect(partial.criteria[0].outcome).toBe("partial");
    expect(complete.score).toBe(20);
  });

  it("forfeits a criterion containing a disqualifying formulation", () => {
    const spec: ShortTextRubricSpec = {
      criteria: [
        {
          id: "qualification",
          label: "Qualification",
          points: 5,
          anyOf: ["provision"],
          mustNotContain: ["charge a payer"]
        }
      ]
    };

    const result = shortTextRubricEvaluator.evaluate(spec, {
      text: "On enregistre une provision, en réalité une charge à payer certaine."
    });

    expect(result.score).toBe(0);
    expect(result.criteria[0].justification).toContain("disqualifie");
  });

  it("is deterministic", () => {
    const submission = { text: "Les critères, la documentation, l'estimation et l'annexe." };

    expect(shortTextRubricEvaluator.evaluate(IAS37, submission)).toEqual(
      shortTextRubricEvaluator.evaluate(IAS37, submission)
    );
  });
});

describe("toCorrection", () => {
  const identity = {
    id: "corr-fixed-1",
    exerciseId: "ex-ias37-comparison",
    sourceReferences: [],
    remediationPlan: {
      microLesson: "Reprendre IAS 37.",
      nextAction: "Refaire l'exercice lié.",
      competencyTags: ["ifrs-ias37"],
      expectedAnswer: "…"
    }
  };

  it("fills every field the existing consumers read", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, { text: "Aucun élément pertinent ici du tout." });
    const correction = toCorrection(result, identity);

    for (const key of [
      "id",
      "exerciseId",
      "score",
      "summary",
      "rubricScores",
      "correct",
      "partialPoints",
      "errors",
      "calculationErrors",
      "accountingTreatmentErrors",
      "reasoningErrors",
      "sourceQualityIssues",
      "missingElements",
      "remediation",
      "remediationPlan",
      "sourceReferences"
    ] as const) {
      expect(correction[key], key).toBeDefined();
    }
  });

  it("keeps criterion labels unique, because the panel keys rows on them", () => {
    const duplicated: ShortTextRubricSpec = {
      criteria: [
        { id: "a", label: "Justification", points: 5, anyOf: ["alpha"] },
        { id: "b", label: "Justification", points: 5, anyOf: ["beta"] }
      ]
    };

    const correction = toCorrection(
      shortTextRubricEvaluator.evaluate(duplicated, { text: "alpha et beta sont présents ici." }),
      identity
    );
    const labels = correction.rubricScores.map((score) => score.criterion);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never leaves `correct` empty, since the panel renders it unconditionally", () => {
    const correction = toCorrection(
      shortTextRubricEvaluator.evaluate(IAS37, { text: "Rien de pertinent dans cette phrase." }),
      identity
    );

    expect(correction.correct.length).toBeGreaterThan(0);
  });

  it("mirrors the structured categories into the legacy errors list", () => {
    const result = shortTextRubricEvaluator.evaluate(IAS37, { text: "Rien de pertinent dans cette phrase." });
    const correction = toCorrection(result, identity);

    expect(correction.errors).toHaveLength(
      result.feedback.calculationErrors.length +
        result.feedback.accountingTreatmentErrors.length +
        result.feedback.reasoningErrors.length +
        result.feedback.sourceQualityIssues.length
    );
  });

  it("summarises by score band", () => {
    expect(toCorrection({ ...({} as never), score: 18, criteria: [], feedback: { correct: [], partial: [], missing: [], calculationErrors: [], accountingTreatmentErrors: [], reasoningErrors: [], sourceQualityIssues: [] } } as never, identity).summary).toContain("solide");
  });
});
