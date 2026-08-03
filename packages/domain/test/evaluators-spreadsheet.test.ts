import { describe, expect, it } from "vitest";
import {
  InvalidEvaluationSpecError,
  compileFormulaPattern,
  getEvaluator,
  normalizeCellRef,
  normalizeFormula,
  type SpreadsheetSpec
} from "../src";

const evaluator = getEvaluator("spreadsheet");

function spec(overrides: Partial<SpreadsheetSpec["checks"][number]> = {}): SpreadsheetSpec {
  return {
    checks: [
      {
        cell: "B12",
        label: "Chiffre d'affaires",
        points: 20,
        expectedValue: 600000,
        toleranceAbs: 0.5,
        requiredFormulaPattern: "=(B2\\+B3|SUM\\(B2:B3\\))",
        ...overrides
      }
    ]
  };
}

describe("normalisation", () => {
  it("makes whitespace, case and a missing leading = insignificant", () => {
    expect(normalizeFormula(" b2 + b3 ")).toBe("=B2+B3");
    expect(normalizeFormula("=B2+B3")).toBe("=B2+B3");
    expect(normalizeFormula("B2+B3")).toBe("=B2+B3");
  });

  it("ignores absolute-reference markers", () => {
    // No exercise in this lab asks a formula to be copied across cells, so
    // failing somebody for $B$2 would mark a distinction never taught.
    expect(normalizeFormula("=$B$2+$B$3")).toBe("=B2+B3");
    expect(normalizeCellRef(" b12 ")).toBe("B12");
  });

  it("leaves an empty formula empty rather than turning it into =", () => {
    expect(normalizeFormula("")).toBe("");
    expect(normalizeFormula("   ")).toBe("");
  });
});

describe("formula patterns", () => {
  it("anchors, so a pattern describes the whole formula", () => {
    const pattern = compileFormulaPattern("=SUM\\(B2:B3\\)");

    expect(pattern.test("=SUM(B2:B3)")).toBe(true);
    // Without anchoring this would pass, and "=SUM(B2:B3)+999" is exactly the
    // near-miss the check exists to catch.
    expect(pattern.test("=SUM(B2:B3)+999")).toBe(false);
  });

  it("accepts the authored alternatives and rejects a plausible other formula", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { B12: { value: 600000, formula: "=SUM(B2:B3)" } }
    });

    expect(result.score).toBe(20);

    const wrong = evaluator.evaluate(spec(), {
      cells: { B12: { value: 600000, formula: "=B2*B3" } }
    });

    expect(wrong.score).toBeLessThan(20);
  });
});

describe("value and formula are scored separately", () => {
  it("gives the value marks to a hard-coded result but not the formula marks", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { B12: { value: 600000, formula: "=600000" } }
    });

    // 60% of the points ride on the value, 40% on the method.
    expect(result.score).toBe(12);
    expect(result.criteria.find((c) => c.id === "B12-value")?.outcome).toBe("met");
    expect(result.criteria.find((c) => c.id === "B12-formula")?.outcome).toBe("missed");
  });

  it("names a hard-coded result as a method error rather than a wrong answer", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { B12: { value: 600000, formula: "=600000" } }
    });

    expect(result.feedback.reasoningErrors.join(" ")).toMatch(/en dur/);
    // The arithmetic was right; saying otherwise would be false.
    expect(result.feedback.calculationErrors).toHaveLength(0);
  });

  it("gives the formula marks to a right method with a wrong number", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { B12: { value: 599999, formula: "=B2+B3" } }
    });

    expect(result.score).toBe(8);
    expect(result.feedback.calculationErrors.join(" ")).toContain("599999");
  });

  it("awards everything to a value-only check when no formula is required", () => {
    const valueOnly = spec({ requiredFormulaPattern: undefined });

    expect(evaluator.evaluate(valueOnly, { cells: { B12: { value: 600000 } } }).score).toBe(20);
  });

  it("awards everything to a formula-only check when no value is expected", () => {
    const formulaOnly = spec({ expectedValue: undefined, toleranceAbs: undefined });

    expect(
      evaluator.evaluate(formulaOnly, { cells: { B12: { formula: "=B2+B3" } } }).score
    ).toBe(20);
  });
});

describe("missing and malformed submissions", () => {
  it("scores an empty submission zero and says the cell is empty", () => {
    const result = evaluator.evaluate(spec(), { cells: {} });

    expect(result.score).toBe(0);
    expect(result.feedback.missing.join(" ")).toMatch(/valeur numérique absente/);
  });

  it("reaches the check however the learner cased the reference", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { b12: { value: 600000, formula: "=B2+B3" } }
    });

    expect(result.score).toBe(20);
  });

  it("does not credit a non-finite value", () => {
    expect(
      evaluator.evaluate(spec(), { cells: { B12: { value: Number.NaN, formula: "=B2+B3" } } }).score
    ).toBe(8);
  });
});

describe("tolerance", () => {
  it("accepts the authored boundary and rejects just beyond it", () => {
    const cents = spec({ expectedValue: 2.58, toleranceAbs: 0.01, requiredFormulaPattern: undefined });

    expect(evaluator.evaluate(cents, { cells: { B12: { value: 2.59 } } }).score).toBe(20);
    expect(evaluator.evaluate(cents, { cells: { B12: { value: 2.57 } } }).score).toBe(20);
    expect(evaluator.evaluate(cents, { cells: { B12: { value: 2.6 } } }).score).toBe(0);
    expect(evaluator.evaluate(cents, { cells: { B12: { value: 2.56 } } }).score).toBe(0);
  });

  it("keeps a relative tolerance usable when the expected value is zero", () => {
    // A budget variance of exactly 0 is a real case, and a percentage of zero
    // is zero — so the floor is what stops the check becoming exact-match only.
    const zero = spec({ expectedValue: 0, toleranceAbs: undefined, tolerancePct: 0.01, requiredFormulaPattern: undefined });

    expect(evaluator.evaluate(zero, { cells: { B12: { value: 0 } } }).score).toBe(20);
    expect(evaluator.evaluate(zero, { cells: { B12: { value: 0.005 } } }).score).toBe(20);
    expect(evaluator.evaluate(zero, { cells: { B12: { value: 5 } } }).score).toBe(0);
  });
});

describe("specification validation", () => {
  it("rejects a spec with no checks", () => {
    expect(() => evaluator.assertValidSpec({ checks: [] })).toThrow(InvalidEvaluationSpecError);
  });

  it("rejects a check that expects neither a value nor a formula", () => {
    // It would award its points to every submission, including an empty one.
    expect(() =>
      evaluator.assertValidSpec({
        checks: [{ cell: "B12", label: "x", points: 5 }]
      })
    ).toThrow(/neither an expected value nor a formula pattern/);
  });

  it("rejects a reference that is not A1-style", () => {
    expect(() => evaluator.assertValidSpec(spec({ cell: "twelve" }))).toThrow(/A1-style/);
  });

  it("rejects two checks on the same cell", () => {
    expect(() =>
      evaluator.assertValidSpec({
        checks: [
          { cell: "B12", label: "a", points: 5, expectedValue: 1 },
          { cell: "b12", label: "b", points: 5, expectedValue: 2 }
        ]
      })
    ).toThrow(/duplicate check/);
  });

  it("rejects zero or negative points", () => {
    expect(() => evaluator.assertValidSpec(spec({ points: 0 }))).toThrow(/greater than zero/);
  });

  it("rejects non-finite points and invalid tolerances", () => {
    expect(() => evaluator.assertValidSpec(spec({ points: Number.NaN }))).toThrow(
      /finite number of points/
    );
    expect(() => evaluator.assertValidSpec(spec({ toleranceAbs: -0.01 }))).toThrow(
      /invalid toleranceAbs/
    );
    expect(() => evaluator.assertValidSpec(spec({ tolerancePct: Number.POSITIVE_INFINITY }))).toThrow(
      /invalid tolerancePct/
    );
  });

  it("rejects an uncompilable formula pattern", () => {
    expect(() => evaluator.assertValidSpec(spec({ requiredFormulaPattern: "=(" }))).toThrow(
      /invalid formula pattern/
    );
  });

  it("rejects an empty formula pattern that could never match a formula", () => {
    expect(() => evaluator.assertValidSpec(spec({ requiredFormulaPattern: "" }))).toThrow(
      /empty formula pattern/
    );
  });
});

describe("error classification", () => {
  it("files a different formula under reasoning by default", () => {
    const result = evaluator.evaluate(spec(), {
      cells: { B12: { value: 600000, formula: "=B2*B3" } }
    });

    expect(result.feedback.reasoningErrors).toHaveLength(1);
    expect(result.feedback.accountingTreatmentErrors).toHaveLength(0);
  });

  it("files it under accounting treatment when the check says so", () => {
    // On the SIG items the formula encodes an accounting rule: deducting
    // depreciation before the EBE stage is a treatment mistake, and calling it
    // a reasoning slip would tell the learner the wrong thing.
    const treatment = spec({ errorKind: "accounting-treatment" });
    const result = evaluator.evaluate(treatment, {
      cells: { B12: { value: 600000, formula: "=B2*B3" } }
    });

    expect(result.feedback.accountingTreatmentErrors).toHaveLength(1);
    expect(result.feedback.reasoningErrors).toHaveLength(0);
  });

  it("still calls a hard-coded result a method error on a treatment item", () => {
    // Typing the number is not misapplying a rule — it is applying none.
    const result = evaluator.evaluate(spec({ errorKind: "accounting-treatment" }), {
      cells: { B12: { value: 600000, formula: "=600000" } }
    });

    expect(result.feedback.reasoningErrors.join(" ")).toMatch(/en dur/);
    expect(result.feedback.accountingTreatmentErrors).toHaveLength(0);
  });
});
