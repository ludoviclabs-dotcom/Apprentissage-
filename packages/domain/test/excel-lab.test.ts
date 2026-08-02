import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCEL_LAB_TRACK,
  InvalidCsvError,
  activeCurriculum,
  authoredExerciseVersions,
  budgetVsActual,
  cashForecast,
  cellRef,
  columnLetter,
  competencies,
  excelLabCompetencies,
  excelLabDefinitions,
  excelLabExerciseVersions,
  excelLabExercises,
  excelLabLevels,
  exercises,
  getExcelLabDefinition,
  getExcelLabExercises,
  getExcelLabLevel,
  getEvaluator,
  getModuleLevelForExercise,
  getTrackLevels,
  gridInputRefs,
  labAssumptions,
  monthlyPnl,
  parseBudgetCsv,
  parseCashForecastCsv,
  parseCsv,
  parsePnlCsv
} from "../src";

/**
 * Content integrity for the Excel Finance Lab.
 *
 * Grading behaviour is covered by `evaluators-spreadsheet.test.ts` and by the
 * golden cases every authored version ships. What is proved here is the wiring
 * nothing else would catch — and, first, that the committed CSV files and the
 * typed constants say the same thing.
 */

const datasetsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../datasets/excel");

function readDataset(name: string): string {
  return readFileSync(resolve(datasetsDir, name), "utf8");
}

const EXPECTED_COUNT = 10;

describe("the committed datasets", () => {
  it("parse, and equal the constants the app actually runs on", () => {
    // The CSV is the versioned artefact and the constant is its runtime form.
    // Keeping both invites drift, so this is the check that makes drift fail
    // here rather than silently re-grade somebody.
    expect(parsePnlCsv(readDataset("monthly_pnl.csv"))).toEqual(monthlyPnl);
    expect(parseCashForecastCsv(readDataset("cash_forecast.csv"))).toEqual(cashForecast);
    expect(parseBudgetCsv(readDataset("budget_vs_actual.csv"))).toEqual(budgetVsActual);
  });

  it("keeps the assumptions file in step with its constant", () => {
    const assumptions = JSON.parse(readDataset("assumptions.json")) as {
      exercice: string;
      devise: string;
      tresorerieOuverture: number;
    };

    expect(assumptions.exercice).toBe(labAssumptions.exercice);
    expect(assumptions.devise).toBe(labAssumptions.devise);
    expect(assumptions.tresorerieOuverture).toBe(labAssumptions.tresorerieOuverture);
  });

  it("contains no comma inside a field, which the reader could not represent", () => {
    for (const name of ["monthly_pnl.csv", "cash_forecast.csv", "budget_vs_actual.csv"]) {
      const lines = readDataset(name).trim().split(/\r?\n/);
      const width = lines[0].split(",").length;

      for (const [index, line] of lines.entries()) {
        expect(line.split(",").length, `${name} line ${index + 1}`).toBe(width);
      }
    }
  });
});

describe("the CSV reader", () => {
  it("reads a header and typed rows", () => {
    const parsed = parseCsv("a,b\n1,2\n3,4");

    expect(parsed.columns).toEqual(["a", "b"]);
    expect(parsed.rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" }
    ]);
  });

  it("ignores blank lines and trailing newlines", () => {
    expect(parseCsv("a,b\n\n1,2\n").rows).toHaveLength(1);
  });

  it("refuses a short row rather than padding it", () => {
    // A padded row becomes an empty cell, and an empty cell in a P&L is a figure
    // the learner would be marked wrong for not inventing.
    expect(() => parseCsv("a,b\n1")).toThrow(InvalidCsvError);
    expect(() => parseCsv("a,b\n1,2,3")).toThrow(/3 fields, expected 2/);
  });

  it("refuses an empty document", () => {
    expect(() => parseCsv("   ")).toThrow(InvalidCsvError);
  });

  it("names the column when a number is not one", () => {
    expect(() => parsePnlCsv("ligne,libelle,montant\n1,Ventes,abc")).toThrow(/"montant"/);
  });
});

describe("A1 references", () => {
  it("maps column indices to letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(4)).toBe("E");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });

  it("builds a reference from a column and a one-based row", () => {
    expect(cellRef(1, 12)).toBe("B12");
    expect(cellRef(3, 5)).toBe("D5");
  });
});

describe("the module inventory", () => {
  it("ships between 8 and 10 exercises, the scope this lab was sized for", () => {
    expect(excelLabExercises).toHaveLength(EXPECTED_COUNT);
    expect(excelLabExercises.length).toBeGreaterThanOrEqual(8);
    expect(excelLabExercises.length).toBeLessThanOrEqual(10);
  });

  it("uses unique ids that reach the shared catalogue exactly once", () => {
    const ids = excelLabExercises.map((exercise) => exercise.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(exercises.filter((exercise) => exercise.id === id), id).toHaveLength(1);
    }
  });

  it("covers each of the five themes the brief asks for", () => {
    const titles = excelLabExercises.map((exercise) => exercise.title.toLowerCase()).join(" | ");

    for (const theme of ["chiffre d'affaires", "marge", "excedent brut", "tresorerie", "ecart"]) {
      expect(titles, `no exercise covers "${theme}"`).toContain(theme);
    }
  });

  it("splits the exercises across both levels", () => {
    expect(getExcelLabExercises(1)).toHaveLength(5);
    expect(getExcelLabExercises(2)).toHaveLength(5);
  });

  it("attaches every exercise to a level of its own track, and to the registry", () => {
    const levelIds = new Set(
      getTrackLevels(activeCurriculum, EXCEL_LAB_TRACK).map((level) => level.id)
    );

    for (const exercise of excelLabExercises) {
      const levelId = getExcelLabLevel(exercise.id);

      expect(levelId, exercise.id).not.toBeNull();
      expect(levelIds.has(levelId as string), `${exercise.id} → ${levelId}`).toBe(true);
      // The registry is what `submitAttempt` consults; a module wired into one
      // and not the other would grade but move no progression.
      expect(getModuleLevelForExercise(exercise.id), exercise.id).toBe(levelId);
    }

    expect(getExcelLabLevel("ex-does-not-exist")).toBeNull();
    expect(getModuleLevelForExercise("ex-does-not-exist")).toBeNull();
  });

  it("does not disturb the modules already registered", () => {
    expect(getModuleLevelForExercise("ex-cgv1-achat-marchandises")).toBe(
      "level-compta-generale-v1-1"
    );
  });

  it("targets only competencies its levels declare", () => {
    const known = new Set(competencies.map((competency) => competency.id));
    const targeted = new Set(excelLabLevels.flatMap((level) => level.competencyIds));

    for (const competency of excelLabCompetencies) {
      expect(known.has(competency.id), competency.id).toBe(true);
    }

    for (const exercise of excelLabExercises) {
      expect(exercise.competencyIds.length, exercise.id).toBeGreaterThan(0);

      for (const competencyId of exercise.competencyIds) {
        expect(targeted.has(competencyId), `${exercise.id} → ${competencyId}`).toBe(true);
      }
    }
  });

  it("gates the lab track on two contiguous levels", () => {
    const levels = getTrackLevels(activeCurriculum, EXCEL_LAB_TRACK);

    expect(levels.map((level) => level.level)).toEqual([1, 2]);

    for (const level of levels) {
      expect(level.criticalCompetencyIds.length, level.id).toBeGreaterThan(0);
    }
  });
});

describe("every exercise is graded by the spreadsheet evaluator", () => {
  it("has exactly one authored version, and none falls back to the rubric matcher", () => {
    expect(excelLabExerciseVersions).toHaveLength(EXPECTED_COUNT);

    for (const exercise of excelLabExercises) {
      const versions = authoredExerciseVersions.filter(
        (version) => version.exerciseId === exercise.id
      );

      expect(versions, exercise.id).toHaveLength(1);
      expect(versions[0].evaluationType, exercise.id).toBe("spreadsheet");
    }
  });

  it("ships specifications the evaluator accepts", () => {
    for (const version of excelLabExerciseVersions) {
      expect(
        () => getEvaluator("spreadsheet").assertValidSpec(version.spec as never),
        version.exerciseId
      ).not.toThrow();
    }
  });

  it("ships a golden case that fails as well as one that passes", () => {
    for (const version of excelLabExerciseVersions) {
      const scores = version.testCases.map((testCase) => testCase.expectedScore);

      expect(scores, `${version.exerciseId} has no perfect case`).toContain(20);
      expect(
        scores.some((score) => score < 20),
        `${version.exerciseId} has no failing case`
      ).toBe(true);
    }
  });

  it("requires a formula wherever the grid says it wants one", () => {
    for (const definition of excelLabDefinitions) {
      const version = excelLabExerciseVersions.find(
        (candidate) => candidate.exerciseId === definition.exercise.id
      );
      const checks = (version?.spec as { checks: Array<{ cell: string; requiredFormulaPattern?: string }> })
        .checks;
      const byCell = new Map(checks.map((check) => [check.cell.toUpperCase(), check]));

      for (const [rowIndex, row] of definition.grid.rows.entries()) {
        for (const [columnIndex, cell] of row.entries()) {
          if (cell.kind !== "input") {
            continue;
          }

          const ref = cellRef(columnIndex, rowIndex + 2);
          const check = byCell.get(ref);

          // A grid that offers a formula box the spec never reads would ask for
          // work that cannot earn anything; the reverse would demand a formula
          // with nowhere to type it.
          expect(Boolean(check?.requiredFormulaPattern), `${definition.exercise.id} ${ref}`).toBe(
            cell.wantsFormula
          );
        }
      }
    }
  });
});

describe("the grids", () => {
  it("declare exactly the cells their specification checks", () => {
    for (const definition of excelLabDefinitions) {
      const version = excelLabExerciseVersions.find(
        (candidate) => candidate.exerciseId === definition.exercise.id
      );
      const specCells = (version?.spec as { checks: Array<{ cell: string }> }).checks
        .map((check) => check.cell.toUpperCase())
        .sort();

      expect(gridInputRefs(definition.grid).sort(), definition.exercise.id).toEqual(specCells);
    }
  });

  it("give every row the same width as its header", () => {
    for (const definition of excelLabDefinitions) {
      for (const [index, row] of definition.grid.rows.entries()) {
        expect(row.length, `${definition.exercise.id} row ${index + 2}`).toBe(
          definition.grid.columns.length
        );
      }
    }
  });

  it("render the dataset read-only, so the given figures cannot be edited away", () => {
    const pnl = getExcelLabDefinition("ex-xl-chiffre-affaires");

    expect(pnl).not.toBeNull();
    // Rows 2–10 are the dataset; the first input must come after them.
    expect(gridInputRefs(pnl!.grid)).toEqual(["B12"]);

    for (const line of monthlyPnl) {
      const row = pnl!.grid.rows[line.ligne - 1];

      expect(row[0]).toEqual({ kind: "label", text: line.libelle });
      expect(row[1]).toEqual({ kind: "given", value: line.montant });
    }
  });

  it("keeps every exercise's answer consistent with the dataset it is built on", () => {
    // The figures the specs expect are derived here from the CSV, not restated,
    // so editing a dataset without editing the answers fails.
    const pnl = new Map(monthlyPnl.map((line) => [line.libelle, line.montant]));
    const ca = (pnl.get("Ventes de marchandises") ?? 0) + (pnl.get("Production vendue de services") ?? 0);
    const camv =
      (pnl.get("Achats de marchandises") ?? 0) + (pnl.get("Variation de stock de marchandises") ?? 0);
    const marge = (pnl.get("Ventes de marchandises") ?? 0) - camv;
    const va = marge + (pnl.get("Production vendue de services") ?? 0) - (pnl.get("Autres achats et charges externes") ?? 0);
    const ebe =
      va +
      (pnl.get("Subventions d exploitation") ?? 0) -
      (pnl.get("Impots taxes et versements assimiles") ?? 0) -
      (pnl.get("Charges de personnel") ?? 0);

    const expected: Record<string, number> = {
      "ex-xl-chiffre-affaires": ca,
      "ex-xl-cout-achat-vendues": camv,
      "ex-xl-marge-commerciale": marge,
      "ex-xl-valeur-ajoutee": va,
      "ex-xl-ebe": ebe,
      "ex-xl-resultat-exploitation": ebe - (pnl.get("Dotations aux amortissements") ?? 0)
    };

    for (const [exerciseId, value] of Object.entries(expected)) {
      const version = excelLabExerciseVersions.find(
        (candidate) => candidate.exerciseId === exerciseId
      );
      const check = (version?.spec as { checks: Array<{ expectedValue?: number }> }).checks[0];

      expect(check.expectedValue, exerciseId).toBe(value);
    }
  });

  it("keeps the cash and budget answers consistent with their datasets too", () => {
    const encaissements = cashForecast.reduce((sum, line) => sum + line.encaissements, 0);
    const decaissements = cashForecast.reduce((sum, line) => sum + line.decaissements, 0);
    const totals = excelLabExerciseVersions.find(
      (version) => version.exerciseId === "ex-xl-cash-totaux"
    );
    const closing = excelLabExerciseVersions.find(
      (version) => version.exerciseId === "ex-xl-cash-solde-final"
    );
    const variance = excelLabExerciseVersions.find(
      (version) => version.exerciseId === "ex-xl-budget-ecart"
    );

    const totalChecks = (totals?.spec as { checks: Array<{ expectedValue?: number }> }).checks;
    expect(totalChecks[0].expectedValue).toBe(encaissements);
    expect(totalChecks[1].expectedValue).toBe(decaissements);

    const closingChecks = (closing?.spec as { checks: Array<{ expectedValue?: number }> }).checks;
    expect(closingChecks[0].expectedValue).toBe(encaissements - decaissements);
    expect(closingChecks[1].expectedValue).toBe(
      labAssumptions.tresorerieOuverture + encaissements - decaissements
    );

    const achats = budgetVsActual[0];
    const varianceChecks = (variance?.spec as { checks: Array<{ expectedValue?: number }> }).checks;
    expect(varianceChecks[0].expectedValue).toBe(achats.reel - achats.budget);
    expect(varianceChecks[1].expectedValue).toBe(
      Math.round(((achats.reel - achats.budget) / achats.budget) * 100 * 100) / 100
    );
  });
});
