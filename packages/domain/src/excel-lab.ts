import type { AuthoredExerciseVersion } from "./exercise-specs";
import type { ModuleLevelDefinition } from "./curriculum";
import type { SpreadsheetSpec } from "./evaluators/spreadsheet";
import type { Competency, Exercise, SourcePack, SourceReference } from "./types";

/**
 * Excel Finance Lab — spreadsheet reasoning without a spreadsheet.
 *
 * WHAT THIS IS NOT. There is no formula engine here: nothing parses `=B2+B3`,
 * resolves a reference or recalculates anything. Building one would have been
 * the obvious move and the wrong one — a half-working Excel is worse than no
 * Excel, because the learner cannot tell which of the two is wrong when a figure
 * comes out odd, and the whole exercise becomes a trust problem.
 *
 * WHAT IT IS INSTEAD. A dataset is rendered read-only, a handful of cells are
 * editable, and the learner types two things: the figure they arrived at, and —
 * where the exercise asks — the formula they would write. `spreadsheet.ts`
 * checks those separately, because "right number" and "method that survives the
 * data changing" are different skills and a finance lab is mostly there to teach
 * the second.
 *
 * THE DATASETS ARE THE CSV FILES IN `datasets/excel/`. They are the versioned
 * artefact; the typed constants below are their runtime form. Keeping both would
 * normally invite drift, so `excel-lab.test.ts` reads the files off disk, parses
 * them with the parser exported here, and asserts they equal these constants. A
 * figure edited in one place and not the other fails there rather than silently
 * re-grading somebody.
 */

/**
 * Sources.
 *
 * Every citation here points at a file that is actually in this repository. An
 * earlier version of this module cited a "Cours — soldes intermédiaires de
 * gestion" at pages 4–27; no such document exists anywhere in the checkout, so
 * the page range was invented. `AGENTS.md` requires that all knowledge come
 * from local files or imported packs and that a citation carry document, page,
 * pack and date *when available* — inventing provenance to fill those fields is
 * the opposite of what the rule is for, and a fabricated page number is worse
 * than an absent one because it looks checkable.
 *
 * So: three citations, one per committed dataset, typed `personal-note` because
 * that is what they are, and with no page numbers because CSV files have none.
 */
function datasetSource(file: string, document: string): SourceReference {
  return {
    pack: EXCEL_LAB_PACK_ID,
    document: `${file} — ${document}`,
    sourceType: "personal-note",
    effectiveDate: "2026-08-01"
  };
}

export const EXCEL_LAB_PACK_ID = "pack-finance-lab";

/**
 * The pack the citations name, so it resolves to something on /source-packs
 * rather than being a label nothing backs.
 */
export const excelLabSourcePack: SourcePack = {
  id: EXCEL_LAB_PACK_ID,
  name: EXCEL_LAB_PACK_ID,
  description:
    "Jeux de donnees du lab finance, versionnes dans le depot sous datasets/excel.",
  domainId: "finance",
  versionLabel: "2026-08",
  effectiveDate: "2026-08-01",
  importedAt: "2026-08-01",
  status: "ready",
  documentsCount: 4,
  chunksCount: 0
};

export const excelLabSources: SourceReference[] = [
  datasetSource("datasets/excel/monthly_pnl.csv", "compte de resultat du mois"),
  datasetSource("datasets/excel/cash_forecast.csv", "prevision de tresorerie du trimestre"),
  datasetSource("datasets/excel/budget_vs_actual.csv", "budget et reel par poste")
];

// --- CSV --------------------------------------------------------------------

export class InvalidCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCsvError";
  }
}

export interface CsvDataset {
  columns: string[];
  rows: Array<Record<string, string>>;
}

/**
 * A deliberately small CSV reader: comma-separated, one header line, no quoting
 * and no embedded separators.
 *
 * Every committed dataset is written to those rules — that is why no label in
 * them contains a comma — and a row whose field count disagrees with the header
 * throws rather than being padded. A silently short row would become a cell that
 * reads as empty, and an empty cell in a P&L is a figure a learner would be
 * marked wrong for not inventing.
 */
export function parseCsv(text: string): CsvDataset {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (lines.length === 0) {
    throw new InvalidCsvError("CSV is empty.");
  }

  const columns = lines[0].split(",").map((column) => column.trim());
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());

    if (values.length !== columns.length) {
      throw new InvalidCsvError(
        `CSV row ${index + 2} has ${values.length} fields, expected ${columns.length}.`
      );
    }

    return Object.fromEntries(columns.map((column, position) => [column, values[position]]));
  });

  return { columns, rows };
}

/** Reads a CSV field as a finite number, naming the field when it is not one. */
export function csvNumber(row: Record<string, string>, column: string): number {
  const raw = row[column];
  const value = Number(raw);

  if (raw === undefined || raw === "" || !Number.isFinite(value)) {
    throw new InvalidCsvError(`Column "${column}" is not a number: "${raw ?? ""}".`);
  }

  return value;
}

// --- Datasets ---------------------------------------------------------------

export interface PnlLine {
  ligne: number;
  libelle: string;
  montant: number;
}

export interface CashForecastLine {
  mois: string;
  encaissements: number;
  decaissements: number;
}

export interface BudgetLine {
  poste: string;
  budget: number;
  reel: number;
}

/** Mirrors `datasets/excel/monthly_pnl.csv`, asserted equal by the tests. */
export const monthlyPnl: PnlLine[] = [
  { ligne: 1, libelle: "Ventes de marchandises", montant: 480000 },
  { ligne: 2, libelle: "Production vendue de services", montant: 120000 },
  { ligne: 3, libelle: "Achats de marchandises", montant: 318000 },
  { ligne: 4, libelle: "Variation de stock de marchandises", montant: -18000 },
  { ligne: 5, libelle: "Autres achats et charges externes", montant: 96000 },
  { ligne: 6, libelle: "Impots taxes et versements assimiles", montant: 14000 },
  { ligne: 7, libelle: "Charges de personnel", montant: 132000 },
  { ligne: 8, libelle: "Subventions d exploitation", montant: 9000 },
  { ligne: 9, libelle: "Dotations aux amortissements", montant: 21000 }
];

/** Mirrors `datasets/excel/cash_forecast.csv`. */
export const cashForecast: CashForecastLine[] = [
  { mois: "Janvier", encaissements: 152000, decaissements: 138000 },
  { mois: "Fevrier", encaissements: 144000, decaissements: 151000 },
  { mois: "Mars", encaissements: 168000, decaissements: 142000 }
];

/** Mirrors `datasets/excel/budget_vs_actual.csv`. */
export const budgetVsActual: BudgetLine[] = [
  { poste: "Achats de marchandises", budget: 310000, reel: 318000 },
  { poste: "Autres achats et charges externes", budget: 102000, reel: 96000 },
  { poste: "Charges de personnel", budget: 130000, reel: 132000 },
  { poste: "Impots et taxes", budget: 14000, reel: 14000 }
];

/** Mirrors `datasets/excel/assumptions.json`. */
export const labAssumptions = {
  exercice: "N",
  devise: "EUR",
  tresorerieOuverture: 46000
} as const;

export function parsePnlCsv(text: string): PnlLine[] {
  return parseCsv(text).rows.map((row) => ({
    ligne: csvNumber(row, "ligne"),
    libelle: row.libelle,
    montant: csvNumber(row, "montant")
  }));
}

export function parseCashForecastCsv(text: string): CashForecastLine[] {
  return parseCsv(text).rows.map((row) => ({
    mois: row.mois,
    encaissements: csvNumber(row, "encaissements"),
    decaissements: csvNumber(row, "decaissements")
  }));
}

export function parseBudgetCsv(text: string): BudgetLine[] {
  return parseCsv(text).rows.map((row) => ({
    poste: row.poste,
    budget: csvNumber(row, "budget"),
    reel: csvNumber(row, "reel")
  }));
}

// --- The grid ---------------------------------------------------------------

export function columnLetter(index: number): string {
  let remaining = index;
  let letters = "";

  do {
    letters = String.fromCharCode(65 + (remaining % 26)) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);

  return letters;
}

/** A1 reference from a zero-based column and a one-based row. */
export function cellRef(columnIndex: number, row: number): string {
  return `${columnLetter(columnIndex)}${row}`;
}

export type LabCell =
  | { kind: "label"; text: string }
  | { kind: "given"; value: number }
  | { kind: "input"; wantsFormula: boolean }
  | { kind: "blank" };

export interface LabGrid {
  /** Header labels, column A first. Rendered as spreadsheet row 1. */
  columns: string[];
  /** Body rows. `rows[0]` is spreadsheet row 2, since row 1 is the header. */
  rows: LabCell[][];
}

/** Every editable cell of a grid, in reading order. */
export function gridInputRefs(grid: LabGrid): string[] {
  const refs: string[] = [];

  for (const [rowIndex, row] of grid.rows.entries()) {
    for (const [columnIndex, cell] of row.entries()) {
      if (cell.kind === "input") {
        refs.push(cellRef(columnIndex, rowIndex + 2));
      }
    }
  }

  return refs;
}

const PNL_COLUMNS = ["Poste", "Montant (EUR)"];

/** Rows 2–10: the dataset, read-only. */
const pnlBaseRows: LabCell[][] = monthlyPnl.map((line) => [
  { kind: "label", text: line.libelle },
  { kind: "given", value: line.montant }
]);

function pnlGrid(...extraRows: LabCell[][]): LabGrid {
  // Row 11 is left blank so the answer block reads as a separate section, and so
  // inserting a line into the dataset cannot silently shift an answer's cell
  // reference into the middle of the data.
  return { columns: PNL_COLUMNS, rows: [...pnlBaseRows, [{ kind: "blank" }, { kind: "blank" }], ...extraRows] };
}

const CASH_COLUMNS = ["Mois", "Encaissements", "Decaissements", "Solde net", "Tresorerie fin de periode"];

const cashBaseRows: LabCell[][] = cashForecast.map((line) => [
  { kind: "label", text: line.mois },
  { kind: "given", value: line.encaissements },
  { kind: "given", value: line.decaissements },
  { kind: "blank" },
  { kind: "blank" }
]);

const BUDGET_COLUMNS = ["Poste", "Budget", "Reel", "Ecart (EUR)", "Ecart (%)"];

// --- Competencies and levels ------------------------------------------------

export const excelLabCompetencies: Competency[] = [
  {
    id: "xl-soldes-gestion",
    domainId: "finance",
    name: "Calculer les soldes intermediaires de gestion",
    levelMin: 1,
    levelMax: 2,
    status: "not-started",
    strength: 0,
    focus: "Enchainer marge commerciale, valeur ajoutee, EBE et resultat d'exploitation."
  },
  {
    id: "xl-formules",
    domainId: "finance",
    name: "Ecrire une formule qui suit les donnees",
    levelMin: 1,
    levelMax: 2,
    status: "not-started",
    strength: 0,
    focus: "Referencer des cellules plutot que saisir un resultat en dur."
  },
  {
    id: "xl-tresorerie-budget",
    domainId: "finance",
    name: "Prevoir la tresorerie et analyser un ecart budgetaire",
    levelMin: 2,
    levelMax: 2,
    status: "not-started",
    strength: 0,
    focus: "Distinguer un solde de periode d'une position cumulee."
  }
];

export const EXCEL_LAB_TRACK = "track-excel-finance";

export const excelLabLevels: ModuleLevelDefinition[] = [
  {
    id: "level-excel-finance-1",
    trackId: EXCEL_LAB_TRACK,
    moduleId: "module-excel-finance-lab",
    domainId: "finance",
    level: 1,
    title: "Compte de resultat et marges",
    objective: "Lire un compte de resultat, calculer le chiffre d'affaires, le cout d'achat et la marge.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    criticalCompetencyIds: ["xl-soldes-gestion"],
    estimatedMinutes: 90,
    publicationStatus: "published"
  },
  {
    id: "level-excel-finance-2",
    trackId: EXCEL_LAB_TRACK,
    moduleId: "module-excel-finance-lab",
    domainId: "finance",
    level: 2,
    title: "Soldes de gestion, tresorerie et budget",
    objective: "Enchainer VA et EBE, projeter la tresorerie et mesurer un ecart budgetaire.",
    competencyIds: ["xl-soldes-gestion", "xl-tresorerie-budget", "xl-formules"],
    criticalCompetencyIds: ["xl-tresorerie-budget"],
    estimatedMinutes: 120,
    publicationStatus: "published"
  }
];

// --- Exercises --------------------------------------------------------------

export interface LabExerciseDefinition {
  exercise: Exercise;
  grid: LabGrid;
  /** Which dataset the grid is built from, for the module's dataset index. */
  datasetId: "monthly_pnl" | "cash_forecast" | "budget_vs_actual";
}

interface LabSeed {
  id: string;
  level: 1 | 2;
  minutes: number;
  title: string;
  statement: string;
  expectedAnswer: string;
  competencyIds: string[];
  rubric: Array<{ label: string; points: number }>;
  grid: LabGrid;
  datasetId: LabExerciseDefinition["datasetId"];
}

function toLabExercise(seed: LabSeed): LabExerciseDefinition {
  return {
    exercise: {
      id: seed.id,
      domainId: "finance",
      type: "calculation",
      title: seed.title,
      level: seed.level,
      estimatedMinutes: seed.minutes,
      statement: seed.statement,
      expectedAnswer: seed.expectedAnswer,
      rubric: seed.rubric,
      competencyIds: seed.competencyIds,
      sourceChunkIds: []
    },
    grid: seed.grid,
    datasetId: seed.datasetId
  };
}

const RUBRIC_VALUE_AND_FORMULA = [
  { label: "Resultat exact", points: 12 },
  { label: "Formule referencant les cellules", points: 8 }
];

export const excelLabDefinitions: LabExerciseDefinition[] = [
  // --- N1 -----------------------------------------------------------------
  toLabExercise({
    id: "ex-xl-chiffre-affaires",
    level: 1,
    minutes: 8,
    title: "Chiffre d'affaires du mois",
    statement:
      "Le compte de resultat ci-dessous est donne en lignes 2 a 10.\nEn B12, calculez le chiffre d'affaires : ventes de marchandises et production vendue de services.\nSaisissez le resultat et la formule que vous ecririez dans Excel.",
    expectedAnswer:
      "B12 = 480 000 + 120 000 = 600 000 EUR, formule =B2+B3 (ou =SUM(B2:B3)).\nLe chiffre d'affaires additionne les ventes de biens et de services ; les subventions n'en font pas partie.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid([{ kind: "label", text: "Chiffre d'affaires" }, { kind: "input", wantsFormula: true }])
  }),
  toLabExercise({
    id: "ex-xl-cout-achat-vendues",
    level: 1,
    minutes: 8,
    title: "Cout d'achat des marchandises vendues",
    statement:
      "En B12, calculez le cout d'achat des marchandises vendues a partir des achats et de la variation de stock.\nAttention au signe : la variation de stock (compte 6037) est negative ici, le stock a augmente.\nSaisissez le resultat et la formule.",
    expectedAnswer:
      "B12 = 318 000 + (-18 000) = 300 000 EUR, formule =B4+B5.\nLe stock ayant augmente, une partie des achats n'a pas ete consommee et vient en deduction du cout.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid([
      { kind: "label", text: "Cout d'achat des marchandises vendues" },
      { kind: "input", wantsFormula: true }
    ])
  }),
  toLabExercise({
    id: "ex-xl-marge-commerciale",
    level: 1,
    minutes: 10,
    title: "Marge commerciale",
    statement:
      "En B12, calculez la marge commerciale : ventes de marchandises moins cout d'achat des marchandises vendues.\nSaisissez le resultat et la formule, en partant des lignes du compte de resultat.",
    expectedAnswer:
      "B12 = 480 000 - (318 000 - 18 000) = 180 000 EUR, formule =B2-B4-B5 (ou =B2-(B4+B5)).\nLa marge commerciale ne porte que sur les marchandises : la production de services en est exclue.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid([{ kind: "label", text: "Marge commerciale" }, { kind: "input", wantsFormula: true }])
  }),
  toLabExercise({
    id: "ex-xl-taux-marge",
    level: 1,
    minutes: 8,
    title: "Taux de marge commerciale",
    statement:
      "La marge commerciale est donnee en B12.\nEn B13, calculez le taux de marge commerciale en pourcentage des ventes de marchandises.\nSaisissez le resultat (en points de pourcentage, par exemple 12,5 pour 12,5 %) et la formule.",
    expectedAnswer:
      "B13 = 180 000 / 480 000 x 100 = 37,5 %, formule =B12/B2*100.\nLe denominateur est le chiffre d'affaires marchandises, pas le chiffre d'affaires total.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid(
      [{ kind: "label", text: "Marge commerciale" }, { kind: "given", value: 180000 }],
      [{ kind: "label", text: "Taux de marge commerciale (%)" }, { kind: "input", wantsFormula: true }]
    )
  }),
  toLabExercise({
    id: "ex-xl-cash-totaux",
    level: 1,
    minutes: 10,
    title: "Totaux de la prevision de tresorerie",
    statement:
      "La prevision de tresorerie du trimestre est donnee en lignes 2 a 4.\nEn B5 et C5, totalisez les encaissements et les decaissements du trimestre.\nChaque total doit etre obtenu par une somme sur la plage (SUM), pas par l'addition des trois cellules.",
    expectedAnswer:
      "B5 = 464 000 EUR avec =SUM(B2:B4) ; C5 = 431 000 EUR avec =SUM(C2:C4).\nUne somme ecrite sur la plage suit l'ajout d'un mois ; trois references additionnees ne le font pas.",
    competencyIds: ["xl-tresorerie-budget", "xl-formules"],
    rubric: [
      { label: "Total des encaissements", points: 10 },
      { label: "Total des decaissements", points: 10 }
    ],
    datasetId: "cash_forecast",
    grid: {
      columns: CASH_COLUMNS,
      rows: [
        ...cashBaseRows,
        [
          { kind: "label", text: "Total du trimestre" },
          { kind: "input", wantsFormula: true },
          { kind: "input", wantsFormula: true },
          { kind: "blank" },
          { kind: "blank" }
        ]
      ]
    }
  }),

  // --- N2 -----------------------------------------------------------------
  toLabExercise({
    id: "ex-xl-valeur-ajoutee",
    level: 2,
    minutes: 10,
    title: "Valeur ajoutee",
    statement:
      "La marge commerciale est donnee en B12.\nEn B13, calculez la valeur ajoutee : marge commerciale, plus production vendue, moins autres achats et charges externes.\nSaisissez le resultat et la formule.",
    expectedAnswer:
      "B13 = 180 000 + 120 000 - 96 000 = 204 000 EUR, formule =B12+B3-B6.\nLes charges de personnel et les impots ne sont pas deduits ici : ils interviennent au niveau de l'EBE.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid(
      [{ kind: "label", text: "Marge commerciale" }, { kind: "given", value: 180000 }],
      [{ kind: "label", text: "Valeur ajoutee" }, { kind: "input", wantsFormula: true }]
    )
  }),
  toLabExercise({
    id: "ex-xl-ebe",
    level: 2,
    minutes: 12,
    title: "Excedent brut d'exploitation",
    statement:
      "La valeur ajoutee est donnee en B12.\nEn B13, calculez l'excedent brut d'exploitation : valeur ajoutee, plus subventions d'exploitation, moins impots et taxes, moins charges de personnel.\nSaisissez le resultat et la formule.",
    expectedAnswer:
      "B13 = 204 000 + 9 000 - 14 000 - 132 000 = 67 000 EUR, formule =B12+B9-B7-B8.\nLes dotations aux amortissements ne sont pas deduites : l'EBE se mesure avant amortissement, c'est ce qui en fait un indicateur de tresorerie d'exploitation.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid(
      [{ kind: "label", text: "Valeur ajoutee" }, { kind: "given", value: 204000 }],
      [{ kind: "label", text: "Excedent brut d'exploitation" }, { kind: "input", wantsFormula: true }]
    )
  }),
  toLabExercise({
    id: "ex-xl-resultat-exploitation",
    level: 2,
    minutes: 8,
    title: "Resultat d'exploitation",
    statement:
      "L'excedent brut d'exploitation est donne en B12.\nEn B13, calculez le resultat d'exploitation en deduisant les dotations aux amortissements.\nSaisissez le resultat et la formule.",
    expectedAnswer:
      "B13 = 67 000 - 21 000 = 46 000 EUR, formule =B12-B10.\nL'ecart entre EBE et resultat d'exploitation est exactement la charge d'amortissement de la periode.",
    competencyIds: ["xl-soldes-gestion", "xl-formules"],
    rubric: RUBRIC_VALUE_AND_FORMULA,
    datasetId: "monthly_pnl",
    grid: pnlGrid(
      [{ kind: "label", text: "Excedent brut d'exploitation" }, { kind: "given", value: 67000 }],
      [{ kind: "label", text: "Resultat d'exploitation" }, { kind: "input", wantsFormula: true }]
    )
  }),
  toLabExercise({
    id: "ex-xl-cash-solde-final",
    level: 2,
    minutes: 12,
    title: "Solde du trimestre et tresorerie finale",
    statement:
      "Les totaux du trimestre sont donnes en B5 et C5. La tresorerie a l'ouverture est de 46 000 EUR.\nEn D5, calculez le solde net du trimestre, avec une formule.\nEn E5, indiquez la tresorerie a la fin du trimestre (resultat seul, sans formule).",
    expectedAnswer:
      "D5 = 464 000 - 431 000 = 33 000 EUR, formule =B5-C5.\nE5 = 46 000 + 33 000 = 79 000 EUR.\nLe solde net est un flux de periode ; la tresorerie finale est une position cumulee, qui depend de l'ouverture.",
    competencyIds: ["xl-tresorerie-budget", "xl-formules"],
    rubric: [
      { label: "Solde net du trimestre", points: 10 },
      { label: "Tresorerie a la cloture", points: 10 }
    ],
    datasetId: "cash_forecast",
    grid: {
      columns: CASH_COLUMNS,
      rows: [
        ...cashBaseRows,
        [
          { kind: "label", text: "Total du trimestre" },
          { kind: "given", value: 464000 },
          { kind: "given", value: 431000 },
          { kind: "input", wantsFormula: true },
          { kind: "input", wantsFormula: false }
        ]
      ]
    }
  }),
  toLabExercise({
    id: "ex-xl-budget-ecart",
    level: 2,
    minutes: 12,
    title: "Ecart budget / reel sur les achats",
    statement:
      "Le budget et le reel sont donnes en lignes 2 a 5.\nEn D2, calculez l'ecart en euros sur les achats de marchandises (reel moins budget).\nEn E2, calculez ce meme ecart en pourcentage du budget.\nLes deux cellules doivent etre obtenues par une formule.",
    expectedAnswer:
      "D2 = 318 000 - 310 000 = 8 000 EUR, formule =C2-B2.\nE2 = 8 000 / 310 000 x 100 = 2,58 %, formule =(C2-B2)/B2*100.\nL'ecart est positif donc defavorable sur une charge : le reel depasse le budget.",
    competencyIds: ["xl-tresorerie-budget", "xl-formules"],
    rubric: [
      { label: "Ecart en euros", points: 10 },
      { label: "Ecart en pourcentage", points: 10 }
    ],
    datasetId: "budget_vs_actual",
    grid: {
      columns: BUDGET_COLUMNS,
      rows: budgetVsActual.map((line, index) =>
        index === 0
          ? [
              { kind: "label", text: line.poste },
              { kind: "given", value: line.budget },
              { kind: "given", value: line.reel },
              { kind: "input", wantsFormula: true },
              { kind: "input", wantsFormula: true }
            ]
          : [
              { kind: "label", text: line.poste },
              { kind: "given", value: line.budget },
              { kind: "given", value: line.reel },
              { kind: "blank" },
              { kind: "blank" }
            ]
      )
    }
  })
];

export const excelLabExercises: Exercise[] = excelLabDefinitions.map(
  (definition) => definition.exercise
);

export function getExcelLabDefinition(exerciseId: string): LabExerciseDefinition | null {
  return excelLabDefinitions.find((definition) => definition.exercise.id === exerciseId) ?? null;
}

export function getExcelLabExercises(level: 1 | 2): Exercise[] {
  return excelLabExercises.filter((exercise) => exercise.level === level);
}

export const excelLabLevelByExercise: Record<string, string> = Object.fromEntries(
  excelLabExercises.map((exercise) => [
    exercise.id,
    exercise.level === 1 ? "level-excel-finance-1" : "level-excel-finance-2"
  ])
);

export function getExcelLabLevel(exerciseId: string): string | null {
  return excelLabLevelByExercise[exerciseId] ?? null;
}

// --- Authored specifications ------------------------------------------------
//
// Formula patterns are anchored by the evaluator, so each one describes a whole
// formula. Alternatives are spelled out rather than made permissive: accepting
// "anything containing B2" would pass `=B2*99`.

function labVersion(
  exerciseId: string,
  spec: SpreadsheetSpec,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "spreadsheet",
    spec,
    testCases
  };
}

/** Money to the euro; the datasets carry no cents. */
const EURO = { toleranceAbs: 0.5 };
/** Percentages to two decimals, as the statements ask for. */
const PERCENT = { toleranceAbs: 0.01 };

export const excelLabExerciseVersions: AuthoredExerciseVersion[] = [
  labVersion(
    "ex-xl-chiffre-affaires",
    {
      checks: [
        {
          cell: "B12",
          label: "Chiffre d'affaires",
          points: 20,
          expectedValue: 600000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=(B2\\+B3|B3\\+B2|SUM\\(B2:B3\\))",
          formulaHint: "Additionnez les deux lignes de produits : =B2+B3."
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B12: { value: 600000, formula: "=B2+B3" } } },
        expectedScore: 20
      },
      {
        // The figure typed in without a formula: half the point of the lab.
        name: "resultat-en-dur",
        submission: { kind: "spreadsheet", cells: { B12: { value: 600000, formula: "=600000" } } },
        expectedScore: 12
      },
      {
        // Subsidies counted as revenue — the classic misreading of a P&L.
        name: "subventions-comptees",
        submission: { kind: "spreadsheet", cells: { B12: { value: 609000, formula: "=B2+B3+B9" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-cout-achat-vendues",
    {
      checks: [
        {
          cell: "B12",
          label: "Cout d'achat des marchandises vendues",
          points: 20,
          expectedValue: 300000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=(B4\\+B5|B5\\+B4|SUM\\(B4:B5\\))",
          formulaHint: "Ajoutez la variation de stock aux achats : =B4+B5.",
          errorKind: "accounting-treatment"
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B12: { value: 300000, formula: "=B4+B5" } } },
        expectedScore: 20
      },
      {
        // Sign of the stock movement inverted: 318 000 + 18 000.
        name: "signe-de-la-variation-inverse",
        submission: { kind: "spreadsheet", cells: { B12: { value: 336000, formula: "=B4-B5" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-marge-commerciale",
    {
      checks: [
        {
          cell: "B12",
          label: "Marge commerciale",
          points: 20,
          expectedValue: 180000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=(B2-B4-B5|B2-\\(B4\\+B5\\))",
          formulaHint: "Ventes de marchandises moins le cout d'achat : =B2-B4-B5.",
          errorKind: "accounting-treatment"
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B12: { value: 180000, formula: "=B2-B4-B5" } } },
        expectedScore: 20
      },
      {
        name: "variante-parenthesee",
        submission: { kind: "spreadsheet", cells: { B12: { value: 180000, formula: "=B2-(B4+B5)" } } },
        expectedScore: 20
      },
      {
        // Services folded into a commercial margin.
        name: "production-vendue-incluse",
        submission: { kind: "spreadsheet", cells: { B12: { value: 300000, formula: "=B2+B3-B4-B5" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-taux-marge",
    {
      checks: [
        {
          cell: "B13",
          label: "Taux de marge commerciale",
          points: 20,
          expectedValue: 37.5,
          ...PERCENT,
          unit: "%",
          requiredFormulaPattern: "=(B12/B2\\*100|100\\*B12/B2)",
          formulaHint: "Rapportez la marge aux ventes de marchandises : =B12/B2*100."
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B13: { value: 37.5, formula: "=B12/B2*100" } } },
        expectedScore: 20
      },
      {
        // Divided by total revenue instead of merchandise sales: 180/600.
        name: "denominateur-ca-total",
        submission: { kind: "spreadsheet", cells: { B13: { value: 30, formula: "=B12/(B2+B3)*100" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-cash-totaux",
    {
      checks: [
        {
          cell: "B5",
          label: "Total des encaissements",
          points: 10,
          expectedValue: 464000,
          ...EURO,
          unit: "EUR",
          // Only the range form. The authored correction teaches that three
          // added references do not follow an inserted month, so accepting
          // `=B2+B3+B4` would certify the very method this exercise argues
          // against. The value marks are untouched: adding the three cells
          // still earns 6 of the 10 points.
          requiredFormulaPattern: "=SUM\\(B2:B4\\)",
          formulaHint: "Sommez la plage sur les trois mois : =SUM(B2:B4)."
        },
        {
          cell: "C5",
          label: "Total des decaissements",
          points: 10,
          expectedValue: 431000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=SUM\\(C2:C4\\)",
          formulaHint: "Sommez la plage sur les trois mois : =SUM(C2:C4)."
        }
      ]
    },
    [
      {
        name: "deux-totaux",
        submission: {
          kind: "spreadsheet",
          cells: {
            B5: { value: 464000, formula: "=SUM(B2:B4)" },
            C5: { value: 431000, formula: "=SUM(C2:C4)" }
          }
        },
        expectedScore: 20
      },
      {
        // Only one column filled: partial credit is the honest outcome.
        name: "une-seule-colonne",
        submission: { kind: "spreadsheet", cells: { B5: { value: 464000, formula: "=SUM(B2:B4)" } } },
        expectedScore: 10
      },
      {
        // Right figures, obtained by adding the three cells — the method this
        // exercise exists to argue against. The values still earn their marks.
        name: "addition-des-trois-cellules",
        submission: {
          kind: "spreadsheet",
          cells: {
            B5: { value: 464000, formula: "=B2+B3+B4" },
            C5: { value: 431000, formula: "=C2+C3+C4" }
          }
        },
        expectedScore: 12
      }
    ]
  ),
  labVersion(
    "ex-xl-valeur-ajoutee",
    {
      checks: [
        {
          cell: "B13",
          label: "Valeur ajoutee",
          points: 20,
          expectedValue: 204000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=(B12\\+B3-B6|B3\\+B12-B6)",
          formulaHint: "Marge plus production vendue moins charges externes : =B12+B3-B6.",
          errorKind: "accounting-treatment"
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B13: { value: 204000, formula: "=B12+B3-B6" } } },
        expectedScore: 20
      },
      {
        // Payroll deducted at the VA stage instead of the EBE stage.
        name: "personnel-deduit-trop-tot",
        submission: { kind: "spreadsheet", cells: { B13: { value: 72000, formula: "=B12+B3-B6-B8" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-ebe",
    {
      checks: [
        {
          cell: "B13",
          label: "Excedent brut d'exploitation",
          points: 20,
          expectedValue: 67000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=(B12\\+B9-B7-B8|B12\\+B9-B8-B7)",
          formulaHint: "VA plus subventions, moins impots et personnel : =B12+B9-B7-B8.",
          errorKind: "accounting-treatment"
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B13: { value: 67000, formula: "=B12+B9-B7-B8" } } },
        expectedScore: 20
      },
      {
        // Depreciation deducted: this is exactly what EBE excludes.
        name: "dotations-deduites",
        submission: {
          kind: "spreadsheet",
          cells: { B13: { value: 46000, formula: "=B12+B9-B7-B8-B10" } }
        },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-resultat-exploitation",
    {
      checks: [
        {
          cell: "B13",
          label: "Resultat d'exploitation",
          points: 20,
          expectedValue: 46000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=B12-B10",
          formulaHint: "EBE moins les dotations : =B12-B10.",
          errorKind: "accounting-treatment"
        }
      ]
    },
    [
      {
        name: "valeur-et-formule",
        submission: { kind: "spreadsheet", cells: { B13: { value: 46000, formula: "=B12-B10" } } },
        expectedScore: 20
      },
      {
        name: "dotations-ajoutees",
        submission: { kind: "spreadsheet", cells: { B13: { value: 88000, formula: "=B12+B10" } } },
        expectedScore: 0
      }
    ]
  ),
  labVersion(
    "ex-xl-cash-solde-final",
    {
      checks: [
        {
          cell: "D5",
          label: "Solde net du trimestre",
          points: 10,
          expectedValue: 33000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=B5-C5",
          formulaHint: "Encaissements moins decaissements : =B5-C5."
        },
        {
          // Value only: the closing position needs the opening balance, which is
          // not in the grid, so there is no cell formula to require.
          cell: "E5",
          label: "Tresorerie a la cloture",
          points: 10,
          expectedValue: 79000,
          ...EURO,
          unit: "EUR"
        }
      ]
    },
    [
      {
        name: "solde-et-cloture",
        submission: {
          kind: "spreadsheet",
          cells: { D5: { value: 33000, formula: "=B5-C5" }, E5: { value: 79000 } }
        },
        expectedScore: 20
      },
      {
        // The opening balance forgotten: the flow reported as the position.
        name: "ouverture-oubliee",
        submission: {
          kind: "spreadsheet",
          cells: { D5: { value: 33000, formula: "=B5-C5" }, E5: { value: 33000 } }
        },
        expectedScore: 10
      }
    ]
  ),
  labVersion(
    "ex-xl-budget-ecart",
    {
      checks: [
        {
          cell: "D2",
          label: "Ecart en euros",
          points: 10,
          expectedValue: 8000,
          ...EURO,
          unit: "EUR",
          requiredFormulaPattern: "=C2-B2",
          formulaHint: "Reel moins budget : =C2-B2."
        },
        {
          cell: "E2",
          label: "Ecart en pourcentage",
          points: 10,
          expectedValue: 2.58,
          ...PERCENT,
          unit: "%",
          requiredFormulaPattern: "=(\\(C2-B2\\)/B2\\*100|100\\*\\(C2-B2\\)/B2|D2/B2\\*100)",
          formulaHint: "Rapportez l'ecart au budget : =(C2-B2)/B2*100."
        }
      ]
    },
    [
      {
        name: "ecart-euros-et-pourcent",
        submission: {
          kind: "spreadsheet",
          cells: {
            D2: { value: 8000, formula: "=C2-B2" },
            E2: { value: 2.58, formula: "=(C2-B2)/B2*100" }
          }
        },
        expectedScore: 20
      },
      {
        // Budget minus actual: the sign convention reversed, so a cost overrun
        // reads as a saving.
        name: "sens-inverse",
        submission: {
          kind: "spreadsheet",
          cells: {
            D2: { value: -8000, formula: "=B2-C2" },
            E2: { value: -2.58, formula: "=(B2-C2)/B2*100" }
          }
        },
        expectedScore: 0
      }
    ]
  )
];
