import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCEL_LAB_PACK_ID,
  EXCEL_LAB_TRACK,
  activeCurriculum,
  asterIndustrie,
  authoredExerciseVersions,
  canonicalLearningTracks,
  cash13Semaines,
  cleanErpExport,
  competencies,
  dcfAster,
  erpClean,
  erpExport,
  excelCaseStudies,
  excelLabAvanceCompetencies,
  excelLabAvanceDefinitions,
  excelLabAvanceExerciseVersions,
  excelLabAvanceExercises,
  excelLabAvanceLevels,
  excelLabAvanceSources,
  exercises,
  exportTresorerieVba,
  forecastDrivers,
  getAttemptEvidenceKinds,
  getExcelLabAvanceLevel,
  getModuleLevelForExercise,
  getModuleSourceReferences,
  getTrackLevels,
  gridInputRefs,
  gridWorkbook,
  isExcelCaseStudyExercise,
  labAssumptions,
  parseAsterCsv,
  parseCash13SemainesCsv,
  parseDcfCsv,
  parseErpExportCsv,
  parseForecastDriversCsv,
  type FormulaSpreadsheetSpec
} from "../src";

/**
 * Content integrity for the Excel lab N3/N4 (PR-12b).
 *
 * Same discipline as `excel-lab.test.ts`: the committed files and the typed
 * constants must say the same thing, and every figure a specification expects
 * is *derived* from the datasets here rather than restated — editing a CSV
 * without editing the answers fails in this file, not on a learner.
 */

const datasetsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../datasets/excel");

function readDataset(name: string): string {
  return readFileSync(resolve(datasetsDir, name), "utf8");
}

function specOf(exerciseId: string): FormulaSpreadsheetSpec {
  const version = excelLabAvanceExerciseVersions.find(
    (candidate) => candidate.exerciseId === exerciseId
  );

  if (!version) {
    throw new Error(`No authored version for "${exerciseId}".`);
  }

  return version.spec as FormulaSpreadsheetSpec;
}

function expectedOf(exerciseId: string, cell: string): number | string {
  const check = specOf(exerciseId).checks.find((candidate) => candidate.cell === cell);

  if (!check) {
    throw new Error(`No check on ${cell} in "${exerciseId}".`);
  }

  return check.expectedValue;
}

describe("the committed datasets", () => {
  it("parse, and equal the constants the app actually runs on", () => {
    expect(parseErpExportCsv(readDataset("erp_export.csv"))).toEqual(erpExport);
    expect(parseForecastDriversCsv(readDataset("forecast_drivers.csv"))).toEqual(forecastDrivers);
    expect(parseCash13SemainesCsv(readDataset("cash_13_semaines.csv"))).toEqual(cash13Semaines);
    expect(parseAsterCsv(readDataset("aster_industrie.csv"))).toEqual(asterIndustrie);
    expect(parseDcfCsv(readDataset("dcf_aster.csv"))).toEqual(dcfAster);
  });

  it("keeps the VBA module in step with its constant — displayed, never executed", () => {
    expect(readDataset("vba/export_tresorerie.bas").replace(/\r\n/g, "\n")).toBe(
      exportTresorerieVba
    );
  });

  it("keeps the weekly opening balance in the assumptions file", () => {
    const assumptions = JSON.parse(readDataset("assumptions.json")) as {
      tresorerieOuvertureHebdo: number;
    };

    expect(assumptions.tresorerieOuvertureHebdo).toBe(labAssumptions.tresorerieOuvertureHebdo);
  });

  it("carries exactly the defects the diagnostic exercise teaches", () => {
    // One duplicated piece, two space-grouped amounts, three spellings of the
    // sales family. These are content, so they are pinned: cleaning the CSV
    // would silently turn the diagnostic into a trick question.
    const pieces = erpExport.map((line) => line.piece);

    expect(pieces.length - new Set(pieces).size).toBe(1);
    expect(erpExport.filter((line) => /\s/.test(line.montant))).toHaveLength(2);
    expect(new Set(erpExport.map((line) => line.famille)).size).toBeGreaterThan(
      new Set(erpExport.map((line) => line.famille.toUpperCase())).size
    );
  });
});

describe("the cleaned export", () => {
  it("is derived from the raw export by the committed cleaning rules", () => {
    expect(cleanErpExport(erpExport)).toEqual(erpClean);
    expect(erpClean).toHaveLength(erpExport.length - 1); // the duplicate dropped
    expect(erpClean.every((line) => Number.isFinite(line.montant))).toBe(true);
    expect(erpClean.every((line) => line.famille === line.famille.toUpperCase())).toBe(true);
  });

  it("throws on an amount even the cleaning rules cannot read", () => {
    expect(() =>
      cleanErpExport([{ piece: "X", famille: "VENTES", libelle: "x", montant: "n/a" }])
    ).toThrow(/illisible/i);
  });
});

describe("every expected figure is derived from the datasets", () => {
  it("family totals follow the cleaned export", () => {
    const total = (famille: string) =>
      erpClean.filter((line) => line.famille === famille).reduce((sum, line) => sum + line.montant, 0);

    expect(expectedOf("ex-xl-n3-tri-familles", "B12")).toBe(total("VENTES"));
    expect(expectedOf("ex-xl-n3-tri-familles", "B13")).toBe(total("ACHATS"));
  });

  it("the forecast P&L totals follow the drivers", () => {
    const charges = forecastDrivers.slice(1).reduce((sum, line) => sum + line.realiseN, 0);
    const resultat = forecastDrivers.reduce((sum, line) => sum + line.realiseN, 0);

    expect(expectedOf("ex-xl-n3-modele-pnl", "B8")).toBe(charges);
    expect(expectedOf("ex-xl-n3-modele-pnl", "B9")).toBe(resultat);
  });

  it("the revenue forecast follows the growth driver", () => {
    const ca = forecastDrivers[0];

    expect(expectedOf("ex-xl-n3-forecast-croissance", "C3")).toBeCloseTo(
      ca.realiseN * (1 + ca.tauxCroissance),
      6
    );
  });

  it("the thirteen-week totals, first balances and positions follow the CSV", () => {
    const encaissements = cash13Semaines.reduce((sum, line) => sum + line.encaissements, 0);
    const decaissements = cash13Semaines.reduce((sum, line) => sum + line.decaissements, 0);

    expect(expectedOf("ex-xl-n3-treso-totaux", "B15")).toBe(encaissements);
    expect(expectedOf("ex-xl-n3-treso-totaux", "C15")).toBe(decaissements);

    const opening = labAssumptions.tresorerieOuvertureHebdo;
    const s1 = cash13Semaines[0];
    const s2 = cash13Semaines[1];
    const soldeS1 = s1.encaissements - s1.decaissements;
    const soldeS2 = s2.encaissements - s2.decaissements;

    expect(expectedOf("ex-xl-n3-treso-solde", "D3")).toBe(soldeS1);
    expect(expectedOf("ex-xl-n3-treso-solde", "E3")).toBe(opening + soldeS1);
    expect(expectedOf("ex-xl-n3-treso-solde", "E4")).toBe(opening + soldeS1 + soldeS2);
  });

  it("the coherence control matches the sales total it verifies", () => {
    const spec = specOf("ex-xl-n3-controle-coherence");
    const ventes = erpClean
      .filter((line) => line.famille === "VENTES")
      .reduce((sum, line) => sum + line.montant, 0);

    expect(spec.workbook.B2).toBe(ventes);
    expect(spec.workbook.B3).toBe(ventes);
    expect(expectedOf("ex-xl-n3-controle-coherence", "B5")).toBe("OK");
    expect(expectedOf("ex-xl-n3-controle-coherence", "B6")).toBe(0);
  });

  it("the FCF cascade follows the Aster data, and feeds the DCF's first flow", () => {
    const value = (poste: string) =>
      asterIndustrie.find((line) => line.poste === poste)?.valeur ?? Number.NaN;
    const apresImpot = value("Resultat d'exploitation") * (1 - value("Taux d'imposition"));
    const fcf =
      apresImpot +
      value("Dotations aux amortissements") -
      value("Investissements") -
      value("Variation du BFR");

    expect(expectedOf("ex-xl-n4-trois-etats", "B8")).toBe(apresImpot);
    expect(expectedOf("ex-xl-n4-trois-etats", "B9")).toBe(fcf);
    // The valuation case is one model: year 1 of the plan is the derived FCF.
    expect(dcfAster[0].fcf).toBe(fcf);
  });

  it("the WACC follows the Aster financing structure", () => {
    const value = (poste: string) =>
      asterIndustrie.find((line) => line.poste === poste)?.valeur ?? Number.NaN;
    const total = value("Dette financiere") + value("Capitaux propres");
    const poidsCp = value("Capitaux propres") / total;
    const wacc =
      poidsCp * value("Cout des capitaux propres") +
      (1 - poidsCp) * value("Cout de la dette") * (1 - value("Taux d'imposition"));

    expect(expectedOf("ex-xl-n4-wacc", "B8")).toBe(poidsCp);
    expect(expectedOf("ex-xl-n4-wacc", "B9")).toBeCloseTo(wacc, 10);
  });

  it("the discount coefficients are 1/(1+WACC)^n rounded to three decimals", () => {
    // The engine has no power operator on purpose; the coefficients are data.
    // This is where their provenance is asserted instead.
    for (const line of dcfAster) {
      expect(line.coefficient, `année ${line.annee}`).toBe(
        Math.round((1 / Math.pow(1.069, line.annee)) * 1000) / 1000
      );
    }
  });

  it("the discounted values and their sum follow the plan", () => {
    const pv1 = dcfAster[0].fcf * dcfAster[0].coefficient;
    const total = dcfAster.reduce((sum, line) => sum + line.fcf * line.coefficient, 0);

    expect(expectedOf("ex-xl-n4-dcf-actualisation", "D2")).toBeCloseTo(pv1, 6);
    expect(expectedOf("ex-xl-n4-dcf-actualisation", "D7")).toBeCloseTo(total, 6);

    // The given cells of the grid are the other years' discounted values.
    const spec = specOf("ex-xl-n4-dcf-actualisation");

    for (const [index, line] of dcfAster.slice(1).entries()) {
      expect(spec.workbook[`D${index + 3}`], `D${index + 3}`).toBeCloseTo(
        line.fcf * line.coefficient,
        6
      );
    }
  });

  it("the terminal value and its sensitivity follow Gordon-Shapiro", () => {
    const value = (poste: string) =>
      asterIndustrie.find((line) => line.poste === poste)?.valeur ?? Number.NaN;
    const fcf5 = dcfAster[4].fcf;
    const growth = value("Croissance long terme");
    const wacc = 0.069; // derived and asserted in the WACC test above
    const tv = (fcf5 * (1 + growth)) / (wacc - growth);
    const tvDegraded = (fcf5 * (1 + growth)) / (wacc + 0.01 - growth);

    expect(expectedOf("ex-xl-n4-valeur-terminale", "B6")).toBeCloseTo(tv, 1);
    expect(expectedOf("ex-xl-n4-sensibilite", "B7")).toBeCloseTo(tv, 1);
    expect(expectedOf("ex-xl-n4-sensibilite", "B8")).toBeCloseTo(tvDegraded, 1);
    expect(expectedOf("ex-xl-n4-sensibilite", "B9")).toBeCloseTo(tvDegraded / tv - 1, 4);
  });

  it("the debt schedule follows the Aster data", () => {
    const value = (poste: string) =>
      asterIndustrie.find((line) => line.poste === poste)?.valeur ?? Number.NaN;

    expect(expectedOf("ex-xl-n4-dette", "B6")).toBeCloseTo(
      value("Dette financiere") * value("Cout de la dette"),
      6
    );
    expect(expectedOf("ex-xl-n4-dette", "B7")).toBe(
      value("Dette financiere") - value("Remboursement annuel de la dette")
    );
  });
});

describe("the module inventory", () => {
  it("ships sixteen exercises, eight per level", () => {
    expect(excelLabAvanceExercises).toHaveLength(16);
    expect(excelLabAvanceExercises.filter((exercise) => exercise.level === 3)).toHaveLength(8);
    expect(excelLabAvanceExercises.filter((exercise) => exercise.level === 4)).toHaveLength(8);
  });

  it("uses unique ids that reach the shared catalogue exactly once", () => {
    const ids = excelLabAvanceExercises.map((exercise) => exercise.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(exercises.filter((exercise) => exercise.id === id), id).toHaveLength(1);
      // The canonical-track resolver keys on this prefix; an id outside it
      // would grade but never move progression.
      expect(id.startsWith("ex-xl-"), id).toBe(true);
    }
  });

  it("covers the brief: ERP cleaning, forecast, coherence, LET, three statements, DCF, WACC, debt, sensitivity, audit, VBA", () => {
    const titles = excelLabAvanceExercises.map((exercise) => exercise.title.toLowerCase()).join(" | ");

    for (const theme of [
      "erp",
      "prevision",
      "coherence",
      "let",
      "flux",
      "wacc",
      "actualisation",
      "terminale",
      "dette",
      "sensibilite",
      "audit",
      "vba"
    ]) {
      expect(titles, `no exercise covers "${theme}"`).toContain(theme);
    }
  });

  it("attaches every exercise to a published level and to the module registry", () => {
    const levelIds = new Set(
      getTrackLevels(activeCurriculum, EXCEL_LAB_TRACK).map((level) => level.id)
    );

    for (const exercise of excelLabAvanceExercises) {
      const levelId = getExcelLabAvanceLevel(exercise.id);

      expect(levelId, exercise.id).not.toBeNull();
      expect(levelIds.has(levelId as string), `${exercise.id} → ${levelId}`).toBe(true);
      expect(getModuleLevelForExercise(exercise.id), exercise.id).toBe(levelId);
    }
  });

  it("declares its competencies in the taxonomy, and only targets declared ones", () => {
    const known = new Set(competencies.map((competency) => competency.id));
    const targeted = new Set(excelLabAvanceLevels.flatMap((level) => level.competencyIds));

    for (const competency of excelLabAvanceCompetencies) {
      expect(known.has(competency.id), competency.id).toBe(true);
    }

    for (const exercise of excelLabAvanceExercises) {
      expect(exercise.competencyIds.length, exercise.id).toBeGreaterThan(0);

      for (const competencyId of exercise.competencyIds) {
        expect(targeted.has(competencyId), `${exercise.id} → ${competencyId}`).toBe(true);
      }
    }
  });

  it("registers a diagnostic for each new level in the canonical track", () => {
    const track = canonicalLearningTracks.find((candidate) => candidate.trackId === EXCEL_LAB_TRACK);

    expect(track?.diagnosticExerciseIds["level-excel-finance-3"]).toBe(
      "ex-xl-n3-controle-coherence"
    );
    expect(track?.diagnosticExerciseIds["level-excel-finance-4"]).toBe("ex-xl-n4-audit-modele");
  });
});

describe("the authored versions", () => {
  it("give every exercise exactly one version, engine-graded or QCM", () => {
    expect(excelLabAvanceExerciseVersions).toHaveLength(excelLabAvanceExercises.length);

    for (const definition of excelLabAvanceDefinitions) {
      const versions = authoredExerciseVersions.filter(
        (version) => version.exerciseId === definition.exercise.id
      );

      expect(versions, definition.exercise.id).toHaveLength(1);
      expect(versions[0].evaluationType, definition.exercise.id).toBe(
        definition.kind === "formula-grid" ? "spreadsheet_formula" : "multiple_choice"
      );
    }
  });

  it("ship a golden case that fails as well as one that passes", () => {
    for (const version of excelLabAvanceExerciseVersions) {
      const scores = version.testCases.map((testCase) => testCase.expectedScore);

      expect(scores, `${version.exerciseId} has no perfect case`).toContain(20);
      expect(
        scores.some((score) => score < 20),
        `${version.exerciseId} has no failing case`
      ).toBe(true);
    }
  });

  it("derive each engine workbook from the displayed grid, never restate it", () => {
    for (const definition of excelLabAvanceDefinitions) {
      if (definition.kind !== "formula-grid" || !definition.grid) {
        continue;
      }

      const spec = specOf(definition.exercise.id);

      expect(spec.workbook, definition.exercise.id).toEqual(gridWorkbook(definition.grid));
    }
  });

  it("check exactly the cells the grid opens for input", () => {
    for (const definition of excelLabAvanceDefinitions) {
      if (definition.kind !== "formula-grid" || !definition.grid) {
        continue;
      }

      const spec = specOf(definition.exercise.id);
      const specCells = spec.checks.map((check) => check.cell.toUpperCase()).sort();

      expect(gridInputRefs(definition.grid).sort(), definition.exercise.id).toEqual(specCells);
    }
  });

  it("give every grid row the width of its header", () => {
    for (const definition of excelLabAvanceDefinitions) {
      if (!definition.grid) {
        continue;
      }

      for (const [index, row] of definition.grid.rows.entries()) {
        expect(row.length, `${definition.exercise.id} row ${index + 2}`).toBe(
          definition.grid.columns.length
        );
      }
    }
  });
});

describe("the case studies", () => {
  it("exist for both briefs: thirteen-week cash and the Aster DCF", () => {
    expect(excelCaseStudies.map((caseStudy) => caseStudy.slug).sort()).toEqual([
      "dcf-aster-industrie",
      "tresorerie-13-semaines"
    ]);
  });

  it("reuse level exercises as steps, on the level each case belongs to", () => {
    for (const caseStudy of excelCaseStudies) {
      expect(caseStudy.steps.length).toBeGreaterThanOrEqual(5);

      for (const step of caseStudy.steps) {
        const exercise = excelLabAvanceExercises.find((item) => item.id === step.exerciseId);

        expect(exercise, `${caseStudy.slug} → ${step.exerciseId}`).toBeDefined();
        expect(getExcelLabAvanceLevel(step.exerciseId), step.exerciseId).toBe(caseStudy.levelId);
        expect(
          caseStudy.documents.some((document) => document.id === step.documentId),
          `${caseStudy.slug} → ${step.documentId}`
        ).toBe(true);
        expect(isExcelCaseStudyExercise(step.exerciseId)).toBe(true);
      }
    }
  });

  it("close each case on the level's diagnostic exercise", () => {
    const track = canonicalLearningTracks.find((candidate) => candidate.trackId === EXCEL_LAB_TRACK);

    for (const caseStudy of excelCaseStudies) {
      expect(caseStudy.steps.at(-1)?.exerciseId, caseStudy.slug).toBe(
        track?.diagnosticExerciseIds[caseStudy.levelId]
      );
    }
  });

  it("earns case-study and final-diagnostic evidence on the closing step", () => {
    for (const caseStudy of excelCaseStudies) {
      const closing = caseStudy.steps.at(-1)?.exerciseId as string;
      const kinds = getAttemptEvidenceKinds({
        exerciseId: closing,
        levelId: caseStudy.levelId,
        context: "case_study"
      });

      expect(kinds).toContain("caseStudy");
      expect(kinds).toContain("finalDiagnostic");
    }
  });

  it("downgrades a case-study claim on an exercise no case contains", () => {
    const kinds = getAttemptEvidenceKinds({
      exerciseId: "ex-xl-n4-vba-lecture",
      levelId: "level-excel-finance-4",
      context: "case_study"
    });

    expect(kinds).toContain("direct");
    expect(kinds).not.toContain("caseStudy");
  });
});

describe("sources", () => {
  it("cites only files that exist in this repository, with no invented pages", () => {
    expect(excelLabAvanceSources.length).toBeGreaterThan(0);

    for (const source of excelLabAvanceSources) {
      const file = source.document.split(" — ")[0];

      expect(file.startsWith("datasets/excel/"), source.document).toBe(true);
      expect(existsSync(resolve(datasetsDir, "../..", file)), file).toBe(true);
      expect(source.pageStart, source.document).toBeUndefined();
      expect(source.pageEnd, source.document).toBeUndefined();
      expect(source.pack).toBe(EXCEL_LAB_PACK_ID);
    }
  });

  it("reaches an N3/N4 correction through the module registry", () => {
    for (const exercise of excelLabAvanceExercises) {
      expect(getModuleSourceReferences(exercise.id), exercise.id).toEqual(excelLabAvanceSources);
    }
  });
});

describe("honest limits", () => {
  it("says in the statements that Power Query, LET and VBA are never executed", () => {
    const diagnostic = excelLabAvanceExercises.find(
      (exercise) => exercise.id === "ex-xl-n3-erp-diagnostic"
    );
    const lecture = excelLabAvanceExercises.find(
      (exercise) => exercise.id === "ex-xl-n3-let-lecture"
    );
    const vba = excelLabAvanceExercises.find(
      (exercise) => exercise.id === "ex-xl-n4-vba-lecture"
    );

    expect(diagnostic?.statement).toContain("n'execute pas Power Query");
    expect(lecture?.statement).toContain("ne l'execute pas");
    expect(vba?.statement).toContain("n'execute jamais de macro");
  });

  it("keeps every grid input reachable by the submission cap", () => {
    for (const definition of excelLabAvanceDefinitions) {
      if (definition.grid) {
        expect(gridInputRefs(definition.grid).length, definition.exercise.id).toBeLessThanOrEqual(40);
      }
    }
  });
});
