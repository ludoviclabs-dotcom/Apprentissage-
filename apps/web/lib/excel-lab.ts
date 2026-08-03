import {
  EXCEL_LAB_TRACK,
  activeCurriculum,
  budgetVsActual,
  cashForecast,
  excelLabDefinitions,
  getExcelLabDefinition,
  getExcelLabExercises,
  getTrackLevels,
  labAssumptions,
  monthlyPnl,
  type LabExerciseDefinition,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";
import { getCanonicalTrackState, type CanonicalLevelState } from "@/lib/learning-progression";

/**
 * View model for the Excel Finance Lab.
 *
 * Levels, grids and datasets all come from `@finance/domain`, so every page
 * renders with no database — which is what makes the lab usable in the public
 * demo and testable in the default Playwright project. Only the learner's
 * progression needs persistence, and it degrades to "nothing acquired yet".
 */

export const EXCEL_LAB_BASE = "/modules/excel-finance-lab";

export interface LabDatasetSummary {
  id: LabExerciseDefinition["datasetId"];
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

export function getLabExercise(exerciseId: string): LabExerciseDefinition | null {
  return getExcelLabDefinition(exerciseId);
}

/** The next exercise in the same level, so a learner can work straight through. */
export function nextLabExercise(exerciseId: string): LabExerciseDefinition | null {
  const index = excelLabDefinitions.findIndex(
    (definition) => definition.exercise.id === exerciseId
  );

  if (index === -1) {
    return null;
  }

  const current = excelLabDefinitions[index];
  const next = excelLabDefinitions[index + 1];

  return next && next.exercise.level === current.exercise.level ? next : null;
}

export interface ExcelLabModel {
  levels: ModuleLevelDefinition[];
  levelStates: CanonicalLevelState[];
  snapshots: LevelSnapshot[];
  exercisesByLevel: Map<string, LabExerciseDefinition[]>;
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
  const exercisesByLevel = new Map<string, LabExerciseDefinition[]>();

  for (const level of levels) {
    const position = level.level === 1 ? 1 : 2;

    exercisesByLevel.set(
      level.id,
      getExcelLabExercises(position)
        .map((exercise) => getExcelLabDefinition(exercise.id))
        .filter((definition): definition is LabExerciseDefinition => definition !== null)
    );
  }

  return {
    levels,
    levelStates: progression.publishedLevels,
    snapshots,
    exercisesByLevel,
    datasets: LAB_DATASETS,
    score: progression.score,
    passingScore: progression.passingScore,
    rulesLabel: progression.sourceLabel,
    progressionTracked: progression.mode === "enrolled"
  };
}
