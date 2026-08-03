import {
  EXCEL_LAB_TRACK,
  activeCurriculum,
  asterIndustrie,
  budgetVsActual,
  cash13Semaines,
  cashForecast,
  dcfAster,
  erpExport,
  excelCaseStudies,
  excelLabDefinitions,
  forecastDrivers,
  getExcelCaseStudyBySlug,
  getExcelLabAvanceDefinition,
  getExcelLabDefinition,
  getTrackLevels,
  labAssumptions,
  monthlyPnl,
  type AvanceExerciseDefinition,
  type ExcelCaseStudy,
  type Exercise,
  type LabDatasetId,
  type LabExerciseDefinition,
  type LabGrid,
  type LevelSnapshot,
  type ModuleLevelDefinition,
  excelLabAvanceDefinitions
} from "@finance/domain";
import { getCanonicalTrackState, type CanonicalLevelState } from "@/lib/learning-progression";

/**
 * View model for the Excel Finance Lab.
 *
 * Levels, grids and datasets all come from `@finance/domain`, so every page
 * renders with no database — which is what makes the lab usable in the public
 * demo and testable in the default Playwright project. Only the learner's
 * progression needs persistence, and it degrades to "nothing acquired yet".
 *
 * PR-12b: the lab has four levels. N1/N2 are the pattern-checked grids of
 * PR-06; N3/N4 are graded by the formula engine and add two case studies. The
 * two families expose one view shape here so a page never branches on which
 * era an exercise was authored in.
 */

export const EXCEL_LAB_BASE = "/modules/excel-finance-lab";

export interface LabDatasetSummary {
  id: LabDatasetId;
  file: string;
  title: string;
  description: string;
  rowCount: number;
}

/**
 * The datasets, for the module's index page.
 *
 * `rowCount` is read off the parsed data rather than written down, so a line
 * added to a CSV cannot leave the page claiming the old figure.
 */
export const LAB_DATASETS: LabDatasetSummary[] = [
  {
    id: "monthly_pnl",
    file: "datasets/excel/monthly_pnl.csv",
    title: "Compte de résultat du mois",
    description: "Produits et charges d'exploitation, en euros, pour un mois complet.",
    rowCount: monthlyPnl.length
  },
  {
    id: "cash_forecast",
    file: "datasets/excel/cash_forecast.csv",
    title: "Prévision de trésorerie",
    description: "Encaissements et décaissements prévus sur un trimestre.",
    rowCount: cashForecast.length
  },
  {
    id: "budget_vs_actual",
    file: "datasets/excel/budget_vs_actual.csv",
    title: "Budget contre réel",
    description: "Quatre postes de charges, budgétés et réalisés.",
    rowCount: budgetVsActual.length
  },
  {
    id: "erp_export",
    file: "datasets/excel/erp_export.csv",
    title: "Export ERP à fiabiliser",
    description: "Dix lignes brutes : montants en texte, doublon, casse incohérente.",
    rowCount: erpExport.length
  },
  {
    id: "forecast_drivers",
    file: "datasets/excel/forecast_drivers.csv",
    title: "Hypothèses de prévision",
    description: "Postes du compte de résultat et taux de croissance associés.",
    rowCount: forecastDrivers.length
  },
  {
    id: "cash_13_semaines",
    file: "datasets/excel/cash_13_semaines.csv",
    title: "Trésorerie à treize semaines",
    description: "Encaissements et décaissements hebdomadaires, S1 à S13.",
    rowCount: cash13Semaines.length
  },
  {
    id: "aster_industrie",
    file: "datasets/excel/aster_industrie.csv",
    title: "Aster Industrie",
    description: "Données financières de la PME à valoriser : résultat, dette, coûts du capital.",
    rowCount: asterIndustrie.length
  },
  {
    id: "dcf_aster",
    file: "datasets/excel/dcf_aster.csv",
    title: "Plan DCF Aster",
    description: "Cinq flux disponibles et leurs coefficients d'actualisation.",
    rowCount: dcfAster.length
  }
];

export const LAB_ASSUMPTIONS_FILE = "datasets/excel/assumptions.json";
export const labOpeningCash = labAssumptions.tresorerieOuverture;

export function getLabLevels(): ModuleLevelDefinition[] {
  return getTrackLevels(activeCurriculum, EXCEL_LAB_TRACK);
}

export function getLabLevel(position: number): ModuleLevelDefinition | null {
  return getLabLevels().find((level) => level.level === position) ?? null;
}

/** Parses the `[level]` segment. Anything but 1..n is a 404, never a silent 1. */
export function parseLevelParam(raw: string): number | null {
  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * One view shape for the four levels. `kind` decides the form: the N1/N2 grids
 * are typed-in and pattern-checked, the N3/N4 grids are recalculated by the
 * engine, and the diagnostic exercises are multiple choice.
 */
export interface LabExerciseView {
  exercise: Exercise;
  kind: "pattern-grid" | "formula-grid" | "choice";
  grid: LabGrid | null;
  datasetId: LabDatasetId;
}

function fromLegacy(definition: LabExerciseDefinition): LabExerciseView {
  return {
    exercise: definition.exercise,
    kind: "pattern-grid",
    grid: definition.grid,
    datasetId: definition.datasetId
  };
}

function fromAvance(definition: AvanceExerciseDefinition): LabExerciseView {
  return {
    exercise: definition.exercise,
    kind: definition.kind === "formula-grid" ? "formula-grid" : "choice",
    grid: definition.grid ?? null,
    datasetId: definition.datasetId
  };
}

const ALL_LAB_VIEWS: LabExerciseView[] = [
  ...excelLabDefinitions.map(fromLegacy),
  ...excelLabAvanceDefinitions.map(fromAvance)
];

export function getLabExercise(exerciseId: string): LabExerciseView | null {
  const legacy = getExcelLabDefinition(exerciseId);

  if (legacy) {
    return fromLegacy(legacy);
  }

  const avance = getExcelLabAvanceDefinition(exerciseId);

  return avance ? fromAvance(avance) : null;
}

/** The next exercise in the same level, so a learner can work straight through. */
export function nextLabExercise(exerciseId: string): LabExerciseView | null {
  const index = ALL_LAB_VIEWS.findIndex((view) => view.exercise.id === exerciseId);

  if (index === -1) {
    return null;
  }

  const current = ALL_LAB_VIEWS[index];
  const next = ALL_LAB_VIEWS[index + 1];

  return next && next.exercise.level === current.exercise.level ? next : null;
}

export interface ExcelLabModel {
  levels: ModuleLevelDefinition[];
  levelStates: CanonicalLevelState[];
  snapshots: LevelSnapshot[];
  exercisesByLevel: Map<string, LabExerciseView[]>;
  caseStudies: ExcelCaseStudy[];
  datasets: LabDatasetSummary[];
  score: number | null;
  passingScore: number;
  rulesLabel: string;
  progressionTracked: boolean;
}

export async function getExcelLabModel(userId?: string | null): Promise<ExcelLabModel> {
  const progression = await getCanonicalTrackState(userId, EXCEL_LAB_TRACK);
  const levels = progression.publishedLevels.map((level) => level.definition);
  const snapshots = progression.publishedLevels.map((level) => level.snapshot);
  const exercisesByLevel = new Map<string, LabExerciseView[]>();

  for (const level of levels) {
    // Filtered on the exercise's own level — never a 1|2 ternary, which is
    // exactly what silently handed N3 the N2 list before PR-12b.
    exercisesByLevel.set(
      level.id,
      ALL_LAB_VIEWS.filter((view) => view.exercise.level === level.level)
    );
  }

  return {
    levels,
    levelStates: progression.publishedLevels,
    snapshots,
    exercisesByLevel,
    caseStudies: excelCaseStudies,
    datasets: LAB_DATASETS,
    score: progression.score,
    passingScore: progression.passingScore,
    rulesLabel: progression.sourceLabel,
    progressionTracked: progression.mode === "enrolled"
  };
}

// --- Case studies N3/N4 ------------------------------------------------------

export interface ExcelCaseStepView {
  caseStudy: ExcelCaseStudy;
  index: number;
  total: number;
  instruction: string;
  document: ExcelCaseStudy["documents"][number];
  exercise: LabExerciseView;
  nextHref: string | null;
}

export function listExcelCaseStudies(): ExcelCaseStudy[] {
  return excelCaseStudies;
}

export function getExcelCaseStudy(slug: string): ExcelCaseStudy | null {
  return getExcelCaseStudyBySlug(slug);
}

export function excelCaseHref(caseStudy: ExcelCaseStudy): string {
  return `${EXCEL_LAB_BASE}/cas/${caseStudy.slug}`;
}

/**
 * Une étape d'un case study, résolue contre son dossier. Même règle que les cas
 * compta : un index hors du cas est null, jamais rabattu sur l'étape 1.
 */
export function getExcelCaseStep(slug: string, position: number): ExcelCaseStepView | null {
  const caseStudy = getExcelCaseStudyBySlug(slug);

  if (!caseStudy) {
    return null;
  }

  const step = caseStudy.steps[position - 1];

  if (!step) {
    return null;
  }

  const exercise = getLabExercise(step.exerciseId);
  const document = caseStudy.documents.find((item) => item.id === step.documentId);

  if (!exercise || !document) {
    return null;
  }

  return {
    caseStudy,
    index: position,
    total: caseStudy.steps.length,
    instruction: step.instruction,
    document,
    exercise,
    nextHref:
      position < caseStudy.steps.length
        ? `${EXCEL_LAB_BASE}/cas/${caseStudy.slug}/${position + 1}`
        : null
  };
}
