import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FormulaParseError,
  MAX_AST_DEPTH,
  MAX_EVAL_STEPS,
  MAX_FORMULA_LENGTH,
  MAX_RANGE_CELLS,
  MAX_WORKBOOK_CELLS,
  WorkbookLimitError,
  compareCellKeys,
  evaluateWorkbook,
  formatFormula,
  getDependents,
  getPrecedents,
  isSpreadsheetError,
  parseFormula,
  profileFormula,
  type Scalar,
  type WorkbookInput
} from "../src";

/**
 * The bounded formula engine (PR-12b).
 *
 * The properties proved here are the ones the ADR sells: the grammar is closed,
 * French and English spellings collapse onto one canonical form, errors are
 * values, cycles are detected statically, recalculation is deterministic, and
 * every limit refuses loudly. The last block pins the security claim — no
 * arbitrary execution — both behaviourally and on the source text itself.
 */

function run(cells: WorkbookInput["cells"]): Map<string, Scalar> {
  const workbook = evaluateWorkbook({ cells });

  return new Map([...workbook.cells.entries()].map(([key, cell]) => [key, cell.value]));
}

function valueOf(cells: WorkbookInput["cells"], key: string): Scalar {
  return run(cells).get(key) ?? null;
}

function errorCode(value: Scalar): string | null {
  return isSpreadsheetError(value) ? value.code : null;
}

describe("the parser", () => {
  it("normalises French and English spellings onto one canonical form", () => {
    expect(formatFormula(parseFormula("=somme(b2:b13)"))).toBe("=SUM(B2:B13)");
    expect(formatFormula(parseFormula("=SOMME.SI(A2:A10;\"VENTES\";B2:B10)"))).toBe(
      '=SUMIF(A2:A10,"VENTES",B2:B10)'
    );
    expect(formatFormula(parseFormula("=SOMME.SI.ENS(D2:D9; A2:A9; \">=5\")"))).toBe(
      '=SUMIFS(D2:D9,A2:A9,">=5")'
    );
    expect(formatFormula(parseFormula("=si(B1>0;1;2)"))).toBe("=IF(B1>0,1,2)");
    expect(formatFormula(parseFormula("=MOYENNE(B2:B4)"))).toBe("=AVERAGE(B2:B4)");
  });

  it("treats `;` and `,` as the same argument separator", () => {
    const french = parseFormula("=SI(B1>=0;1;2)");
    const english = parseFormula("=IF(B1>=0,1,2)");

    expect(formatFormula(french)).toBe(formatFormula(english));
  });

  it("keeps absolute markers for display and drops them from the graph", () => {
    expect(formatFormula(parseFormula("=$B$2+B$3+$C4"))).toBe("=$B$2+B$3+$C4");
    expect(profileFormula(parseFormula("=$B$2+B2")).cellRefs).toEqual(["B2"]);
  });

  it("normalises a reversed range onto its top-left corner", () => {
    expect(profileFormula(parseFormula("=SUM(B10:B2)")).rangeRefs).toEqual(["B2:B10"]);
  });

  it("parses precedence and parentheses the spreadsheet way", () => {
    expect(valueOf({ A1: "=2+3*4" }, "A1")).toBe(14);
    expect(valueOf({ A1: "=(2+3)*4" }, "A1")).toBe(20);
    expect(valueOf({ A1: "=10-4-3" }, "A1")).toBe(3);
    expect(valueOf({ A1: "=-3+5" }, "A1")).toBe(2);
    expect(valueOf({ A1: "=2*-3" }, "A1")).toBe(-6);
  });

  it("round-trips its own canonical text", () => {
    for (const source of [
      "=B2-(B4+B5)",
      "=SUMIF(A2:A10,\"ACHATS\",B2:B10)",
      "=IF(B2=B3,\"OK\",\"ECART\")",
      "=-B2*(1+$B$1)",
      "=1.5+B2/B3"
    ]) {
      const canonical = formatFormula(parseFormula(source));

      expect(formatFormula(parseFormula(canonical))).toBe(canonical);
    }
  });

  it("refuses text outside the grammar, with a position", () => {
    for (const bad of ["=B2+", "=SUM(B2:B4", "=2..3", "=B2 B3", "=\"non fermé", "=@B2", "=A0"]) {
      expect(() => parseFormula(bad), bad).toThrow(FormulaParseError);
    }

    try {
      parseFormula("=B2+@");
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaParseError);
      expect((error as FormulaParseError).position).toBeGreaterThan(0);
    }
  });

  it("refuses identifiers that are neither references nor known functions", () => {
    expect(() => parseFormula("=INCONNU")).toThrow(/référence|fonction/i);
  });

  it("enforces the length limit before scanning anything", () => {
    const long = `=${"1+".repeat(MAX_FORMULA_LENGTH)}1`;

    expect(() => parseFormula(long)).toThrow(/trop longue/i);
  });

  it("enforces the nesting limit", () => {
    const deep = `=${"(".repeat(MAX_AST_DEPTH + 1)}1${")".repeat(MAX_AST_DEPTH + 1)}`;

    expect(() => parseFormula(deep)).toThrow(/imbriquée/i);
  });

  it("refuses references outside the sheet", () => {
    expect(() => parseFormula("=ZZ1")).toThrow(/limites de la feuille/i);
    expect(() => parseFormula("=A100000")).toThrow(/limites de la feuille/i);
  });
});

describe("evaluation", () => {
  it("propagates errors as values, never as exceptions", () => {
    const values = run({ A1: "=1/0", A2: "=A1+1", A3: "=SUM(A1:A2)" });

    expect(errorCode(values.get("A1") ?? null)).toBe("#DIV/0!");
    expect(errorCode(values.get("A2") ?? null)).toBe("#DIV/0!");
    expect(errorCode(values.get("A3") ?? null)).toBe("#DIV/0!");
  });

  it("returns #NAME? for an unknown function, naming the library", () => {
    const value = valueOf({ A1: "=TRUC(1)" }, "A1");

    expect(errorCode(value)).toBe("#NAME?");
    expect(isSpreadsheetError(value) ? value.message : "").toContain("SOMME.SI.ENS");
  });

  it("reads an empty cell as empty: zero in arithmetic, skipped by SUM", () => {
    expect(valueOf({ A1: "=B1+5" }, "A1")).toBe(5);
    expect(valueOf({ A1: "=SUM(B1:B3)" }, "A1")).toBe(0);
    expect(errorCode(valueOf({ A1: "=AVERAGE(B1:B3)" }, "A1"))).toBe("#DIV/0!");
  });

  it("coerces numeric-looking text and refuses the rest", () => {
    expect(valueOf({ A1: "5", B1: "=A1+1" }, "B1")).toBe(6);
    expect(errorCode(valueOf({ A1: "abc", B1: "=A1+1" }, "B1"))).toBe("#VALUE!");
  });

  it("ignores text inside a range but refuses it as a direct argument", () => {
    expect(valueOf({ A1: "libellé", A2: 2, A3: 3, B1: "=SUM(A1:A3)" }, "B1")).toBe(5);
    expect(errorCode(valueOf({ B1: '=SUM("abc")' }, "B1"))).toBe("#VALUE!");
  });

  it("evaluates IF lazily, so the untaken branch cannot error", () => {
    expect(valueOf({ A1: "=SI(B1>0;1;1/0)", B1: 1 }, "A1")).toBe(1);
    expect(valueOf({ A1: "=IF(1>2,1/0,7)" }, "A1")).toBe(7);
    // Two-argument form: the missing else is FALSE, as in Excel.
    expect(valueOf({ A1: "=IF(1>2,5)" }, "A1")).toBe(false);
  });

  it("compares with Excel's semantics: case-insensitive text, typed equality", () => {
    expect(valueOf({ A1: '=IF("ok"="OK",1,2)' }, "A1")).toBe(1);
    expect(valueOf({ A1: '=IF(1="1",1,2)' }, "A1")).toBe(2); // 1="1" is FALSE
    expect(valueOf({ A1: "=IF(B1=0,1,2)" }, "A1")).toBe(1); // empty = 0
    expect(valueOf({ A1: '=IF(B1="",1,2)' }, "A1")).toBe(1); // empty = ""
  });

  it("computes SUMIF with number, text and operator criteria", () => {
    const cells = {
      A1: "VENTES",
      A2: "ventes",
      A3: "ACHATS",
      B1: 100,
      B2: 200,
      B3: 300
    };

    expect(valueOf({ ...cells, C1: '=SUMIF(A1:A3,"VENTES",B1:B3)' }, "C1")).toBe(300);
    expect(valueOf({ ...cells, C1: '=SOMME.SI(B1:B3;">150")' }, "C1")).toBe(500);
    expect(valueOf({ ...cells, C1: '=SUMIF(B1:B3,"<>200")' }, "C1")).toBe(400);
    expect(valueOf({ ...cells, C1: "=SUMIF(B1:B3,200)" }, "C1")).toBe(200);
  });

  it("computes SUMIFS across aligned ranges and refuses misaligned ones", () => {
    const cells = {
      A1: "VENTES",
      A2: "VENTES",
      A3: "ACHATS",
      B1: "Lyon",
      B2: "Lille",
      B3: "Lyon",
      C1: 100,
      C2: 200,
      C3: 300
    };

    expect(
      valueOf({ ...cells, D1: '=SUMIFS(C1:C3,A1:A3,"VENTES",B1:B3,"Lyon")' }, "D1")
    ).toBe(100);
    expect(errorCode(valueOf({ ...cells, D1: '=SUMIFS(C1:C3,A1:A2,"VENTES")' }, "D1"))).toBe(
      "#VALUE!"
    );
  });

  it("refuses a bare range where a single value is expected", () => {
    expect(errorCode(valueOf({ A1: 1, A2: 2, B1: "=A1:A2+1" }, "B1"))).toBe("#VALUE!");
  });

  it("returns MIN/MAX over ranges, 0 when nothing is numeric", () => {
    expect(valueOf({ A1: 5, A2: 3, A3: 9, B1: "=MIN(A1:A3)" }, "B1")).toBe(3);
    expect(valueOf({ A1: 5, A2: 3, A3: 9, B1: "=MAX(A1:A3)" }, "B1")).toBe(9);
    expect(valueOf({ B1: "=MIN(C1:C3)" }, "B1")).toBe(0);
  });
});

describe("the dependency graph", () => {
  it("recalculates chains in dependency order whatever the key order", () => {
    const values = run({
      C1: "=B1*2",
      B1: "=A1+1",
      A1: 10
    });

    expect(values.get("B1")).toBe(11);
    expect(values.get("C1")).toBe(22);
  });

  it("bounds a large valid range by the populated cells, not by its corners", () => {
    // Review finding P2. `MAX_RANGE_CELLS` bounds *evaluation*; nothing bounded
    // the highlight expansion, so a formula the engine accepts — 30 ranges of
    // A1:BL9999 fit inside the 512-character limit — expanded to ~640 000 keys
    // on the UI thread every time a cell was selected, and froze the grid.
    // Column BK and below, so the formula in BL1 is not inside its own ranges
    // — that would be a cycle, and this test is about the expansion cost.
    const ranges = Array.from({ length: 30 }, () => "SUM(A1:BK9999)").join("+");
    const formula = `=${ranges}`;

    expect(formula.length).toBeLessThanOrEqual(MAX_FORMULA_LENGTH);

    const workbook = evaluateWorkbook({
      cells: { A1: 1, A2: 2, B1: 3, Z50: 4, BK9999: 5, BL1: formula }
    });

    const started = Date.now();
    const precedents = getPrecedents(workbook, "BL1");
    const elapsed = Date.now() - started;

    // Only the cells that exist: a coordinate with nothing behind it cannot be
    // highlighted, so enumerating it bought nothing.
    expect(precedents).toEqual(["A1", "B1", "A2", "Z50", "BK9999"].sort(compareCellKeys));
    expect(precedents.length).toBeLessThanOrEqual(MAX_WORKBOOK_CELLS);
    expect(elapsed).toBeLessThan(250);
  });

  it("exposes precedents and dependents, ranges expanded", () => {
    const workbook = evaluateWorkbook({
      cells: { A1: 1, A2: 2, B1: "=SUM(A1:A2)", C1: "=B1+A1" }
    });

    expect(getPrecedents(workbook, "B1")).toEqual(["A1", "A2"]);
    expect(getPrecedents(workbook, "C1")).toEqual(["A1", "B1"]);
    expect(getDependents(workbook, "A1")).toEqual(["B1", "C1"]);
  });

  it("flags a direct cycle on every member, with #CYCLE! values", () => {
    const workbook = evaluateWorkbook({ cells: { A1: "=A2+1", A2: "=A1+1" } });

    expect(workbook.cycles).toEqual([["A1", "A2"]]);
    expect(errorCode(workbook.cells.get("A1")?.value ?? null)).toBe("#CYCLE!");
    expect(errorCode(workbook.cells.get("A2")?.value ?? null)).toBe("#CYCLE!");
  });

  it("flags a self-reference, even inside the untaken branch of a SI", () => {
    // Static detection, exactly as Excel warns: the text references the cell,
    // whether or not this evaluation would have read it.
    const direct = evaluateWorkbook({ cells: { A1: "=A1+1" } });
    const hidden = evaluateWorkbook({ cells: { A1: "=IF(1>0,5,A1)" } });

    expect(direct.cycles).toEqual([["A1"]]);
    expect(hidden.cycles).toEqual([["A1"]]);
  });

  it("propagates #CYCLE! to cells that read the loop without joining it", () => {
    const workbook = evaluateWorkbook({
      cells: { A1: "=A2", A2: "=A1", B1: "=A1+1", C1: 7 }
    });

    expect(errorCode(workbook.cells.get("B1")?.value ?? null)).toBe("#CYCLE!");
    expect(workbook.cells.get("C1")?.value).toBe(7);
    expect(workbook.cycles).toHaveLength(1);
  });

  it("recalculates deterministically: same input, same output, same steps", () => {
    const cells = {
      A1: 10,
      A2: "=A1*2",
      A3: "=SUM(A1:A2)",
      B1: '=IF(A3>25,"haut","bas")'
    };

    const first = evaluateWorkbook({ cells });
    const second = evaluateWorkbook({ cells });

    expect([...first.cells.entries()]).toEqual([...second.cells.entries()]);
    expect(first.order).toEqual(second.order);
    expect(first.stepsUsed).toBe(second.stepsUsed);
  });
});

describe("the limits", () => {
  it("refuses a workbook with too many cells", () => {
    const cells: Record<string, number> = {};

    for (let row = 1; row <= MAX_WORKBOOK_CELLS + 1; row += 1) {
      cells[`A${row}`] = row;
    }

    expect(() => evaluateWorkbook({ cells })).toThrow(WorkbookLimitError);
  });

  it("refuses workbook keys that are not cell references", () => {
    // JSON.parse creates a real own "__proto__" property, the shape a hostile
    // payload would arrive in; an object literal would only set the prototype.
    const hostile = JSON.parse('{"__proto__": 1}') as Record<string, number>;

    expect(() => evaluateWorkbook({ cells: hostile })).toThrow(WorkbookLimitError);
    expect(() => evaluateWorkbook({ cells: { "not-a-ref": 1 } })).toThrow(WorkbookLimitError);
  });

  it("refuses a range wider than the cap with #REF!", () => {
    // BL9999 is in-sheet; A1:BL9999 spans far more than MAX_RANGE_CELLS.
    const value = valueOf({ A1: "=SUM(A2:BL9999)" }, "A1");

    expect(errorCode(value)).toBe("#REF!");
    expect(isSpreadsheetError(value) ? value.message : "").toContain(String(MAX_RANGE_CELLS));
  });

  it("stops at the evaluation budget with #LIMIT!, never by hanging", () => {
    // Enough SUMs over the biggest allowed range to exhaust MAX_EVAL_STEPS.
    const cells: Record<string, string | number> = {};
    const formulas = Math.ceil(MAX_EVAL_STEPS / MAX_RANGE_CELLS) + 2;

    for (let row = 1; row <= formulas; row += 1) {
      // A 64x64 block: exactly MAX_RANGE_CELLS cells per evaluation.
      cells[`BL${row + 100}`] = `=SUM(A1:BL64)`;
    }

    const workbook = evaluateWorkbook({ cells });
    const codes = [...workbook.cells.values()].map((cell) => errorCode(cell.value));

    expect(codes).toContain("#LIMIT!");
    expect(workbook.stepsUsed).toBeLessThanOrEqual(MAX_EVAL_STEPS);
  });
});

describe("no arbitrary execution", () => {
  it("treats attacker-shaped identifiers as unknown names, nothing more", () => {
    for (const source of [
      "=EVAL(\"1\")",
      "=FUNCTION(1)",
      "=CONSTRUCTOR(1)",
      "=__PROTO__(1)",
      "=REQUIRE(\"fs\")",
      "=FETCH(\"http://x\")",
      "=IMPORTSCRIPTS(1)"
    ]) {
      const value = valueOf({ A1: source }, "A1");

      expect(errorCode(value), source).toBe("#NAME?");
    }
  });

  it("cannot be reached through workbook values either", () => {
    // A formula-shaped string in a *value* cell stays text unless it starts
    // with `=`; a text criteria stays a criteria.
    expect(valueOf({ A1: "eval(1)", B1: "=A1" }, "B1")).toBe("eval(1)");
  });

  it("its source contains no dynamic-execution or I/O primitive", () => {
    // The behavioural tests above prove what the engine does on these inputs;
    // this one proves the capability is absent from the code itself, the same
    // discipline as the dataset-drift checks: assert the artefact, not the
    // intention.
    const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/spreadsheet");
    const forbidden = [
      /\beval\s*\(/,
      /new\s+Function/,
      /\bFunction\s*\(/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /child_process/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /\bWebSocket\b/,
      /process\.env/,
      /\bfs\b\s*\./,
      /Math\.random/,
      /Date\.now/
    ];

    for (const file of readdirSync(engineDir)) {
      const source = readFileSync(resolve(engineDir, file), "utf8");

      for (const pattern of forbidden) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });
});
