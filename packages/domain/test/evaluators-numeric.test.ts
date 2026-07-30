import { describe, expect, it } from "vitest";
import {
  InvalidEvaluationSpecError,
  isWithinTolerance,
  numericEvaluator,
  parseNumericAnswer,
  type NumericSpec
} from "../src";

const SPEC: NumericSpec = { expected: 1200, tolerancePct: 0.01, unit: "€", label: "TVA collectée" };

describe("parseNumericAnswer", () => {
  it("reads plain and French-formatted numbers", () => {
    expect(parseNumericAnswer("1200")).toBe(1200);
    expect(parseNumericAnswer("1200,50")).toBe(1200.5);
    expect(parseNumericAnswer("1 200,50")).toBe(1200.5);
    expect(parseNumericAnswer("1200 €")).toBe(1200);
    expect(parseNumericAnswer("-45,2")).toBe(-45.2);
  });

  it("reads a non-breaking space as a thousands separator", () => {
    // Copy-pasting from a spreadsheet produces U+00A0, not a plain space.
    expect(parseNumericAnswer(`1${String.fromCharCode(0x00a0)}200`)).toBe(1200);
  });

  it("refuses anything it cannot read unambiguously", () => {
    for (const input of ["", "environ 1200", "12,5 %", "1.200,50", "1200 euros et des poussières", "N/A", "--3"]) {
      expect(parseNumericAnswer(input), input).toBeNull();
    }
  });

  it("does not coerce a percentage into a euro amount", () => {
    // Silently reading "12,5 %" as 12.5 would be a false positive.
    expect(parseNumericAnswer("12,5 %")).toBeNull();
  });
});

describe("isWithinTolerance", () => {
  it("accepts inside and rejects outside a relative tolerance", () => {
    expect(isWithinTolerance(1200, SPEC)).toBe(true);
    expect(isWithinTolerance(1212, SPEC)).toBe(true);
    expect(isWithinTolerance(1213, SPEC)).toBe(false);
  });

  it("honours an absolute tolerance", () => {
    const spec: NumericSpec = { expected: 100, toleranceAbs: 0.5 };

    expect(isWithinTolerance(100.5, spec)).toBe(true);
    expect(isWithinTolerance(100.51, spec)).toBe(false);
  });

  it("accepts when either declared tolerance is satisfied", () => {
    const spec: NumericSpec = { expected: 1000, tolerancePct: 0.001, toleranceAbs: 50 };

    expect(isWithinTolerance(1040, spec), "absolute passes").toBe(true);
    expect(isWithinTolerance(1000.5, spec), "relative passes").toBe(true);
    expect(isWithinTolerance(1100, spec)).toBe(false);
  });

  it("handles an expected value of zero without demanding exactness by accident", () => {
    const spec: NumericSpec = { expected: 0, tolerancePct: 0.01 };

    expect(isWithinTolerance(0, spec)).toBe(true);
    expect(isWithinTolerance(0.005, spec)).toBe(true);
    expect(isWithinTolerance(5, spec)).toBe(false);
  });

  it("rejects a non-finite answer", () => {
    expect(isWithinTolerance(Number.NaN, SPEC)).toBe(false);
    expect(isWithinTolerance(Number.POSITIVE_INFINITY, SPEC)).toBe(false);
  });

  it("defaults to a tight relative tolerance when none is declared", () => {
    const spec: NumericSpec = { expected: 1200 };

    expect(isWithinTolerance(1200, spec)).toBe(true);
    expect(isWithinTolerance(1201, spec)).toBe(false);
  });
});

describe("numericEvaluator.assertValidSpec", () => {
  it("rejects a non-finite expectation", () => {
    expect(() => numericEvaluator.assertValidSpec({ expected: Number.NaN })).toThrow(InvalidEvaluationSpecError);
  });

  it("rejects negative tolerances and non-positive points", () => {
    expect(() => numericEvaluator.assertValidSpec({ expected: 1, tolerancePct: -0.1 })).toThrow(
      InvalidEvaluationSpecError
    );
    expect(() => numericEvaluator.assertValidSpec({ expected: 1, toleranceAbs: -1 })).toThrow(
      InvalidEvaluationSpecError
    );
    expect(() => numericEvaluator.assertValidSpec({ expected: 1, points: 0 })).toThrow(InvalidEvaluationSpecError);
  });
});

describe("numericEvaluator.evaluate", () => {
  it("awards full marks inside the tolerance", () => {
    const result = numericEvaluator.evaluate(SPEC, { value: 1205 });

    expect(result.score).toBe(20);
    expect(result.criteria[0].outcome).toBe("met");
    expect(result.feedback.correct).toHaveLength(1);
    expect(result.feedback.calculationErrors).toHaveLength(0);
  });

  it("awards nothing outside it and says what was expected", () => {
    const result = numericEvaluator.evaluate(SPEC, { value: 1000 });

    expect(result.score).toBe(0);
    expect(result.feedback.calculationErrors[0]).toContain("1200");
    expect(result.feedback.missing).toContain("TVA collectée");
  });

  it("classifies a reversed sign as an accounting treatment error, not arithmetic", () => {
    const result = numericEvaluator.evaluate(SPEC, { value: -1200 });

    expect(result.feedback.accountingTreatmentErrors).toHaveLength(1);
    expect(result.feedback.calculationErrors).toHaveLength(0);
  });

  it("can award half marks for the right sign when the spec allows it", () => {
    const result = numericEvaluator.evaluate({ ...SPEC, partialCreditForSign: true }, { value: 900 });

    expect(result.score).toBe(10);
    expect(result.criteria[0].outcome).toBe("partial");
    expect(result.feedback.partial).toHaveLength(1);
  });

  it("does not award sign credit when the sign is wrong", () => {
    const result = numericEvaluator.evaluate({ ...SPEC, partialCreditForSign: true }, { value: -900 });

    expect(result.score).toBe(0);
  });

  it("handles a missing or unparsable answer as zero, not as a crash", () => {
    const result = numericEvaluator.evaluate(SPEC, { value: Number.NaN });

    expect(result.score).toBe(0);
    expect(result.feedback.calculationErrors[0]).toContain("Aucune valeur");
  });

  it("is deterministic and carries its evaluator version", () => {
    const first = numericEvaluator.evaluate(SPEC, { value: 1205 });
    const second = numericEvaluator.evaluate(SPEC, { value: 1205 });

    expect(first).toEqual(second);
    expect(first.evaluatorVersion).toBe("numeric@1");
    expect(first.evaluationType).toBe("numeric");
  });
});
