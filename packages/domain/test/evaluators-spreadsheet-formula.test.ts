import { describe, expect, it } from "vitest";
import {
  InvalidEvaluationSpecError,
  spreadsheetFormulaEvaluator,
  type FormulaSpreadsheetSpec
} from "../src";

/**
 * The engine-backed spreadsheet evaluator (PR-12b).
 *
 * The property that justifies its existence: an equivalent formula the author
 * never anticipated earns full marks, because nothing compares text — the
 * formula is recalculated over the given data and over perturbed data. The
 * counter-property matters as much: a typed-in result matches the base data,
 * fails every perturbation, and is named a method error.
 */

/** CA = B2+B3 over a small P&L; perturbation moves B2. */
const spec: FormulaSpreadsheetSpec = {
  workbook: { A2: "Ventes", B2: 480000, A3: "Services", B3: 120000, A4: "Subventions", B4: 9000 },
  checks: [
    {
      cell: "B12",
      label: "Chiffre d'affaires",
      points: 20,
      expectedValue: 600000,
      toleranceAbs: 0.5,
      unit: "EUR",
      forbiddenRefs: ["B4"],
      formulaHint: "Additionnez les deux lignes de produits."
    }
  ],
  perturbations: [
    {
      name: "ventes-revisees",
      label: "les ventes passent à 500 000 EUR",
      overrides: { B2: 500000 },
      expected: { B12: 620000 }
    }
  ]
};

function grade(formula: string, base: FormulaSpreadsheetSpec = spec) {
  return spreadsheetFormulaEvaluator.evaluate(base, { cells: { B12: { formula } } });
}

describe("grading through the engine", () => {
  it("gives full marks to the anticipated formula", () => {
    expect(grade("=B2+B3").score).toBe(20);
  });

  it("gives full marks to equivalent formulations nobody anticipated", () => {
    // The pattern evaluator's documented limitation, removed: these four are
    // the same calculation, and the engine can tell.
    for (const formula of ["=B3+B2", "=SOMME(B2:B3)", "=SUM(B2:B3)", "=B2+B3+0"]) {
      expect(grade(formula).score, formula).toBe(20);
    }
  });

  it("accepts French aliases and separators", () => {
    expect(grade("=somme(b2;b3)").score).toBe(20);
  });

  it("scores a hard-coded result 60%, named as a method error", () => {
    const result = grade("=600000");

    expect(result.score).toBe(12);
    expect(result.feedback.reasoningErrors.join(" ")).toContain("en dur");
  });

  it("scores a typed-in value like a hard-coded formula", () => {
    const result = spreadsheetFormulaEvaluator.evaluate(spec, {
      cells: { B12: { value: 600000 } }
    });

    expect(result.score).toBe(12);
  });

  it("fails the method when a perturbation exposes the formula", () => {
    // Right today by luck: reads the wrong line that happens to make 600 000.
    const lucky = spreadsheetFormulaEvaluator.evaluate(
      {
        ...spec,
        workbook: { ...spec.workbook, B5: 600000 }
      },
      { cells: { B12: { formula: "=B5" } } }
    );

    expect(lucky.score).toBe(12);
    expect(lucky.feedback.reasoningErrors.join(" ")).toContain("500 000");
  });

  it("enforces forbidden references", () => {
    // Subsidies folded into revenue: wrong value AND a named forbidden ref.
    const result = grade("=B2+B3+B4");

    expect(result.score).toBe(0);
    expect(result.feedback.reasoningErrors.join(" ")).toContain("B4");
  });

  it("reports an evaluation error as a calculation error, by code", () => {
    const result = grade("=B2/(B3-B3)");

    expect(result.score).toBe(0);
    expect(result.feedback.calculationErrors.join(" ")).toContain("#DIV/0!");
  });

  it("reports an unreadable formula with the parser's diagnostic", () => {
    const result = grade("=B2+");

    expect(result.score).toBe(0);
    expect(result.feedback.reasoningErrors.join(" ")).toContain("illisible");
  });

  it("reports an absent cell as missing", () => {
    const result = spreadsheetFormulaEvaluator.evaluate(spec, { cells: {} });

    expect(result.score).toBe(0);
    expect(result.feedback.missing.join(" ")).toContain("B12");
  });

  it("reads submissions case-insensitively", () => {
    const result = spreadsheetFormulaEvaluator.evaluate(spec, {
      cells: { b12: { formula: "=b2+b3" } }
    });

    expect(result.score).toBe(20);
  });

  it("is deterministic and survives JSON round-tripping", () => {
    const restored = JSON.parse(JSON.stringify(spec)) as FormulaSpreadsheetSpec;

    expect(grade("=B2+B3", restored)).toEqual(grade("=B2+B3"));
    expect(grade("=600000", restored)).toEqual(grade("=600000"));
  });
});

describe("chained checks", () => {
  const chained: FormulaSpreadsheetSpec = {
    workbook: { B2: 100, B3: 50 },
    checks: [
      {
        cell: "B5",
        label: "Sous-total",
        points: 10,
        expectedValue: 150,
        toleranceAbs: 0.5
      },
      {
        cell: "B6",
        label: "Double",
        points: 10,
        expectedValue: 300,
        toleranceAbs: 0.5
      }
    ],
    perturbations: [
      {
        name: "b2-revise",
        label: "B2 passe à 200",
        overrides: { B2: 200 },
        expected: { B5: 250, B6: 500 }
      }
    ]
  };

  it("grades each cell in isolation: a wrong B5 does not sink a right B6", () => {
    const result = spreadsheetFormulaEvaluator.evaluate(chained, {
      cells: {
        B5: { formula: "=B2-B3" }, // wrong: 50
        B6: { formula: "=B5*2" } // right method, evaluated against expected B5
      }
    });

    const b5 = result.criteria.filter((criterion) => criterion.id.startsWith("B5"));
    const b6 = result.criteria.filter((criterion) => criterion.id.startsWith("B6"));

    expect(b5.every((criterion) => criterion.awardedPoints === 0)).toBe(true);
    expect(b6.every((criterion) => criterion.outcome === "met")).toBe(true);
    expect(result.score).toBe(10);
  });
});

describe("specification validation", () => {
  function expectInvalid(mutate: (draft: FormulaSpreadsheetSpec) => void, message: RegExp) {
    const draft = JSON.parse(JSON.stringify(spec)) as FormulaSpreadsheetSpec;

    mutate(draft);
    expect(() => spreadsheetFormulaEvaluator.assertValidSpec(draft)).toThrow(message);
    expect(() => spreadsheetFormulaEvaluator.assertValidSpec(draft)).toThrow(
      InvalidEvaluationSpecError
    );
  }

  it("accepts the reference spec", () => {
    expect(() => spreadsheetFormulaEvaluator.assertValidSpec(spec)).not.toThrow();
  });

  it("refuses an empty workbook", () => {
    expectInvalid((draft) => {
      draft.workbook = {};
    }, /at least one given cell/);
  });

  it("refuses a formula among the given cells", () => {
    expectInvalid((draft) => {
      draft.workbook.B5 = "=B2+B3";
    }, /must be a value/);
  });

  it("refuses a check on a given cell", () => {
    expectInvalid((draft) => {
      draft.checks[0].cell = "B2";
    }, /both a given cell and a checked cell/);
  });

  it("refuses a spec with no perturbation at all", () => {
    expectInvalid((draft) => {
      draft.perturbations = [];
    }, /perturbation is required/);
  });

  it("refuses a perturbation that overrides a non-given cell", () => {
    expectInvalid((draft) => {
      draft.perturbations[0].overrides = { B12: 1 };
    }, /not a given cell/);
  });

  it("refuses a perturbation expecting a value for an unchecked cell", () => {
    expectInvalid((draft) => {
      draft.perturbations[0].expected = { ...draft.perturbations[0].expected, C9: 1 };
    }, /not a checked cell/);
  });

  it("refuses a check no perturbation covers", () => {
    expectInvalid((draft) => {
      draft.perturbations[0].expected = {};
    }, /would go undetected/);
  });

  it("refuses reference constraints that are not cells or ranges", () => {
    expectInvalid((draft) => {
      draft.checks[0].forbiddenRefs = ["nope"];
    }, /neither a cell nor a range/);
  });

  it("refuses unsupported function constraints", () => {
    expectInvalid((draft) => {
      draft.checks[0].requiredFunctions = ["VLOOKUP" as never];
    }, /unsupported function/);
  });
});
