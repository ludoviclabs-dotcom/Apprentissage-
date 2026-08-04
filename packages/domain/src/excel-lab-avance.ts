import type { ModuleLevelDefinition } from "./curriculum";
import type { AuthoredExerciseVersion } from "./exercise-specs";
import type { MultipleChoiceSpec } from "./evaluators/multiple-choice";
import type { FormulaSpreadsheetSpec } from "./evaluators/spreadsheet-formula";
import {
  EXCEL_LAB_TRACK,
  cellRef,
  csvNumber,
  datasetSource,
  parseCsv,
  type LabDatasetId,
  type LabGrid
} from "./excel-lab";
import type { WorkbookCellInput } from "./spreadsheet";
import type { Competency, Exercise, SourceReference } from "./types";

/**
 * Excel Finance Lab N3/N4 — le laboratoire calcule, enfin (PR-12b).
 *
 * Les niveaux 1 et 2 vérifient un résultat saisi et un motif de formule ; ces
 * deux niveaux-ci s'appuient sur le moteur borné de `./spreadsheet` : la
 * formule du candidat est réellement parsée, injectée dans le classeur de
 * l'exercice et recalculée — sur les données de l'énoncé puis sur des données
 * perturbées. Un résultat en dur passe la première évaluation et échoue à
 * toutes les autres, ce qui est exactement la définition d'une erreur de
 * méthode. Voir `docs/adr/009-excel-formula-engine.md`.
 *
 * CE QUE CES NIVEAUX NE PROMETTENT PAS. Power Query n'est pas exécuté : il est
 * enseigné par diagnostics guidés (identifier les transformations à appliquer),
 * puis les calculs se font sur les données fiabilisées. LET est présenté en
 * lecture, jamais évalué. Le VBA est affiché et téléchargeable, jamais exécuté
 * — ni sur Vercel, ni dans le navigateur. Ces limites sont documentées dans
 * l'ADR et répétées dans les énoncés concernés.
 *
 * LES DATASETS SONT LES FICHIERS COMMITTÉS dans `datasets/excel/`. Comme pour
 * N1/N2, les constantes typées ci-dessous en sont la forme exécutable et
 * `excel-lab-avance.test.ts` lit les fichiers, les parse et les compare — un
 * chiffre modifié d'un seul côté fait échouer la suite au lieu de renoter
 * quelqu'un en silence.
 */

// --- Sources -----------------------------------------------------------------

export const excelLabAvanceSources: SourceReference[] = [
  datasetSource("datasets/excel/erp_export.csv", "export ERP des ventes et achats"),
  datasetSource("datasets/excel/forecast_drivers.csv", "hypotheses de prevision du compte de resultat"),
  datasetSource("datasets/excel/cash_13_semaines.csv", "prevision de tresorerie a treize semaines"),
  datasetSource("datasets/excel/aster_industrie.csv", "donnees financieres d'Aster Industrie"),
  datasetSource("datasets/excel/dcf_aster.csv", "flux actualises du plan Aster Industrie"),
  datasetSource("datasets/excel/vba/export_tresorerie.bas", "module VBA d'export de la tresorerie")
];

// --- Datasets ----------------------------------------------------------------

export interface ErpExportLine {
  piece: string;
  famille: string;
  libelle: string;
  /**
   * Volontairement du texte : l'export contient des montants au format
   * « 7 400 » que `csvNumber` refuserait, et c'est le défaut que le niveau
   * apprend à diagnostiquer avant tout calcul.
   */
  montant: string;
}

/** Mirrors `datasets/excel/erp_export.csv` — brut, défauts compris. */
export const erpExport: ErpExportLine[] = [
  { piece: "FA-101", famille: "VENTES", libelle: "Ventes boutique Lyon", montant: "12500" },
  { piece: "FA-102", famille: "ventes", libelle: "Ventes boutique Lille", montant: "9800" },
  { piece: "FA-103", famille: "VENTES", libelle: "Ventes en ligne", montant: "15200" },
  { piece: "FA-103", famille: "VENTES", libelle: "Ventes en ligne", montant: "15200" },
  { piece: "AV-104", famille: "AVOIRS", libelle: "Avoir client Lyon", montant: "-1200" },
  { piece: "FA-105", famille: "Ventes", libelle: "Ventes export", montant: "7 400" },
  { piece: "FR-201", famille: "ACHATS", libelle: "Achats marchandises", montant: "-8600" },
  { piece: "FR-202", famille: "achats", libelle: "Transport sur achats", montant: "-950" },
  { piece: "FR-203", famille: "ACHATS", libelle: "Achats emballages", montant: "-1 150" },
  { piece: "FA-106", famille: "VENTES", libelle: "Ventes boutique Lyon", montant: "6300" }
];

export function parseErpExportCsv(text: string): ErpExportLine[] {
  return parseCsv(text).rows.map((row) => ({
    piece: row.piece,
    famille: row.famille,
    libelle: row.libelle,
    montant: row.montant
  }));
}

/**
 * L'export fiabilisé : doublon FA-103 retiré, montants convertis en nombres,
 * familles harmonisées en majuscules. C'est l'état « après Power Query » sur
 * lequel travaillent les grilles de calcul, dérivé par du code plutôt que
 * recopié pour que le test puisse l'affirmer égal à la dérivation.
 */
export interface ErpCleanLine {
  famille: string;
  montant: number;
}

export function cleanErpExport(lines: ErpExportLine[]): ErpCleanLine[] {
  const seen = new Set<string>();
  const clean: ErpCleanLine[] = [];

  for (const line of lines) {
    if (seen.has(line.piece)) {
      continue;
    }

    seen.add(line.piece);

    const montant = Number(line.montant.replace(/\s+/g, ""));

    if (!Number.isFinite(montant)) {
      throw new Error(`Montant illisible dans l'export ERP : « ${line.montant} ».`);
    }

    clean.push({ famille: line.famille.toUpperCase(), montant });
  }

  return clean;
}

export const erpClean: ErpCleanLine[] = cleanErpExport(erpExport);

export interface ForecastDriverLine {
  poste: string;
  realiseN: number;
  tauxCroissance: number;
}

/** Mirrors `datasets/excel/forecast_drivers.csv`. */
export const forecastDrivers: ForecastDriverLine[] = [
  { poste: "Chiffre d'affaires", realiseN: 600000, tauxCroissance: 0.06 },
  { poste: "Achats consommes", realiseN: -300000, tauxCroissance: 0.05 },
  { poste: "Autres achats et charges externes", realiseN: -96000, tauxCroissance: 0.03 },
  { poste: "Charges de personnel", realiseN: -132000, tauxCroissance: 0.04 },
  { poste: "Impots et taxes", realiseN: -14000, tauxCroissance: 0.02 },
  { poste: "Dotations aux amortissements", realiseN: -21000, tauxCroissance: 0 }
];

export function parseForecastDriversCsv(text: string): ForecastDriverLine[] {
  return parseCsv(text).rows.map((row) => ({
    poste: row.poste,
    realiseN: csvNumber(row, "realise_n"),
    tauxCroissance: csvNumber(row, "taux_croissance")
  }));
}

export interface WeeklyCashLine {
  semaine: string;
  encaissements: number;
  decaissements: number;
}

/** Mirrors `datasets/excel/cash_13_semaines.csv`. */
export const cash13Semaines: WeeklyCashLine[] = [
  { semaine: "S1", encaissements: 42000, decaissements: 39500 },
  { semaine: "S2", encaissements: 38500, decaissements: 41200 },
  { semaine: "S3", encaissements: 45200, decaissements: 40100 },
  { semaine: "S4", encaissements: 36800, decaissements: 44700 },
  { semaine: "S5", encaissements: 39900, decaissements: 38200 },
  { semaine: "S6", encaissements: 41500, decaissements: 47300 },
  { semaine: "S7", encaissements: 44100, decaissements: 40800 },
  { semaine: "S8", encaissements: 37600, decaissements: 43900 },
  { semaine: "S9", encaissements: 43800, decaissements: 39600 },
  { semaine: "S10", encaissements: 40200, decaissements: 45100 },
  { semaine: "S11", encaissements: 46700, decaissements: 41000 },
  { semaine: "S12", encaissements: 39300, decaissements: 42800 },
  { semaine: "S13", encaissements: 47500, decaissements: 40900 }
];

export function parseCash13SemainesCsv(text: string): WeeklyCashLine[] {
  return parseCsv(text).rows.map((row) => ({
    semaine: row.semaine,
    encaissements: csvNumber(row, "encaissements"),
    decaissements: csvNumber(row, "decaissements")
  }));
}

export interface AsterLine {
  poste: string;
  valeur: number;
}

/** Mirrors `datasets/excel/aster_industrie.csv`. */
export const asterIndustrie: AsterLine[] = [
  { poste: "Resultat d'exploitation", valeur: 46000 },
  { poste: "Taux d'imposition", valeur: 0.25 },
  { poste: "Dotations aux amortissements", valeur: 21000 },
  { poste: "Investissements", valeur: 18000 },
  { poste: "Variation du BFR", valeur: 6000 },
  { poste: "Dette financiere", valeur: 120000 },
  { poste: "Capitaux propres", valeur: 180000 },
  { poste: "Cout de la dette", valeur: 0.05 },
  { poste: "Cout des capitaux propres", valeur: 0.09 },
  { poste: "Remboursement annuel de la dette", valeur: 15000 },
  { poste: "Croissance long terme", valeur: 0.015 }
];

export function parseAsterCsv(text: string): AsterLine[] {
  return parseCsv(text).rows.map((row) => ({
    poste: row.poste,
    valeur: csvNumber(row, "valeur")
  }));
}

export interface DcfLine {
  annee: number;
  fcf: number;
  /** 1/(1+WACC)^n arrondi à trois décimales — fourni, le moteur n'a pas de puissance. */
  coefficient: number;
}

/** Mirrors `datasets/excel/dcf_aster.csv`. */
export const dcfAster: DcfLine[] = [
  { annee: 1, fcf: 31500, coefficient: 0.935 },
  { annee: 2, fcf: 33200, coefficient: 0.875 },
  { annee: 3, fcf: 34800, coefficient: 0.819 },
  { annee: 4, fcf: 36100, coefficient: 0.766 },
  { annee: 5, fcf: 37400, coefficient: 0.716 }
];

export function parseDcfCsv(text: string): DcfLine[] {
  return parseCsv(text).rows.map((row) => ({
    annee: csvNumber(row, "annee"),
    fcf: csvNumber(row, "fcf"),
    coefficient: csvNumber(row, "coefficient")
  }));
}

/**
 * Mirror de `datasets/excel/vba/export_tresorerie.bas`, affiché dans l'éditeur
 * en lecture seule et proposé au téléchargement. Le test d'anti-dérive lit le
 * fichier et l'affirme égal à cette constante ; rien, nulle part, ne l'exécute.
 */
export const exportTresorerieVba = `Attribute VB_Name = "ExportTresorerie"
Option Explicit

' Exporte l'onglet "Treso13" en CSV a cote du classeur.
' Ce module est fourni pour lecture et pour un usage local dans Excel :
' la plateforme ne l'execute jamais.
Sub ExporterTresorerieCsv()
    Dim ws As Worksheet
    Dim chemin As String

    Set ws = ThisWorkbook.Worksheets("Treso13")
    chemin = ThisWorkbook.Path & Application.PathSeparator & "treso_13_semaines.csv"

    Application.ScreenUpdating = False
    ws.Copy
    ActiveWorkbook.SaveAs Filename:=chemin, FileFormat:=xlCSV, Local:=True
    ActiveWorkbook.Close SaveChanges:=False
    Application.ScreenUpdating = True
End Sub
`;

// --- Compétences et niveaux ---------------------------------------------------

export const excelLabAvanceCompetencies: Competency[] = [
  {
    id: "xl-donnees-propres",
    domainId: "finance",
    name: "Fiabiliser des donnees avant de calculer",
    levelMin: 3,
    levelMax: 3,
    status: "not-started",
    strength: 0,
    focus: "Diagnostiquer un export ERP : doublons, montants en texte, libelles incoherents."
  },
  {
    id: "xl-previsions",
    domainId: "finance",
    name: "Construire une prevision qui suit ses hypotheses",
    levelMin: 3,
    levelMax: 4,
    status: "not-started",
    strength: 0,
    focus: "Relier chaque cellule calculee a ses hypotheses et verrouiller par un controle."
  },
  {
    id: "xl-modelisation-dcf",
    domainId: "finance",
    name: "Relier trois etats et valoriser par DCF",
    levelMin: 4,
    levelMax: 4,
    status: "not-started",
    strength: 0,
    focus: "Du resultat d'exploitation au flux disponible, du WACC a la valeur terminale."
  },
  {
    id: "xl-audit-automatisation",
    domainId: "finance",
    name: "Auditer un modele et automatiser avec discernement",
    levelMin: 4,
    levelMax: 4,
    status: "not-started",
    strength: 0,
    focus: "Reperer constantes en dur, references cassees et cycles ; lire une macro avant de s'en servir."
  }
];

export const excelLabAvanceLevels: ModuleLevelDefinition[] = [
  {
    id: "level-excel-finance-3",
    trackId: EXCEL_LAB_TRACK,
    moduleId: "module-excel-finance-lab",
    domainId: "finance",
    level: 3,
    title: "Donnees propres, modeles et previsions",
    objective:
      "Fiabiliser un export ERP, construire un compte de resultat previsionnel et une tresorerie a treize semaines, verrouiller le tout par des controles de coherence.",
    competencyIds: ["xl-donnees-propres", "xl-previsions", "xl-formules"],
    criticalCompetencyIds: ["xl-donnees-propres"],
    estimatedMinutes: 150,
    publicationStatus: "published"
  },
  {
    id: "level-excel-finance-4",
    trackId: EXCEL_LAB_TRACK,
    moduleId: "module-excel-finance-lab",
    domainId: "finance",
    level: 4,
    title: "Modelisation financiere, DCF et audit de modele",
    objective:
      "Relier les trois etats, calculer WACC et valeur terminale, mesurer une sensibilite et auditer le modele — VBA presente en lecture, jamais execute.",
    competencyIds: ["xl-modelisation-dcf", "xl-audit-automatisation", "xl-previsions"],
    criticalCompetencyIds: ["xl-modelisation-dcf"],
    estimatedMinutes: 180,
    publicationStatus: "published"
  }
];

// --- Grilles ------------------------------------------------------------------

/**
 * Les cellules données d'une grille, sous la forme que le moteur consomme. Le
 * classeur du spec est *dérivé* de la grille affichée, jamais recopié : une
 * cellule déplacée dans l'une bouge dans l'autre, et le test de contenu
 * l'affirme.
 */
export function gridWorkbook(grid: LabGrid): Record<string, WorkbookCellInput> {
  const cells: Record<string, WorkbookCellInput> = {};

  grid.columns.forEach((label, columnIndex) => {
    if (label !== "") {
      cells[cellRef(columnIndex, 1)] = label;
    }
  });

  grid.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell.kind === "label") {
        cells[cellRef(columnIndex, rowIndex + 2)] = cell.text;
      } else if (cell.kind === "given") {
        cells[cellRef(columnIndex, rowIndex + 2)] = cell.value;
      }
    });
  });

  return cells;
}

const ERP_COLUMNS = ["Famille", "Montant (EUR)"];

/** Lignes 2 à 10 : l'export fiabilisé, en lecture seule. */
const erpCleanRows: LabGrid["rows"] = erpClean.map((line) => [
  { kind: "label", text: line.famille },
  { kind: "given", value: line.montant }
]);

const erpGrid: LabGrid = {
  columns: ERP_COLUMNS,
  rows: [
    ...erpCleanRows,
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Total VENTES" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Total ACHATS" }, { kind: "input", wantsFormula: true }]
  ]
};

const PNL_FORECAST_COLUMNS = ["Poste", "Realise N (EUR)"];

const pnlForecastGrid: LabGrid = {
  columns: PNL_FORECAST_COLUMNS,
  rows: [
    ...forecastDrivers.map((line): LabGrid["rows"][number] => [
      { kind: "label", text: line.poste },
      { kind: "given", value: line.realiseN }
    ]),
    [{ kind: "label", text: "Total des charges" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Resultat d'exploitation" }, { kind: "input", wantsFormula: true }]
  ]
};

const forecastGrid: LabGrid = {
  columns: ["Poste", "Realise N", "Prevision N+1"],
  rows: [
    [
      { kind: "label", text: "Taux de croissance du CA" },
      { kind: "given", value: 0.06 },
      { kind: "blank" }
    ],
    [
      { kind: "label", text: "Chiffre d'affaires" },
      { kind: "given", value: 600000 },
      { kind: "input", wantsFormula: true }
    ]
  ]
};

const coherenceGrid: LabGrid = {
  columns: ["Controle", "Valeur"],
  rows: [
    [{ kind: "label", text: "Ventes par famille (SOMME.SI)" }, { kind: "given", value: 51200 }],
    [{ kind: "label", text: "Total de controle de l'export ERP" }, { kind: "given", value: 51200 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Statut du controle" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Ecart en valeur" }, { kind: "input", wantsFormula: true }]
  ]
};

const CASH13_COLUMNS = ["Semaine", "Encaissements", "Decaissements"];

const cash13TotauxGrid: LabGrid = {
  columns: CASH13_COLUMNS,
  rows: [
    ...cash13Semaines.map((line): LabGrid["rows"][number] => [
      { kind: "label", text: line.semaine },
      { kind: "given", value: line.encaissements },
      { kind: "given", value: line.decaissements }
    ]),
    [
      { kind: "label", text: "Total des treize semaines" },
      { kind: "input", wantsFormula: true },
      { kind: "input", wantsFormula: true }
    ]
  ]
};

const cash13SoldeGrid: LabGrid = {
  columns: ["Semaine", "Encaissements", "Decaissements", "Solde net", "Position fin de semaine"],
  rows: [
    [
      { kind: "label", text: "Ouverture" },
      { kind: "blank" },
      { kind: "blank" },
      { kind: "blank" },
      { kind: "given", value: 18000 }
    ],
    [
      { kind: "label", text: "S1" },
      { kind: "given", value: 42000 },
      { kind: "given", value: 39500 },
      { kind: "input", wantsFormula: true },
      { kind: "input", wantsFormula: true }
    ],
    [
      { kind: "label", text: "S2" },
      { kind: "given", value: 38500 },
      { kind: "given", value: 41200 },
      { kind: "given", value: -2700 },
      { kind: "input", wantsFormula: true }
    ],
    ...cash13Semaines.slice(2).map((line): LabGrid["rows"][number] => [
      { kind: "label", text: line.semaine },
      { kind: "given", value: line.encaissements },
      { kind: "given", value: line.decaissements },
      { kind: "blank" },
      { kind: "blank" }
    ])
  ]
};

const troisEtatsGrid: LabGrid = {
  columns: ["Poste", "Montant"],
  rows: [
    [{ kind: "label", text: "Resultat d'exploitation" }, { kind: "given", value: 46000 }],
    [{ kind: "label", text: "Taux d'imposition" }, { kind: "given", value: 0.25 }],
    [{ kind: "label", text: "Dotations aux amortissements" }, { kind: "given", value: 21000 }],
    [{ kind: "label", text: "Investissements" }, { kind: "given", value: 18000 }],
    [{ kind: "label", text: "Variation du BFR" }, { kind: "given", value: 6000 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Resultat d'exploitation apres impot" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Flux de tresorerie disponible" }, { kind: "input", wantsFormula: true }]
  ]
};

const waccGrid: LabGrid = {
  columns: ["Poste", "Valeur"],
  rows: [
    [{ kind: "label", text: "Dette financiere" }, { kind: "given", value: 120000 }],
    [{ kind: "label", text: "Capitaux propres" }, { kind: "given", value: 180000 }],
    [{ kind: "label", text: "Cout de la dette" }, { kind: "given", value: 0.05 }],
    [{ kind: "label", text: "Cout des capitaux propres" }, { kind: "given", value: 0.09 }],
    [{ kind: "label", text: "Taux d'imposition" }, { kind: "given", value: 0.25 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Poids des capitaux propres" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "WACC" }, { kind: "input", wantsFormula: true }]
  ]
};

const dcfGrid: LabGrid = {
  columns: ["Annee", "Flux disponible", "Coefficient", "Valeur actualisee"],
  rows: [
    [
      { kind: "label", text: "Annee 1" },
      { kind: "given", value: 31500 },
      { kind: "given", value: 0.935 },
      { kind: "input", wantsFormula: true }
    ],
    [
      { kind: "label", text: "Annee 2" },
      { kind: "given", value: 33200 },
      { kind: "given", value: 0.875 },
      { kind: "given", value: 29050 }
    ],
    [
      { kind: "label", text: "Annee 3" },
      { kind: "given", value: 34800 },
      { kind: "given", value: 0.819 },
      { kind: "given", value: 28501.2 }
    ],
    [
      { kind: "label", text: "Annee 4" },
      { kind: "given", value: 36100 },
      { kind: "given", value: 0.766 },
      { kind: "given", value: 27652.6 }
    ],
    [
      { kind: "label", text: "Annee 5" },
      { kind: "given", value: 37400 },
      { kind: "given", value: 0.716 },
      { kind: "given", value: 26778.4 }
    ],
    [
      { kind: "label", text: "Valeur actualisee des cinq flux" },
      { kind: "blank" },
      { kind: "blank" },
      { kind: "input", wantsFormula: true }
    ]
  ]
};

const terminaleGrid: LabGrid = {
  columns: ["Hypothese", "Valeur"],
  rows: [
    [{ kind: "label", text: "Flux disponible annee 5" }, { kind: "given", value: 37400 }],
    [{ kind: "label", text: "Croissance long terme" }, { kind: "given", value: 0.015 }],
    [{ kind: "label", text: "WACC" }, { kind: "given", value: 0.069 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Valeur terminale" }, { kind: "input", wantsFormula: true }]
  ]
};

const detteGrid: LabGrid = {
  columns: ["Poste", "Valeur"],
  rows: [
    [{ kind: "label", text: "Dette a l'ouverture" }, { kind: "given", value: 120000 }],
    [{ kind: "label", text: "Taux d'interet" }, { kind: "given", value: 0.05 }],
    [{ kind: "label", text: "Remboursement de l'annee" }, { kind: "given", value: 15000 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Interets de l'annee" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Dette a la cloture" }, { kind: "input", wantsFormula: true }]
  ]
};

const sensibiliteGrid: LabGrid = {
  columns: ["Hypothese", "Valeur"],
  rows: [
    [{ kind: "label", text: "Flux disponible annee 5" }, { kind: "given", value: 37400 }],
    [{ kind: "label", text: "Croissance long terme" }, { kind: "given", value: 0.015 }],
    [{ kind: "label", text: "WACC central" }, { kind: "given", value: 0.069 }],
    [{ kind: "label", text: "WACC degrade (+1 point)" }, { kind: "given", value: 0.079 }],
    [{ kind: "blank" }, { kind: "blank" }],
    [{ kind: "label", text: "Valeur terminale au WACC central" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Valeur terminale au WACC degrade" }, { kind: "input", wantsFormula: true }],
    [{ kind: "label", text: "Ecart relatif" }, { kind: "input", wantsFormula: true }]
  ]
};

// --- Exercices ----------------------------------------------------------------

export interface AvanceExerciseDefinition {
  exercise: Exercise;
  /** `formula-grid` passe par le moteur ; `choice` par le QCM classique. */
  kind: "formula-grid" | "choice";
  /** Présente pour les exercices `formula-grid` uniquement. */
  grid?: LabGrid;
  datasetId: LabDatasetId;
}

interface AvanceSeed {
  id: string;
  level: 3 | 4;
  minutes: number;
  type: Exercise["type"];
  title: string;
  statement: string;
  expectedAnswer: string;
  competencyIds: string[];
  rubric: Array<{ label: string; points: number }>;
  kind: AvanceExerciseDefinition["kind"];
  grid?: LabGrid;
  datasetId: LabDatasetId;
}

function toAvanceExercise(seed: AvanceSeed): AvanceExerciseDefinition {
  return {
    exercise: {
      id: seed.id,
      domainId: "finance",
      type: seed.type,
      title: seed.title,
      level: seed.level,
      estimatedMinutes: seed.minutes,
      statement: seed.statement,
      expectedAnswer: seed.expectedAnswer,
      rubric: seed.rubric,
      competencyIds: seed.competencyIds,
      sourceChunkIds: []
    },
    kind: seed.kind,
    grid: seed.grid,
    datasetId: seed.datasetId
  };
}

const RUBRIC_RESULT_AND_METHOD = [
  { label: "Resultat calcule par le moteur", points: 12 },
  { label: "Formule robuste au changement des donnees", points: 8 }
];

export const excelLabAvanceDefinitions: AvanceExerciseDefinition[] = [
  // --- N3 -------------------------------------------------------------------
  toAvanceExercise({
    id: "ex-xl-n3-erp-diagnostic",
    level: 3,
    minutes: 10,
    type: "qcm",
    title: "Diagnostic de l'export ERP",
    statement:
      "L'export ERP brut (datasets/excel/erp_export.csv) contient dix lignes.\nAvant tout calcul, identifiez les transformations a appliquer — c'est le travail que Power Query automatise, presente ici en diagnostic guide : la plateforme n'execute pas Power Query.\nCochez toutes les transformations necessaires.",
    expectedAnswer:
      "Trois defauts : des montants au format texte avec espaces de milliers (« 7 400 », « -1 150 ») a convertir en nombres ; la piece FA-103 dupliquee a dedoublonner ; la casse de la colonne famille a harmoniser (VENTES/ventes/Ventes).\nTrier ou arrondir ne corrige rien : ce sont des presentations, pas des fiabilisations.",
    competencyIds: ["xl-donnees-propres"],
    rubric: [{ label: "Transformations necessaires identifiees", points: 20 }],
    kind: "choice",
    datasetId: "erp_export"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-tri-familles",
    level: 3,
    minutes: 12,
    type: "calculation",
    title: "Totaux par famille sur donnees fiabilisees",
    statement:
      "L'export fiabilise est donne en lignes 2 a 10 (familles en colonne A, montants en colonne B).\nEn B12, totalisez les VENTES ; en B13, totalisez les ACHATS.\nUtilisez une somme conditionnelle (SOMME.SI ou SOMME.SI.ENS) : le total doit suivre l'ajout d'une piece.",
    expectedAnswer:
      "B12 = 51 200 EUR avec =SOMME.SI(A2:A10;\"VENTES\";B2:B10).\nB13 = -10 700 EUR avec =SOMME.SI(A2:A10;\"ACHATS\";B2:B10).\nUne addition de cellules choisies a la main donne le meme chiffre aujourd'hui et un chiffre faux des la prochaine piece importee.",
    competencyIds: ["xl-donnees-propres", "xl-formules"],
    rubric: [
      { label: "Total des ventes", points: 10 },
      { label: "Total des achats", points: 10 }
    ],
    kind: "formula-grid",
    grid: erpGrid,
    datasetId: "erp_export"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-modele-pnl",
    level: 3,
    minutes: 12,
    type: "calculation",
    title: "Compte de resultat previsionnel — totaux",
    statement:
      "Les postes du compte de resultat sont donnes en lignes 2 a 7, en montants signes (les charges sont negatives).\nEn B8, totalisez les charges d'exploitation (lignes 3 a 7) avec une somme sur la plage.\nEn B9, calculez le resultat d'exploitation.",
    expectedAnswer:
      "B8 = -563 000 EUR avec =SOMME(B3:B7).\nB9 = 37 000 EUR avec =B2+B8 (ou =SOMME(B2:B7)).\nLes montants signes permettent de sommer sans jongler avec les signes : c'est ce qui rend le modele auditable.",
    competencyIds: ["xl-previsions", "xl-formules"],
    rubric: [
      { label: "Total des charges", points: 10 },
      { label: "Resultat d'exploitation", points: 10 }
    ],
    kind: "formula-grid",
    grid: pnlForecastGrid,
    datasetId: "forecast_drivers"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-forecast-croissance",
    level: 3,
    minutes: 10,
    type: "calculation",
    title: "Prevision de chiffre d'affaires",
    statement:
      "Le taux de croissance du chiffre d'affaires est en B2, le realise N en B3.\nEn C3, calculez la prevision N+1.\nEcrivez la formule comme si elle devait etre recopiee sur d'autres postes : le taux se fige avec une reference absolue ($B$2), les references relatives suivent la ligne.",
    expectedAnswer:
      "C3 = 600 000 x (1 + 0,06) = 636 000 EUR, formule =B3*(1+$B$2) (les references absolues et relatives sont equivalentes ici, elles different a la recopie).\nLa prevision doit lire le taux dans sa cellule : un 1,06 ecrit en dur ne suit plus l'hypothese.",
    competencyIds: ["xl-previsions", "xl-formules"],
    rubric: RUBRIC_RESULT_AND_METHOD,
    kind: "formula-grid",
    grid: forecastGrid,
    datasetId: "forecast_drivers"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-treso-totaux",
    level: 3,
    minutes: 10,
    type: "calculation",
    title: "Totaux des treize semaines",
    statement:
      "La prevision de tresorerie hebdomadaire est donnee en lignes 2 a 14.\nEn B15 et C15, totalisez les encaissements et les decaissements des treize semaines, chacun par une somme sur la plage.",
    expectedAnswer:
      "B15 = 543 100 EUR avec =SOMME(B2:B14) ; C15 = 545 100 EUR avec =SOMME(C2:C14).\nLe trimestre decaisse 2 000 EUR de plus qu'il n'encaisse : c'est la premiere alerte de la prevision.",
    competencyIds: ["xl-previsions", "xl-formules"],
    rubric: [
      { label: "Total des encaissements", points: 10 },
      { label: "Total des decaissements", points: 10 }
    ],
    kind: "formula-grid",
    grid: cash13TotauxGrid,
    datasetId: "cash_13_semaines"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-treso-solde",
    level: 3,
    minutes: 15,
    type: "calculation",
    title: "Solde hebdomadaire et position de tresorerie",
    statement:
      "La position d'ouverture (18 000 EUR) est en E2. Les flux de S1 sont en ligne 3, ceux de S2 en ligne 4 (solde net de S2 deja calcule en D4).\nEn D3, calculez le solde net de S1.\nEn E3, la position fin S1 ; en E4, la position fin S2 : chaque position se deduit de la precedente.",
    expectedAnswer:
      "D3 = 42 000 - 39 500 = 2 500 EUR (=B3-C3).\nE3 = 18 000 + 2 500 = 20 500 EUR (=E2+D3).\nE4 = 20 500 - 2 700 = 17 800 EUR (=E3+D4).\nLa position est cumulative : elle repart de la cellule du dessus, jamais de l'ouverture recopiee.",
    competencyIds: ["xl-previsions", "xl-formules"],
    rubric: [
      { label: "Solde net de la semaine 1", points: 8 },
      { label: "Position fin de semaine 1", points: 6 },
      { label: "Position fin de semaine 2", points: 6 }
    ],
    kind: "formula-grid",
    grid: cash13SoldeGrid,
    datasetId: "cash_13_semaines"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-controle-coherence",
    level: 3,
    minutes: 10,
    type: "calculation",
    title: "Controle de coherence",
    statement:
      "Le total des ventes calcule par SOMME.SI est en B2 ; le total de controle fourni par l'export ERP est en B3.\nEn B5, ecrivez un controle avec SI qui affiche OK si les deux totaux concordent et ECART sinon.\nEn B6, chiffrez l'ecart en valeur (B2 moins B3).",
    expectedAnswer:
      "B5 = \"OK\" avec =SI(B2=B3;\"OK\";\"ECART\").\nB6 = 0 avec =B2-B3.\nUn modele sans cellule de controle est un modele dont personne ne voit la derive : le controle doit etre calcule, pas tape.",
    competencyIds: ["xl-previsions", "xl-formules"],
    rubric: [
      { label: "Statut du controle", points: 10 },
      { label: "Ecart chiffre", points: 10 }
    ],
    kind: "formula-grid",
    grid: coherenceGrid,
    datasetId: "erp_export"
  }),
  toAvanceExercise({
    id: "ex-xl-n3-let-lecture",
    level: 3,
    minutes: 8,
    type: "qcm",
    title: "Lire une formule LET",
    statement:
      "Excel moderne permet de nommer des etapes intermediaires avec LET.\nSoit la formule :\n=LET(ca; SOMME(B2:B10); charges; SOMME(C2:C10); ca - charges)\nQue calcule-t-elle ?\nNote : LET est presente ici en lecture ; le laboratoire ne l'execute pas.",
    expectedAnswer:
      "Elle nomme ca (total des produits) et charges (total des charges), puis renvoie ca - charges : le resultat.\nLET ne modifie aucune cellule ; il rend lisible une formule qui, sinon, repeterait deux SOMME.",
    competencyIds: ["xl-previsions"],
    rubric: [{ label: "Lecture correcte de LET", points: 20 }],
    kind: "choice",
    datasetId: "forecast_drivers"
  }),

  // --- N4 -------------------------------------------------------------------
  toAvanceExercise({
    id: "ex-xl-n4-trois-etats",
    level: 4,
    minutes: 12,
    type: "calculation",
    title: "Du resultat au flux disponible",
    statement:
      "Les donnees d'Aster Industrie sont en lignes 2 a 6.\nEn B8, calculez le resultat d'exploitation apres impot.\nEn B9, le flux de tresorerie disponible : resultat apres impot, plus dotations, moins investissements, moins variation du BFR.",
    expectedAnswer:
      "B8 = 46 000 x (1 - 0,25) = 34 500 EUR (=B2*(1-B3)).\nB9 = 34 500 + 21 000 - 18 000 - 6 000 = 31 500 EUR (=B8+B4-B5-B6).\nLes dotations se rajoutent parce qu'elles n'ont jamais quitte la tresorerie ; les investissements se deduisent parce qu'ils la quittent sans passer par le resultat.",
    competencyIds: ["xl-modelisation-dcf", "xl-formules"],
    rubric: [
      { label: "Resultat apres impot", points: 10 },
      { label: "Flux de tresorerie disponible", points: 10 }
    ],
    kind: "formula-grid",
    grid: troisEtatsGrid,
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-wacc",
    level: 4,
    minutes: 12,
    type: "calculation",
    title: "Cout moyen pondere du capital",
    statement:
      "Structure financiere d'Aster Industrie en lignes 2 a 6 (taux en decimal : 0,05 pour 5 %).\nEn B8, calculez le poids des capitaux propres dans le financement total.\nEn B9, le WACC : poids des capitaux propres x leur cout, plus poids de la dette x son cout apres impot.",
    expectedAnswer:
      "B8 = 180 000 / (120 000 + 180 000) = 0,60 (=B3/(B2+B3)).\nB9 = 0,60 x 0,09 + 0,40 x 0,05 x (1 - 0,25) = 0,069 (=B8*B5+(1-B8)*B4*(1-B6)).\nLe cout de la dette est apres impot : les interets sont deductibles.",
    competencyIds: ["xl-modelisation-dcf", "xl-formules"],
    rubric: [
      { label: "Poids des capitaux propres", points: 10 },
      { label: "WACC", points: 10 }
    ],
    kind: "formula-grid",
    grid: waccGrid,
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-dcf-actualisation",
    level: 4,
    minutes: 12,
    type: "calculation",
    title: "Actualisation des flux",
    statement:
      "Le plan d'Aster Industrie donne cinq flux disponibles et leurs coefficients d'actualisation au WACC de 6,9 % (coefficients fournis, arrondis a trois decimales : le laboratoire n'a pas d'operateur puissance).\nEn D2, actualisez le flux de l'annee 1.\nEn D7, totalisez les cinq valeurs actualisees par une somme sur la plage.",
    expectedAnswer:
      "D2 = 31 500 x 0,935 = 29 452,50 EUR (=B2*C2).\nD7 = 141 434,70 EUR (=SOMME(D2:D6)).\nActualiser, c'est multiplier chaque flux par son coefficient : un euro de l'annee 5 vaut 0,716 euro d'aujourd'hui.",
    competencyIds: ["xl-modelisation-dcf", "xl-formules"],
    rubric: [
      { label: "Flux actualise de l'annee 1", points: 10 },
      { label: "Somme des flux actualises", points: 10 }
    ],
    kind: "formula-grid",
    grid: dcfGrid,
    datasetId: "dcf_aster"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-valeur-terminale",
    level: 4,
    minutes: 10,
    type: "calculation",
    title: "Valeur terminale",
    statement:
      "Hypotheses en lignes 2 a 4 : flux de l'annee 5, croissance long terme, WACC.\nEn B6, calculez la valeur terminale par la formule de Gordon-Shapiro : flux de l'annee 5 x (1 + croissance) / (WACC - croissance).",
    expectedAnswer:
      "B6 = 37 400 x 1,015 / (0,069 - 0,015) = 37 961 / 0,054 = 702 981,48 EUR (=B2*(1+B3)/(B4-B3)).\nLe denominateur est l'ecart entre WACC et croissance : plus il est etroit, plus la valeur explose — d'ou l'exercice de sensibilite qui suit.",
    competencyIds: ["xl-modelisation-dcf", "xl-formules"],
    rubric: RUBRIC_RESULT_AND_METHOD,
    kind: "formula-grid",
    grid: terminaleGrid,
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-dette",
    level: 4,
    minutes: 10,
    type: "calculation",
    title: "Echeancier de dette",
    statement:
      "La dette d'Aster Industrie : ouverture en B2, taux en B3, remboursement de l'annee en B4.\nEn B6, calculez les interets de l'annee (sur la dette d'ouverture).\nEn B7, la dette a la cloture.",
    expectedAnswer:
      "B6 = 120 000 x 0,05 = 6 000 EUR (=B2*B3).\nB7 = 120 000 - 15 000 = 105 000 EUR (=B2-B4).\nLes interets se calculent sur l'ouverture : le remboursement de l'annee ne porte pas encore interet.",
    competencyIds: ["xl-modelisation-dcf", "xl-formules"],
    rubric: [
      { label: "Interets de l'annee", points: 10 },
      { label: "Dette a la cloture", points: 10 }
    ],
    kind: "formula-grid",
    grid: detteGrid,
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-sensibilite",
    level: 4,
    minutes: 15,
    type: "calculation",
    title: "Sensibilite de la valeur terminale au WACC",
    statement:
      "Hypotheses en lignes 2 a 5 : flux de l'annee 5, croissance, WACC central (6,9 %) et WACC degrade (7,9 %).\nEn B7 et B8, calculez la valeur terminale a chacun des deux taux.\nEn B9, l'ecart relatif : (valeur degradee - valeur centrale) / valeur centrale.",
    expectedAnswer:
      "B7 = 37 961 / 0,054 = 702 981,48 EUR (=B2*(1+B3)/(B4-B3)).\nB8 = 37 961 / 0,064 = 593 140,63 EUR (=B2*(1+B3)/(B5-B3)).\nB9 = -0,15625, soit -15,6 % (=(B8-B7)/B7).\nUn point de WACC efface plus de 15 % de la valeur terminale : c'est l'hypothese a documenter en premier.",
    competencyIds: ["xl-modelisation-dcf", "xl-previsions"],
    rubric: [
      { label: "Valeur terminale au WACC central", points: 8 },
      { label: "Valeur terminale au WACC degrade", points: 6 },
      { label: "Ecart relatif", points: 6 }
    ],
    kind: "formula-grid",
    grid: sensibiliteGrid,
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-audit-modele",
    level: 4,
    minutes: 10,
    type: "qcm",
    title: "Audit du modele Aster",
    statement:
      "Vous relisez le modele de valorisation d'Aster Industrie avant remise.\nParmi les constats suivants, cochez ceux qui constituent des anomalies a corriger.",
    expectedAnswer:
      "Trois anomalies : des constantes en dur dans des cellules de calcul (le modele ne suit plus ses hypotheses) ; une cellule en #REF! (reference cassee, le calcul est faux quelque part) ; une reference circulaire resultat/frais financiers (le classeur converge par accident, pas par construction).\nRegrouper les hypotheses et recalculer le WACC par scenario sont au contraire des bonnes pratiques.",
    competencyIds: ["xl-audit-automatisation"],
    rubric: [{ label: "Anomalies identifiees", points: 20 }],
    kind: "choice",
    datasetId: "aster_industrie"
  }),
  toAvanceExercise({
    id: "ex-xl-n4-vba-lecture",
    level: 4,
    minutes: 10,
    type: "qcm",
    title: "Lire une macro VBA avant de s'en servir",
    statement:
      "Le module VBA ExportTresorerie (datasets/excel/vba/export_tresorerie.bas) est affiche ci-dessous en lecture seule et telechargeable pour un usage local dans Excel — la plateforme n'execute jamais de macro.\n\n" +
      exportTresorerieVba +
      "\nQue fait la procedure ExporterTresorerieCsv ?",
    expectedAnswer:
      "Elle copie l'onglet Treso13 dans un classeur temporaire, l'enregistre en CSV a cote du classeur d'origine, puis ferme la copie sans rien modifier au classeur source.\nLire une macro avant de l'executer est la premiere regle d'hygiene : celle-ci n'ecrit que le fichier treso_13_semaines.csv.",
    competencyIds: ["xl-audit-automatisation"],
    rubric: [{ label: "Lecture correcte de la macro", points: 20 }],
    kind: "choice",
    datasetId: "cash_13_semaines"
  })
];

export const excelLabAvanceExercises: Exercise[] = excelLabAvanceDefinitions.map(
  (definition) => definition.exercise
);

export function getExcelLabAvanceDefinition(exerciseId: string): AvanceExerciseDefinition | null {
  return (
    excelLabAvanceDefinitions.find((definition) => definition.exercise.id === exerciseId) ?? null
  );
}

export function getExcelLabAvanceExercises(level: 3 | 4): Exercise[] {
  return excelLabAvanceExercises.filter((exercise) => exercise.level === level);
}

export const excelLabAvanceLevelByExercise: Record<string, string> = Object.fromEntries(
  excelLabAvanceExercises.map((exercise) => [
    exercise.id,
    exercise.level === 3 ? "level-excel-finance-3" : "level-excel-finance-4"
  ])
);

export function getExcelLabAvanceLevel(exerciseId: string): string | null {
  return excelLabAvanceLevelByExercise[exerciseId] ?? null;
}

// --- Spécifications autorées --------------------------------------------------
//
// Chaque spec dérive son classeur de la grille affichée (`gridWorkbook`), et
// chaque cellule notée est couverte par au moins une perturbation — l'évaluateur
// le refuse sinon. Les montants attendus sous perturbation sont recalculés à la
// main ici et re-dérivés des datasets dans les tests de contenu.

function avanceVersion(
  exerciseId: string,
  spec: FormulaSpreadsheetSpec,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "spreadsheet_formula",
    spec,
    testCases
  };
}

function choiceVersion(
  exerciseId: string,
  spec: MultipleChoiceSpec,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "multiple_choice",
    spec,
    testCases
  };
}

/** Money to the euro; the datasets carry no cents beyond the DCF decimals. */
const EURO = { toleranceAbs: 0.5 };
/** Rates in decimals, held to a tenth of a point. */
const RATE = { toleranceAbs: 0.001 };

function gridOf(exerciseId: string): LabGrid {
  const definition = getExcelLabAvanceDefinition(exerciseId);

  if (!definition?.grid) {
    throw new Error(`Exercise "${exerciseId}" has no grid to derive a workbook from.`);
  }

  return definition.grid;
}

export const excelLabAvanceExerciseVersions: AuthoredExerciseVersion[] = [
  choiceVersion(
    "ex-xl-n3-erp-diagnostic",
    {
      label: "Transformations a appliquer",
      options: [
        {
          id: "montants-texte",
          label: "Convertir la colonne montant en nombre (espaces de milliers)",
          rationale:
            "« 7 400 » et « -1 150 » sont du texte : toute somme les ignorerait ou echouerait."
        },
        {
          id: "doublon",
          label: "Supprimer la ligne dupliquee FA-103",
          rationale: "La piece FA-103 apparait deux fois : 15 200 EUR comptes en double."
        },
        {
          id: "casse-famille",
          label: "Harmoniser la casse de la colonne famille",
          rationale: "VENTES, ventes et Ventes doivent devenir une seule famille."
        },
        {
          id: "tri-montant",
          label: "Trier les lignes par montant decroissant",
          rationale: "Un tri change la presentation, pas la fiabilite des totaux."
        },
        {
          id: "arrondi-centaine",
          label: "Arrondir les montants a la centaine",
          rationale: "Arrondir degrade les donnees au lieu de les fiabiliser."
        }
      ],
      correctOptionIds: ["montants-texte", "doublon", "casse-famille"]
    },
    [
      {
        name: "diagnostic-complet",
        submission: {
          kind: "choice",
          selectedOptionIds: ["montants-texte", "doublon", "casse-famille"]
        },
        expectedScore: 20
      },
      {
        // Tout cocher ne discrimine rien : le bareme du QCM le note zero.
        name: "tout-cocher",
        submission: {
          kind: "choice",
          selectedOptionIds: [
            "montants-texte",
            "doublon",
            "casse-famille",
            "tri-montant",
            "arrondi-centaine"
          ]
        },
        expectedScore: 0
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-tri-familles",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-tri-familles")),
      checks: [
        {
          cell: "B12",
          label: "Total des ventes",
          points: 10,
          expectedValue: 51200,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["A2:A10", "B2:B10"],
          formulaHint: "Somme conditionnelle sur la famille : =SOMME.SI(A2:A10;\"VENTES\";B2:B10)."
        },
        {
          cell: "B13",
          label: "Total des achats",
          points: 10,
          expectedValue: -10700,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["A2:A10", "B2:B10"],
          formulaHint: "Meme plage, autre critere : =SOMME.SI(A2:A10;\"ACHATS\";B2:B10)."
        }
      ],
      perturbations: [
        {
          name: "vente-lyon-revisee",
          label: "la vente FA-101 passe de 12 500 a 13 000 EUR",
          overrides: { B2: 13000 },
          expected: { B12: 51700 }
        },
        {
          name: "transport-rectifie",
          label: "le transport sur achats passe de -950 a -1 450 EUR",
          overrides: { B8: -1450 },
          expected: { B13: -11200 }
        }
      ]
    },
    [
      {
        name: "sommes-conditionnelles",
        submission: {
          kind: "spreadsheet",
          cells: {
            B12: { formula: "=SOMME.SI(A2:A10;\"VENTES\";B2:B10)" },
            B13: { formula: "=SUMIF(A2:A10,\"ACHATS\",B2:B10)" }
          }
        },
        expectedScore: 20
      },
      {
        // Les bons chiffres en dur : la moitie « resultat », rien de plus.
        name: "resultats-en-dur",
        submission: {
          kind: "spreadsheet",
          cells: { B12: { formula: "=51200" }, B13: { formula: "=-10700" } }
        },
        expectedScore: 12
      },
      {
        // Addition manuelle des lignes VENTES : juste aujourd'hui, faux a la
        // prochaine piece — la contrainte de plage retire la methode.
        name: "addition-manuelle",
        submission: {
          kind: "spreadsheet",
          cells: {
            B12: { formula: "=B2+B3+B4+B6+B10" },
            B13: { formula: "=SOMME.SI(A2:A10;\"ACHATS\";B2:B10)" }
          }
        },
        expectedScore: 16
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-modele-pnl",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-modele-pnl")),
      checks: [
        {
          cell: "B8",
          label: "Total des charges",
          points: 10,
          expectedValue: -563000,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B3:B7"],
          requiredFunctions: ["SUM"],
          formulaHint: "Sommez la plage des charges : =SOMME(B3:B7)."
        },
        {
          cell: "B9",
          label: "Resultat d'exploitation",
          points: 10,
          expectedValue: 37000,
          ...EURO,
          unit: "EUR",
          formulaHint: "Produits plus total des charges : =B2+B8, ou =SOMME(B2:B7)."
        }
      ],
      perturbations: [
        {
          name: "achats-en-hausse",
          label: "les achats consommes passent de -300 000 a -320 000 EUR",
          overrides: { B3: -320000 },
          expected: { B8: -583000, B9: 17000 }
        },
        {
          name: "ca-en-hausse",
          label: "le chiffre d'affaires passe de 600 000 a 630 000 EUR",
          overrides: { B2: 630000 },
          expected: { B9: 67000 }
        }
      ]
    },
    [
      {
        name: "totaux-en-plage",
        submission: {
          kind: "spreadsheet",
          cells: { B8: { formula: "=SOMME(B3:B7)" }, B9: { formula: "=B2+B8" } }
        },
        expectedScore: 20
      },
      {
        name: "resultat-par-somme-globale",
        submission: {
          kind: "spreadsheet",
          cells: { B8: { formula: "=SUM(B3:B7)" }, B9: { formula: "=SUM(B2:B7)" } }
        },
        expectedScore: 20
      },
      {
        name: "charges-en-dur",
        submission: {
          kind: "spreadsheet",
          cells: { B8: { formula: "=-563000" }, B9: { formula: "=B2+B8" } }
        },
        expectedScore: 16
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-forecast-croissance",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-forecast-croissance")),
      checks: [
        {
          cell: "C3",
          label: "Prevision N+1",
          points: 20,
          expectedValue: 636000,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "B3"],
          formulaHint: "Le realise multiplie par un plus le taux : =B3*(1+$B$2)."
        }
      ],
      perturbations: [
        {
          name: "croissance-revue",
          label: "le taux de croissance passe de 6 % a 10 %",
          overrides: { B2: 0.1 },
          expected: { C3: 660000 }
        },
        {
          name: "realise-revise",
          label: "le realise N est corrige a 500 000 EUR",
          overrides: { B3: 500000 },
          expected: { C3: 530000 }
        }
      ]
    },
    [
      {
        name: "reference-absolue",
        submission: {
          kind: "spreadsheet",
          cells: { C3: { formula: "=B3*(1+$B$2)" } }
        },
        expectedScore: 20
      },
      {
        name: "reference-relative",
        submission: { kind: "spreadsheet", cells: { C3: { formula: "=B3*(1+B2)" } } },
        expectedScore: 20
      },
      {
        // Le taux recopie en dur : la prevision ne suit plus l'hypothese.
        name: "taux-en-dur",
        submission: { kind: "spreadsheet", cells: { C3: { formula: "=B3*1.06" } } },
        expectedScore: 12
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-treso-totaux",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-treso-totaux")),
      checks: [
        {
          cell: "B15",
          label: "Total des encaissements",
          points: 10,
          expectedValue: 543100,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2:B14"],
          requiredFunctions: ["SUM"],
          formulaHint: "Sommez la plage des treize semaines : =SOMME(B2:B14)."
        },
        {
          cell: "C15",
          label: "Total des decaissements",
          points: 10,
          expectedValue: 545100,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["C2:C14"],
          requiredFunctions: ["SUM"],
          formulaHint: "Sommez la plage des treize semaines : =SOMME(C2:C14)."
        }
      ],
      perturbations: [
        {
          name: "s4-encaissements-revus",
          label: "les encaissements de S4 tombent a 33 800 EUR",
          overrides: { B5: 33800 },
          expected: { B15: 540100 }
        },
        {
          name: "s9-decaissements-revus",
          label: "les decaissements de S9 montent a 41 600 EUR",
          overrides: { C10: 41600 },
          expected: { C15: 547100 }
        }
      ]
    },
    [
      {
        name: "deux-sommes",
        submission: {
          kind: "spreadsheet",
          cells: {
            B15: { formula: "=SOMME(B2:B14)" },
            C15: { formula: "=SOMME(C2:C14)" }
          }
        },
        expectedScore: 20
      },
      {
        name: "une-seule-colonne",
        submission: {
          kind: "spreadsheet",
          cells: { B15: { formula: "=SUM(B2:B14)" } }
        },
        expectedScore: 10
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-treso-solde",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-treso-solde")),
      checks: [
        {
          cell: "D3",
          label: "Solde net de S1",
          points: 8,
          expectedValue: 2500,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B3", "C3"],
          formulaHint: "Encaissements moins decaissements : =B3-C3."
        },
        {
          cell: "E3",
          label: "Position fin S1",
          points: 6,
          expectedValue: 20500,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["E2"],
          formulaHint: "L'ouverture plus le solde de la semaine : =E2+D3."
        },
        {
          cell: "E4",
          label: "Position fin S2",
          points: 6,
          expectedValue: 17800,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["E3"],
          formulaHint: "La position precedente plus le solde de S2 : =E3+D4."
        }
      ],
      perturbations: [
        {
          name: "s1-decaissements-revus",
          label: "les decaissements de S1 montent a 41 500 EUR",
          overrides: { C3: 41500 },
          expected: { D3: 500, E3: 18500, E4: 15800 }
        },
        {
          name: "ouverture-revisee",
          label: "l'ouverture est corrigee a 10 000 EUR",
          overrides: { E2: 10000 },
          expected: { E3: 12500, E4: 9800 }
        }
      ]
    },
    [
      {
        name: "chaine-complete",
        submission: {
          kind: "spreadsheet",
          cells: {
            D3: { formula: "=B3-C3" },
            E3: { formula: "=E2+D3" },
            E4: { formula: "=E3+D4" }
          }
        },
        expectedScore: 20
      },
      {
        // La position recopiee depuis l'ouverture a chaque ligne : E4 ne suit
        // plus E3, la chaine est cassee.
        name: "ouverture-recopiee",
        submission: {
          kind: "spreadsheet",
          cells: {
            D3: { formula: "=B3-C3" },
            E3: { formula: "=E2+D3" },
            E4: { formula: "=18000+D3+D4" }
          }
        },
        // D3 (8) + E3 (6) + la part « resultat » de E4 (3,6) : la position est
        // juste aujourd'hui, mais elle ne suit plus ni E3 ni l'ouverture.
        expectedScore: 17.6
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n3-controle-coherence",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n3-controle-coherence")),
      checks: [
        {
          cell: "B5",
          label: "Statut du controle",
          points: 10,
          expectedValue: "OK",
          requiredRefs: ["B2", "B3"],
          requiredFunctions: ["IF"],
          formulaHint: "Un SI qui compare les deux totaux : =SI(B2=B3;\"OK\";\"ECART\")."
        },
        {
          cell: "B6",
          label: "Ecart en valeur",
          points: 10,
          expectedValue: 0,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "B3"],
          formulaHint: "La difference des deux totaux : =B2-B3."
        }
      ],
      perturbations: [
        {
          name: "controle-decale",
          label: "le total de controle tombe a 50 900 EUR",
          overrides: { B3: 50900 },
          expected: { B5: "ECART", B6: 300 }
        },
        {
          name: "ventes-decalees",
          label: "les ventes par famille tombent a 50 600 EUR",
          overrides: { B2: 50600 },
          expected: { B5: "ECART", B6: -600 }
        }
      ]
    },
    [
      {
        name: "controle-calcule",
        submission: {
          kind: "spreadsheet",
          cells: {
            B5: { formula: "=SI(B2=B3;\"OK\";\"ECART\")" },
            B6: { formula: "=B2-B3" }
          }
        },
        expectedScore: 20
      },
      {
        // « OK » tape a la main : le controle ne controle rien.
        name: "ok-tape",
        submission: {
          kind: "spreadsheet",
          cells: { B5: { formula: "=\"OK\"" }, B6: { formula: "=B2-B3" } }
        },
        // B6 complet (10) + la part « resultat » de B5 (6) : OK affiche, mais
        // rien n'est controle.
        expectedScore: 16
      }
    ]
  ),
  choiceVersion(
    "ex-xl-n3-let-lecture",
    {
      label: "Lecture de LET",
      options: [
        {
          id: "resultat",
          label: "Le total des produits moins le total des charges",
          rationale: "LET nomme ca et charges, puis renvoie leur difference : le resultat."
        },
        {
          id: "moyenne",
          label: "La moyenne des produits et des charges",
          rationale: "Aucune moyenne : les deux etapes sont des sommes, l'expression finale une soustraction."
        },
        {
          id: "modifie-cellules",
          label: "Elle remplace le contenu des cellules B2:B10",
          rationale: "LET ne modifie jamais de cellule : il nomme des valeurs le temps du calcul."
        },
        {
          id: "erreur-name",
          label: "Une erreur #NAME? dans tous les cas",
          rationale: "Dans Excel moderne LET existe ; c'est ce laboratoire qui ne l'execute pas."
        }
      ],
      correctOptionIds: ["resultat"]
    },
    [
      {
        name: "lecture-correcte",
        submission: { kind: "choice", selectedOptionIds: ["resultat"] },
        expectedScore: 20
      },
      {
        name: "confusion-effet-de-bord",
        submission: { kind: "choice", selectedOptionIds: ["modifie-cellules"] },
        expectedScore: 0
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-trois-etats",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-trois-etats")),
      checks: [
        {
          cell: "B8",
          label: "Resultat apres impot",
          points: 10,
          expectedValue: 34500,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "B3"],
          errorKind: "accounting-treatment",
          formulaHint: "Le resultat multiplie par un moins le taux : =B2*(1-B3)."
        },
        {
          cell: "B9",
          label: "Flux de tresorerie disponible",
          points: 10,
          expectedValue: 31500,
          ...EURO,
          unit: "EUR",
          errorKind: "accounting-treatment",
          formulaHint: "Resultat apres impot plus dotations moins investissements et BFR : =B8+B4-B5-B6."
        }
      ],
      perturbations: [
        {
          name: "rex-revise",
          label: "le resultat d'exploitation est revise a 52 000 EUR",
          overrides: { B2: 52000 },
          expected: { B8: 39000, B9: 36000 }
        },
        {
          name: "capex-revise",
          label: "les investissements montent a 24 000 EUR",
          overrides: { B5: 24000 },
          expected: { B9: 25500 }
        }
      ]
    },
    [
      {
        name: "cascade-complete",
        submission: {
          kind: "spreadsheet",
          cells: {
            B8: { formula: "=B2*(1-B3)" },
            B9: { formula: "=B8+B4-B5-B6" }
          }
        },
        expectedScore: 20
      },
      {
        // Dotations deduites au lieu d'etre rajoutees : le contresens du tableau
        // de flux, route en erreur de traitement.
        name: "dotations-deduites",
        submission: {
          kind: "spreadsheet",
          cells: {
            B8: { formula: "=B2*(1-B3)" },
            B9: { formula: "=B8-B4-B5-B6" }
          }
        },
        expectedScore: 10
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-wacc",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-wacc")),
      checks: [
        {
          cell: "B8",
          label: "Poids des capitaux propres",
          points: 10,
          expectedValue: 0.6,
          ...RATE,
          requiredRefs: ["B2", "B3"],
          formulaHint: "Capitaux propres sur financement total : =B3/(B2+B3)."
        },
        {
          cell: "B9",
          label: "WACC",
          points: 10,
          expectedValue: 0.069,
          ...RATE,
          errorKind: "accounting-treatment",
          formulaHint: "Poids CP x cout CP + poids dette x cout apres impot : =B8*B5+(1-B8)*B4*(1-B6)."
        }
      ],
      perturbations: [
        {
          name: "dette-accrue",
          label: "la dette monte a 180 000 EUR",
          overrides: { B2: 180000 },
          expected: { B8: 0.5, B9: 0.06375 }
        },
        {
          name: "dette-plus-chere",
          label: "le cout de la dette monte a 7 %",
          overrides: { B4: 0.07 },
          expected: { B9: 0.075 }
        }
      ]
    },
    [
      {
        name: "wacc-par-poids",
        submission: {
          kind: "spreadsheet",
          cells: {
            B8: { formula: "=B3/(B2+B3)" },
            B9: { formula: "=B8*B5+(1-B8)*B4*(1-B6)" }
          }
        },
        expectedScore: 20
      },
      {
        name: "wacc-developpe",
        submission: {
          kind: "spreadsheet",
          cells: {
            B8: { formula: "=B3/(B2+B3)" },
            B9: { formula: "=B3/(B2+B3)*B5+B2/(B2+B3)*B4*(1-B6)" }
          }
        },
        expectedScore: 20
      },
      {
        // Le cout de la dette avant impot : l'economie d'impot oubliee.
        name: "dette-avant-impot",
        submission: {
          kind: "spreadsheet",
          cells: {
            B8: { formula: "=B3/(B2+B3)" },
            B9: { formula: "=B8*B5+(1-B8)*B4" }
          }
        },
        expectedScore: 10
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-dcf-actualisation",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-dcf-actualisation")),
      checks: [
        {
          cell: "D2",
          label: "Flux actualise de l'annee 1",
          points: 10,
          expectedValue: 29452.5,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "C2"],
          formulaHint: "Le flux multiplie par son coefficient : =B2*C2."
        },
        {
          cell: "D7",
          label: "Somme des flux actualises",
          points: 10,
          expectedValue: 141434.7,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["D2:D6"],
          requiredFunctions: ["SUM"],
          formulaHint: "Sommez la colonne des valeurs actualisees : =SOMME(D2:D6)."
        }
      ],
      perturbations: [
        {
          name: "fcf-annee-1-revise",
          label: "le flux de l'annee 1 est revise a 30 000 EUR",
          overrides: { B2: 30000 },
          expected: { D2: 28050, D7: 140032.2 }
        },
        {
          name: "coefficient-degrade",
          label: "le coefficient de l'annee 1 tombe a 0,9",
          overrides: { C2: 0.9 },
          expected: { D2: 28350, D7: 140332.2 }
        }
      ]
    },
    [
      {
        name: "actualisation-et-somme",
        submission: {
          kind: "spreadsheet",
          cells: {
            D2: { formula: "=B2*C2" },
            D7: { formula: "=SOMME(D2:D6)" }
          }
        },
        expectedScore: 20
      },
      {
        // La somme recopiee en additionnant les cinq cellules : ne suivra pas
        // une sixieme annee inseree.
        name: "somme-cellule-par-cellule",
        submission: {
          kind: "spreadsheet",
          cells: {
            D2: { formula: "=B2*C2" },
            D7: { formula: "=D2+D3+D4+D5+D6" }
          }
        },
        expectedScore: 16
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-valeur-terminale",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-valeur-terminale")),
      checks: [
        {
          cell: "B6",
          label: "Valeur terminale",
          points: 20,
          expectedValue: 702981.48,
          toleranceAbs: 1,
          unit: "EUR",
          requiredRefs: ["B2", "B3", "B4"],
          errorKind: "accounting-treatment",
          formulaHint: "Gordon-Shapiro : =B2*(1+B3)/(B4-B3)."
        }
      ],
      perturbations: [
        {
          name: "croissance-prudente",
          label: "la croissance long terme est ramenee a 0,5 %",
          overrides: { B3: 0.005 },
          expected: { B6: 587296.88 }
        },
        {
          name: "wacc-degrade",
          label: "le WACC monte a 7,9 %",
          overrides: { B4: 0.079 },
          expected: { B6: 593140.63 }
        }
      ]
    },
    [
      {
        name: "gordon-shapiro",
        submission: {
          kind: "spreadsheet",
          cells: { B6: { formula: "=B2*(1+B3)/(B4-B3)" } }
        },
        expectedScore: 20
      },
      {
        // La croissance oubliee au numerateur : proche, mais faux.
        name: "numerateur-sans-croissance",
        submission: {
          kind: "spreadsheet",
          cells: { B6: { formula: "=B2/(B4-B3)" } }
        },
        expectedScore: 0
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-dette",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-dette")),
      checks: [
        {
          cell: "B6",
          label: "Interets de l'annee",
          points: 10,
          expectedValue: 6000,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "B3"],
          errorKind: "accounting-treatment",
          formulaHint: "Le taux s'applique a l'ouverture : =B2*B3."
        },
        {
          cell: "B7",
          label: "Dette a la cloture",
          points: 10,
          expectedValue: 105000,
          ...EURO,
          unit: "EUR",
          requiredRefs: ["B2", "B4"],
          formulaHint: "L'ouverture moins le remboursement : =B2-B4."
        }
      ],
      perturbations: [
        {
          name: "dette-reduite",
          label: "la dette d'ouverture est ramenee a 100 000 EUR",
          overrides: { B2: 100000 },
          expected: { B6: 5000, B7: 85000 }
        },
        {
          name: "remboursement-accelere",
          label: "le remboursement de l'annee monte a 20 000 EUR",
          overrides: { B4: 20000 },
          expected: { B7: 100000 }
        }
      ]
    },
    [
      {
        name: "echeancier",
        submission: {
          kind: "spreadsheet",
          cells: { B6: { formula: "=B2*B3" }, B7: { formula: "=B2-B4" } }
        },
        expectedScore: 20
      },
      {
        // Les interets calcules sur la dette de cloture.
        name: "interets-sur-cloture",
        submission: {
          kind: "spreadsheet",
          cells: { B6: { formula: "=(B2-B4)*B3" }, B7: { formula: "=B2-B4" } }
        },
        expectedScore: 10
      }
    ]
  ),
  avanceVersion(
    "ex-xl-n4-sensibilite",
    {
      workbook: gridWorkbook(gridOf("ex-xl-n4-sensibilite")),
      checks: [
        {
          cell: "B7",
          label: "Valeur terminale au WACC central",
          points: 8,
          expectedValue: 702981.48,
          toleranceAbs: 1,
          unit: "EUR",
          requiredRefs: ["B4"],
          formulaHint: "Gordon-Shapiro au taux central : =B2*(1+B3)/(B4-B3)."
        },
        {
          cell: "B8",
          label: "Valeur terminale au WACC degrade",
          points: 6,
          expectedValue: 593140.63,
          toleranceAbs: 1,
          unit: "EUR",
          requiredRefs: ["B5"],
          formulaHint: "La meme formule, au taux degrade : =B2*(1+B3)/(B5-B3)."
        },
        {
          cell: "B9",
          label: "Ecart relatif",
          points: 6,
          expectedValue: -0.15625,
          ...RATE,
          requiredRefs: ["B7", "B8"],
          formulaHint: "Variation rapportee a la valeur centrale : =(B8-B7)/B7."
        }
      ],
      perturbations: [
        {
          name: "degradation-plus-forte",
          label: "le WACC degrade monte a 8,9 %",
          overrides: { B5: 0.089 },
          expected: { B8: 512986.49, B9: -0.27027 }
        },
        {
          name: "fcf-revise",
          label: "le flux de l'annee 5 est revise a 40 000 EUR",
          overrides: { B2: 40000 },
          expected: { B7: 751851.85, B8: 634375 }
        }
      ]
    },
    [
      {
        name: "sensibilite-complete",
        submission: {
          kind: "spreadsheet",
          cells: {
            B7: { formula: "=B2*(1+B3)/(B4-B3)" },
            B8: { formula: "=B2*(1+B3)/(B5-B3)" },
            B9: { formula: "=(B8-B7)/B7" }
          }
        },
        expectedScore: 20
      },
      {
        // L'ecart tape en dur a partir d'un calcul de tete.
        name: "ecart-en-dur",
        submission: {
          kind: "spreadsheet",
          cells: {
            B7: { formula: "=B2*(1+B3)/(B4-B3)" },
            B8: { formula: "=B2*(1+B3)/(B5-B3)" },
            B9: { formula: "=-0.15625" }
          }
        },
        // B7 (8) + B8 (6) + la part « resultat » de B9 (3,6).
        expectedScore: 17.6
      }
    ]
  ),
  choiceVersion(
    "ex-xl-n4-audit-modele",
    {
      label: "Constats d'audit",
      options: [
        {
          id: "constante-en-dur",
          label: "Des constantes en dur dans des cellules de calcul",
          rationale: "Le modele ne suit plus ses hypotheses : premiere anomalie d'audit."
        },
        {
          id: "ref-cassee",
          label: "Une cellule du bilan renvoie #REF!",
          rationale: "Une reference cassee signifie qu'un calcul lit une cellule qui n'existe plus."
        },
        {
          id: "cycle",
          label: "Une reference circulaire entre resultat et frais financiers",
          rationale:
            "Un classeur qui converge par iteration accidentelle n'est pas un modele auditable."
        },
        {
          id: "hypotheses-groupees",
          label: "Les hypotheses regroupees dans un onglet dedie",
          rationale: "C'est une bonne pratique, pas une anomalie."
        },
        {
          id: "wacc-par-scenario",
          label: "Le WACC recalcule pour chaque scenario",
          rationale: "Recalculer par scenario est exactement ce qu'un modele doit faire."
        }
      ],
      correctOptionIds: ["constante-en-dur", "ref-cassee", "cycle"]
    },
    [
      {
        name: "audit-complet",
        submission: {
          kind: "choice",
          selectedOptionIds: ["constante-en-dur", "ref-cassee", "cycle"]
        },
        expectedScore: 20
      },
      {
        name: "bonnes-pratiques-confondues",
        submission: {
          kind: "choice",
          selectedOptionIds: ["hypotheses-groupees", "wacc-par-scenario"]
        },
        expectedScore: 0
      }
    ]
  ),
  choiceVersion(
    "ex-xl-n4-vba-lecture",
    {
      label: "Lecture de la macro",
      options: [
        {
          id: "exporte-csv",
          label: "Elle enregistre une copie de l'onglet Treso13 en CSV a cote du classeur",
          rationale:
            "ws.Copy cree un classeur temporaire, SaveAs xlCSV l'ecrit, Close referme la copie."
        },
        {
          id: "recalcule",
          label: "Elle force le recalcul du classeur",
          rationale: "Aucun Calculate dans la procedure ; ScreenUpdating ne recalcule rien."
        },
        {
          id: "supprime-lignes",
          label: "Elle supprime les lignes vides de l'onglet",
          rationale: "Rien ne modifie les cellules : la copie est enregistree telle quelle."
        },
        {
          id: "envoie-mail",
          label: "Elle envoie le fichier par e-mail",
          rationale: "Aucun objet Outlook ni SendMail : la macro ecrit un fichier local."
        }
      ],
      correctOptionIds: ["exporte-csv"]
    },
    [
      {
        name: "lecture-correcte",
        submission: { kind: "choice", selectedOptionIds: ["exporte-csv"] },
        expectedScore: 20
      },
      {
        name: "confusion-recalcul",
        submission: { kind: "choice", selectedOptionIds: ["recalcule"] },
        expectedScore: 0
      }
    ]
  )
];

// --- Case studies -------------------------------------------------------------

export interface ExcelCaseStudyDocument {
  id: string;
  reference: string;
  date: string;
  summary: string;
}

export interface ExcelCaseStudyStep {
  exerciseId: string;
  instruction: string;
  documentId: string;
}

export interface ExcelCaseStudy {
  id: string;
  /** Segment d'URL sous /modules/excel-finance-lab/cas/. */
  slug: string;
  title: string;
  trackId: string;
  levelId: string;
  context: string;
  documents: ExcelCaseStudyDocument[];
  steps: ExcelCaseStudyStep[];
  checklist: string[];
  sourceReferences: SourceReference[];
}

/**
 * Case study N3 : la prévision de trésorerie à treize semaines. Le fil est
 * celui d'un vrai treizisme : fiabiliser les données, totaliser, chaîner les
 * positions, verrouiller par un contrôle. Les étapes sont des exercices du
 * niveau — les drills et le cas sont les mêmes calculs.
 */
export const excelTresorerieCase: ExcelCaseStudy = {
  id: "case-xl-treso-13-semaines",
  slug: "tresorerie-13-semaines",
  title: "Prevision de tresorerie a treize semaines",
  trackId: EXCEL_LAB_TRACK,
  levelId: "level-excel-finance-3",
  context:
    "Le DAF vous confie la prevision de tresorerie hebdomadaire du trimestre : un export ERP a fiabiliser, treize semaines de flux a totaliser, une position a chainer depuis l'ouverture de 18 000 EUR, et un controle de coherence avant diffusion.",
  documents: [
    {
      id: "doc-export-erp",
      reference: "Export ERP ventes et achats",
      date: "S0",
      summary:
        "Dix lignes brutes : montants au format texte (« 7 400 », « -1 150 »), piece FA-103 dupliquee, familles en casse incoherente (VENTES/ventes/Ventes)."
    },
    {
      id: "doc-prevision-13s",
      reference: "Prevision hebdomadaire S1-S13",
      date: "S0",
      summary:
        "Treize semaines d'encaissements et de decaissements prevus, issus du carnet de commandes et des echeanciers fournisseurs."
    },
    {
      id: "doc-note-ouverture",
      reference: "Note de position d'ouverture",
      date: "S0",
      summary: "Position de tresorerie a l'ouverture de la semaine 1 : 18 000 EUR."
    },
    {
      id: "doc-controle-daf",
      reference: "Feuille de controle du DAF",
      date: "S0",
      summary:
        "Total de controle des ventes fourni par l'ERP, a rapprocher du total calcule par somme conditionnelle avant diffusion de la prevision."
    }
  ],
  steps: [
    {
      exerciseId: "ex-xl-n3-erp-diagnostic",
      documentId: "doc-export-erp",
      instruction: "Diagnostiquez les defauts de l'export avant tout calcul."
    },
    {
      exerciseId: "ex-xl-n3-tri-familles",
      documentId: "doc-export-erp",
      instruction: "Totalisez ventes et achats par famille sur les donnees fiabilisees."
    },
    {
      exerciseId: "ex-xl-n3-treso-totaux",
      documentId: "doc-prevision-13s",
      instruction: "Totalisez les encaissements et decaissements des treize semaines."
    },
    {
      exerciseId: "ex-xl-n3-treso-solde",
      documentId: "doc-note-ouverture",
      instruction: "Chainez solde hebdomadaire et position de tresorerie depuis l'ouverture."
    },
    {
      exerciseId: "ex-xl-n3-controle-coherence",
      documentId: "doc-controle-daf",
      instruction: "Verrouillez la prevision par un controle de coherence calcule."
    }
  ],
  checklist: [
    "Export ERP fiabilise : doublons, formats et casse traites",
    "Totaux obtenus par sommes sur plages, jamais cellule a cellule",
    "Position de tresorerie chainee depuis l'ouverture",
    "Semaine la plus tendue identifiee",
    "Controle de coherence calcule et au vert avant diffusion"
  ],
  sourceReferences: excelLabAvanceSources
};

/**
 * Case study N4 : le DCF d'Aster Industrie. Du resultat d'exploitation a la
 * valorisation, en passant par le WACC, l'actualisation, la valeur terminale et
 * la sensibilite — puis l'audit du modele avant remise.
 */
export const excelDcfAsterCase: ExcelCaseStudy = {
  id: "case-xl-dcf-aster",
  slug: "dcf-aster-industrie",
  title: "DCF d'Aster Industrie",
  trackId: EXCEL_LAB_TRACK,
  levelId: "level-excel-finance-4",
  context:
    "Aster Industrie, PME industrielle, envisage d'ouvrir son capital. Vous montez la valorisation DCF : flux disponibles, WACC, actualisation sur cinq ans, valeur terminale, sensibilite au taux — et audit du modele avant de remettre votre travail.",
  documents: [
    {
      id: "doc-liasse-aster",
      reference: "Donnees financieres Aster Industrie",
      date: "N",
      summary:
        "Resultat d'exploitation 46 000 EUR, structure de financement (dette 120 000, capitaux propres 180 000), couts de financement et taux d'imposition."
    },
    {
      id: "doc-plan-aster",
      reference: "Plan d'affaires a cinq ans",
      date: "N",
      // Ni le flux de l'annee 1 ni le taux d'actualisation ne sont cites ici :
      // ce sont les reponses attendues des etapes 1 et 2 — regle no-leak.
      summary:
        "Cinq flux de tresorerie disponibles et leurs coefficients d'actualisation (fournis, arrondis a trois decimales)."
    },
    {
      id: "doc-note-wacc",
      reference: "Note de calcul du WACC",
      date: "N",
      summary:
        "Hypotheses de cout du capital : cout de la dette 5 %, cout des capitaux propres 9 %, croissance long terme 1,5 % ; scenario degrade a +1 point de WACC."
    },
    {
      id: "doc-macro-vba",
      reference: "Module VBA d'export (lecture seule)",
      date: "N",
      summary:
        "Macro ExporterTresorerieCsv fournie pour documenter l'automatisation de l'export ; presentee en lecture, jamais executee par la plateforme."
    }
  ],
  steps: [
    {
      exerciseId: "ex-xl-n4-trois-etats",
      documentId: "doc-liasse-aster",
      instruction: "Passez du resultat d'exploitation au flux de tresorerie disponible."
    },
    {
      exerciseId: "ex-xl-n4-wacc",
      documentId: "doc-note-wacc",
      instruction: "Calculez le cout moyen pondere du capital."
    },
    {
      exerciseId: "ex-xl-n4-dcf-actualisation",
      documentId: "doc-plan-aster",
      instruction: "Actualisez les cinq flux du plan et totalisez-les."
    },
    {
      exerciseId: "ex-xl-n4-valeur-terminale",
      documentId: "doc-plan-aster",
      instruction: "Calculez la valeur terminale par Gordon-Shapiro."
    },
    {
      exerciseId: "ex-xl-n4-sensibilite",
      documentId: "doc-note-wacc",
      instruction: "Mesurez la sensibilite de la valeur terminale a un point de WACC."
    },
    {
      exerciseId: "ex-xl-n4-audit-modele",
      documentId: "doc-macro-vba",
      instruction: "Auditez le modele avant de rendre votre valorisation."
    }
  ],
  checklist: [
    "Flux disponibles derives du resultat, dotations rajoutees",
    "WACC calcule avec le cout de la dette apres impot",
    "Flux actualises par leurs coefficients et totalises en plage",
    "Valeur terminale calculee et sa sensibilite chiffree",
    "Modele audite : pas de constante en dur, pas de #REF!, pas de cycle",
    "Macro d'export lue et comprise avant tout usage local"
  ],
  sourceReferences: excelLabAvanceSources
};

export const excelCaseStudies: ExcelCaseStudy[] = [excelTresorerieCase, excelDcfAsterCase];

export function getExcelCaseStudyBySlug(slug: string): ExcelCaseStudy | null {
  return excelCaseStudies.find((caseStudy) => caseStudy.slug === slug) ?? null;
}

/** Tous les exercices appartenant a une etape d'un case study Excel N3/N4. */
export function isExcelCaseStudyExercise(exerciseId: string): boolean {
  return excelCaseStudies.some((caseStudy) =>
    caseStudy.steps.some((step) => step.exerciseId === exerciseId)
  );
}
