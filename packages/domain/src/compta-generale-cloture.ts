import type { AuthoredExerciseVersion } from "./exercise-specs";
import type { ModuleLevelDefinition } from "./curriculum";
import { COMPTA_GENERALE_V1_TRACK } from "./compta-generale-v1";
import { round2 } from "./evaluators/types";
import type { Competency, Exercise, SourceReference } from "./types";

/**
 * Comptabilité générale v1 — niveaux 3 et 4 : « de la pièce au bilan ».
 *
 * PR-12a termine la verticale du track `track-compta-generale-v1` :
 *
 * - N3 « Clôture » : les écritures d'inventaire (CCA/PCA, FNP/FAE,
 *   amortissements, provisions, créances douteuses, dépréciation et variation
 *   des stocks), le rapprochement bancaire de fin d'exercice, le contrôle de
 *   TVA et la balance après inventaire.
 * - N4 « Révision et états financiers » : feuille maîtresse, contrôles de
 *   cohérence, revue des cycles, bilan, compte de résultat, annexe simplifiée,
 *   ajustements de révision, événements postérieurs et comparaison PCG / IFRS.
 *
 * UNE SEULE SOCIÉTÉ, UN SEUL JEU DE CHIFFRES. Tous les montants des exercices
 * N3/N4 et des deux case studies dérivent de la balance après inventaire de la
 * SARL Vélo Cité définie plus bas ({@link velociteClosingBalance}). Les
 * invariants (équilibre, résultat identique bilan/CR, feuille maîtresse) sont
 * prouvés par des fonctions pures testées — un montant d'énoncé qui divergerait
 * du jeu de données casse un test au lieu de mentir au learner.
 *
 * COMME EN N1/N2, RIEN N'EST NOTÉ PAR MOTS-CLÉS. Chaque exercice embarque une
 * spécification typée (journal, numérique, QCM) et ses cas dorés : écriture
 * exacte, mauvais compte, inversion débit/crédit, écart de montant, variante
 * explicitement acceptée.
 */

// --- Sources ----------------------------------------------------------------
//
// Uniquement des assets locaux réellement présents dans le catalogue seedé
// (voir `sourceDocumentRegistry` dans learning.ts et le test de résolution).
// Aucune page n'est inventée : chaque plage est bornée par la pagination du
// document référencé.

const clotureCourseSource: SourceReference = {
  pack: "cours-master-2025",
  document: "Clôture comptable et régularisations",
  sourceType: "course",
  pageStart: 5,
  pageEnd: 38,
  effectiveDate: "2025-09-01"
};

const pcgComptesSource: SourceReference = {
  pack: "pcg-anc-2026",
  document: "Plan comptable général — comptes et fonctionnement",
  sourceType: "official-reference",
  pageStart: 41,
  pageEnd: 58,
  effectiveDate: "2026-01-01"
};

const pcgEtatsSource: SourceReference = {
  pack: "pcg-anc-2026",
  document: "Plan comptable général — états de synthèse",
  sourceType: "official-reference",
  pageStart: 3,
  pageEnd: 27,
  effectiveDate: "2026-01-01"
};

const ias37NotesSource: SourceReference = {
  pack: "ifrs-preparation-2027",
  document: "IAS 37 - cas pratiques et comparaison PCG",
  sourceType: "personal-note",
  pageStart: 1,
  pageEnd: 12,
  effectiveDate: "2027-01-01"
};

const ifrs18NotesSource: SourceReference = {
  pack: "ifrs-preparation-2027",
  document: "IFRS 18 — présentation des états financiers (notes)",
  sourceType: "personal-note",
  pageStart: 1,
  pageEnd: 18,
  effectiveDate: "2027-01-01"
};

export const comptaGeneraleClotureSources: SourceReference[] = [
  clotureCourseSource,
  pcgComptesSource,
  pcgEtatsSource,
  ias37NotesSource,
  ifrs18NotesSource
];

// --- Compétences ------------------------------------------------------------

export const comptaGeneraleClotureCompetencies: Competency[] = [
  {
    id: "cg-inventaire",
    domainId: "compta-generale",
    name: "Passer les écritures d'inventaire",
    levelMin: 3,
    levelMax: 4,
    status: "not-started",
    strength: 0,
    focus:
      "Rattacher charges et produits au bon exercice : CCA, PCA, FNP, FAE, dotations et régularisations de stocks."
  },
  {
    id: "cg-etats-financiers",
    domainId: "compta-generale",
    name: "Établir et réviser les états financiers",
    levelMin: 4,
    levelMax: 4,
    status: "not-started",
    strength: 0,
    focus:
      "De la balance après inventaire au bilan et au compte de résultat, avec feuilles maîtresses et contrôles de cohérence."
  }
];

// --- Niveaux ----------------------------------------------------------------

export const comptaGeneraleClotureLevels: ModuleLevelDefinition[] = [
  {
    id: "level-compta-generale-v1-3",
    trackId: COMPTA_GENERALE_V1_TRACK,
    moduleId: "module-compta-generale-v1",
    domainId: "compta-generale",
    level: 3,
    title: "Clôture : écritures d'inventaire",
    objective:
      "Passer les régularisations de fin d'exercice — cut-off, dotations, stocks, banque et TVA — jusqu'à la balance après inventaire.",
    competencyIds: ["cg-inventaire", "cg-cutoff", "cg-provisions", "cg-tva"],
    criticalCompetencyIds: ["cg-inventaire"],
    estimatedMinutes: 240,
    publicationStatus: "published"
  },
  {
    id: "level-compta-generale-v1-4",
    trackId: COMPTA_GENERALE_V1_TRACK,
    moduleId: "module-compta-generale-v1",
    domainId: "compta-generale",
    level: 4,
    title: "Révision et états financiers",
    objective:
      "Réviser les cycles, ajuster, puis établir bilan, compte de résultat et annexe — et confronter la présentation PCG aux IFRS.",
    competencyIds: ["cg-etats-financiers", "cg-inventaire", "ifrs-ias37"],
    criticalCompetencyIds: ["cg-etats-financiers"],
    estimatedMinutes: 240,
    publicationStatus: "published"
  }
];

// --- La balance après inventaire de la SARL Vélo Cité ------------------------
//
// Soldes au 31/12/N, après écritures d'inventaire et avant affectation du
// résultat. C'est LA source des chiffres de N4 : total, résultat, bilan et
// feuilles maîtresses en dérivent par des fonctions pures testées.

export interface BalanceLine {
  account: string;
  label: string;
  debit?: number;
  credit?: number;
}

export const velociteClosingBalance: BalanceLine[] = [
  { account: "101", label: "Capital social", credit: 30000 },
  { account: "106", label: "Réserves", credit: 8700 },
  { account: "1511", label: "Provisions pour litiges", credit: 4500 },
  { account: "164", label: "Emprunts auprès des établissements de crédit", credit: 12000 },
  { account: "2182", label: "Matériel de transport", debit: 12000 },
  { account: "2183", label: "Matériel de bureau et matériel informatique", debit: 3000 },
  { account: "28182", label: "Amortissements du matériel de transport", credit: 6000 },
  { account: "28183", label: "Amortissements du matériel de bureau et informatique", credit: 150 },
  { account: "37", label: "Stocks de marchandises", debit: 5420 },
  { account: "397", label: "Dépréciations des stocks de marchandises", credit: 950 },
  { account: "401", label: "Fournisseurs", credit: 21900 },
  { account: "408", label: "Fournisseurs — factures non parvenues", credit: 1080 },
  { account: "411", label: "Clients", debit: 45300 },
  { account: "416", label: "Clients douteux", debit: 2400 },
  { account: "418", label: "Clients — produits non encore facturés", debit: 1800 },
  { account: "44566", label: "TVA déductible sur biens et services", debit: 1670 },
  { account: "44586", label: "TVA sur factures non parvenues", debit: 180 },
  { account: "44571", label: "TVA collectée", credit: 2760 },
  { account: "44587", label: "TVA sur factures à établir", credit: 300 },
  { account: "486", label: "Charges constatées d'avance", debit: 2000 },
  { account: "487", label: "Produits constatés d'avance", credit: 2400 },
  { account: "491", label: "Dépréciations des comptes de clients", credit: 1200 },
  { account: "512", label: "Banque", debit: 41450 },
  { account: "530", label: "Caisse", debit: 380 },
  { account: "607", label: "Achats de marchandises", debit: 96000 },
  { account: "6037", label: "Variation des stocks de marchandises", debit: 1380 },
  { account: "616", label: "Primes d'assurance", debit: 14620 },
  { account: "627", label: "Services bancaires et assimilés", debit: 600 },
  { account: "641", label: "Rémunérations du personnel", debit: 48000 },
  { account: "645", label: "Charges de sécurité sociale", debit: 19200 },
  { account: "661", label: "Charges d'intérêts", debit: 540 },
  { account: "6811", label: "Dotations aux amortissements", debit: 2550 },
  { account: "68173", label: "Dotations aux dépréciations des stocks", debit: 950 },
  { account: "68174", label: "Dotations aux dépréciations des créances", debit: 1200 },
  { account: "6815", label: "Dotations aux provisions d'exploitation", debit: 4500 },
  { account: "706", label: "Prestations de services (atelier)", credit: 5200 },
  { account: "707", label: "Ventes de marchandises", credit: 208000 }
];

// --- Les écritures d'inventaire du dossier -----------------------------------
//
// Les écritures que le dossier annuel justifie, pièce par pièce. Le grand livre
// interactif les rejoue : pour chaque compte, solde avant inventaire (dérivé),
// mouvements, solde après inventaire (la balance ci-dessus).

export interface LedgerEntryLine {
  account: string;
  debit?: number;
  credit?: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  label: string;
  lines: LedgerEntryLine[];
}

export const velociteInventoryEntries: LedgerEntry[] = [
  {
    id: "inv-variation-stocks",
    date: "31/12/N",
    label: "Variation des stocks de marchandises (annulation SI, constatation SF)",
    lines: [
      { account: "6037", debit: 6800 },
      { account: "37", credit: 6800 },
      { account: "37", debit: 5420 },
      { account: "6037", credit: 5420 }
    ]
  },
  {
    id: "inv-amortissements",
    date: "31/12/N",
    label: "Dotations aux amortissements de l'exercice",
    lines: [
      { account: "6811", debit: 2550 },
      { account: "28182", credit: 2400 },
      { account: "28183", credit: 150 }
    ]
  },
  {
    id: "inv-depreciation-stocks",
    date: "31/12/N",
    label: "Dépréciation du stock de marchandises",
    lines: [
      { account: "68173", debit: 950 },
      { account: "397", credit: 950 }
    ]
  },
  {
    id: "inv-creances-douteuses",
    date: "31/12/N",
    label: "Reclassement du client douteux et dépréciation de la créance",
    lines: [
      { account: "416", debit: 2400 },
      { account: "411", credit: 2400 },
      { account: "68174", debit: 1200 },
      { account: "491", credit: 1200 }
    ]
  },
  {
    id: "inv-provision",
    date: "31/12/N",
    label: "Provision pour litige prud'homal",
    lines: [
      { account: "6815", debit: 4500 },
      { account: "1511", credit: 4500 }
    ]
  },
  {
    id: "inv-cca",
    date: "31/12/N",
    label: "Charge constatée d'avance sur l'assurance annuelle",
    lines: [
      { account: "486", debit: 2000 },
      { account: "616", credit: 2000 }
    ]
  },
  {
    id: "inv-fnp",
    date: "31/12/N",
    label: "Facture non parvenue sur marchandises reçues",
    lines: [
      { account: "607", debit: 900 },
      { account: "44586", debit: 180 },
      { account: "408", credit: 1080 }
    ]
  },
  {
    id: "inv-fae",
    date: "31/12/N",
    label: "Facture à établir sur livraison de décembre",
    lines: [
      { account: "418", debit: 1800 },
      { account: "707", credit: 1500 },
      { account: "44587", credit: 300 }
    ]
  },
  {
    id: "inv-pca",
    date: "31/12/N",
    label: "Produit constaté d'avance sur contrat de maintenance",
    lines: [
      { account: "706", debit: 2400 },
      { account: "487", credit: 2400 }
    ]
  }
];

// --- Fonctions pures sur le dossier ------------------------------------------

export interface LedgerAccountView {
  account: string;
  label: string;
  /** Solde avant inventaire, signé (débit positif). Dérivé, jamais saisi. */
  openingBalance: number;
  movements: Array<{ entryId: string; entryLabel: string; date: string; debit: number; credit: number }>;
  /** Solde après inventaire, signé (débit positif). Vient de la balance. */
  closingBalance: number;
}

function signedBalance(line: BalanceLine): number {
  return (line.debit ?? 0) - (line.credit ?? 0);
}

/**
 * Le grand livre du dossier de clôture : pour chaque compte de la balance, le
 * solde avant inventaire (solde final moins mouvements d'inventaire), les
 * mouvements des écritures d'inventaire, et le solde final.
 */
export function buildClosingLedger(
  balance: BalanceLine[] = velociteClosingBalance,
  entries: LedgerEntry[] = velociteInventoryEntries
): LedgerAccountView[] {
  const movementsByAccount = new Map<string, LedgerAccountView["movements"]>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const list = movementsByAccount.get(line.account) ?? [];

      list.push({
        entryId: entry.id,
        entryLabel: entry.label,
        date: entry.date,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0
      });
      movementsByAccount.set(line.account, list);
    }
  }

  return balance.map((line) => {
    const movements = movementsByAccount.get(line.account) ?? [];
    const movementNet = movements.reduce((sum, movement) => sum + movement.debit - movement.credit, 0);
    const closing = signedBalance(line);

    return {
      account: line.account,
      label: line.label,
      openingBalance: round2(closing - movementNet),
      movements,
      closingBalance: closing
    };
  });
}

export interface TrialBalanceTotals {
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export function trialBalanceTotals(balance: BalanceLine[] = velociteClosingBalance): TrialBalanceTotals {
  const totalDebit = round2(balance.reduce((sum, line) => sum + (line.debit ?? 0), 0));
  const totalCredit = round2(balance.reduce((sum, line) => sum + (line.credit ?? 0), 0));

  return { totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export interface IncomeStatementView {
  charges: BalanceLine[];
  produits: BalanceLine[];
  totalCharges: number;
  totalProduits: number;
  /** Positif = bénéfice. */
  resultat: number;
}

function accountClass(account: string): string {
  return account.charAt(0);
}

/** Compte de résultat : classes 6 et 7 de la balance après inventaire. */
export function buildIncomeStatement(balance: BalanceLine[] = velociteClosingBalance): IncomeStatementView {
  const charges = balance.filter((line) => accountClass(line.account) === "6");
  const produits = balance.filter((line) => accountClass(line.account) === "7");
  // Les soldes signés absorbent un compte de gestion « à l'envers » (une
  // variation de stocks créditrice, une reprise) sans fausser le total.
  const totalCharges = round2(charges.reduce((sum, line) => sum + signedBalance(line), 0));
  const totalProduits = round2(produits.reduce((sum, line) => sum - signedBalance(line), 0));

  return {
    charges,
    produits,
    totalCharges,
    totalProduits,
    resultat: round2(totalProduits - totalCharges)
  };
}

export interface BalanceSheetView {
  /** Actif net : classes 1 à 5 débitrices, moins amortissements et dépréciations. */
  totalActif: number;
  /** Capitaux propres (résultat inclus) et dettes. */
  totalPassif: number;
  resultat: number;
  balanced: boolean;
}

/** Un compte créditeur des classes 2 à 4 qui vient en déduction de l'actif. */
function isContraAsset(line: BalanceLine): boolean {
  return /^(28|29|39|49|59)/.test(line.account);
}

export function buildBalanceSheet(balance: BalanceLine[] = velociteClosingBalance): BalanceSheetView {
  const { resultat } = buildIncomeStatement(balance);
  let actif = 0;
  let passif = resultat;

  for (const line of balance) {
    const klass = accountClass(line.account);

    if (klass === "6" || klass === "7") {
      continue;
    }

    if (isContraAsset(line)) {
      actif -= (line.credit ?? 0) - (line.debit ?? 0);
      continue;
    }

    const signed = signedBalance(line);

    if (signed >= 0) {
      actif += signed;
    } else {
      passif -= signed;
    }
  }

  const totalActif = round2(actif);
  const totalPassif = round2(passif);

  return { totalActif, totalPassif, resultat, balanced: totalActif === totalPassif };
}

export interface ControlCheck {
  id: string;
  label: string;
  detail: string;
  passed: boolean;
}

/**
 * La feuille de contrôle du dossier : les cohérences qu'un réviseur vérifie
 * avant d'arrêter les comptes. Calculées, jamais déclarées.
 */
export function buildControlSheet(balance: BalanceLine[] = velociteClosingBalance): ControlCheck[] {
  const totals = trialBalanceTotals(balance);
  const income = buildIncomeStatement(balance);
  const sheet = buildBalanceSheet(balance);
  const negativeContra = balance.filter((line) => isContraAsset(line) && (line.debit ?? 0) > 0);
  const stock = balance.find((line) => line.account === "37");
  const stockDepreciation = balance.find((line) => line.account === "397");
  const stockNet = (stock?.debit ?? 0) - (stockDepreciation?.credit ?? 0);

  return [
    {
      id: "balance-equilibree",
      label: "Balance équilibrée",
      detail: `Total débits ${totals.totalDebit.toLocaleString("fr-FR")} € — total crédits ${totals.totalCredit.toLocaleString("fr-FR")} €.`,
      passed: totals.balanced
    },
    {
      id: "resultat-coherent",
      label: "Résultat identique au bilan et au compte de résultat",
      detail: `Compte de résultat : ${income.resultat.toLocaleString("fr-FR")} € — bilan : ${sheet.resultat.toLocaleString("fr-FR")} €.`,
      passed: income.resultat === sheet.resultat && sheet.balanced
    },
    {
      id: "actif-egal-passif",
      label: "Total actif = total passif",
      detail: `Actif ${sheet.totalActif.toLocaleString("fr-FR")} € — passif ${sheet.totalPassif.toLocaleString("fr-FR")} €.`,
      passed: sheet.balanced
    },
    {
      id: "amortissements-crediteurs",
      label: "Aucun compte d'amortissement ou de dépréciation débiteur",
      detail:
        negativeContra.length === 0
          ? "Tous les comptes 28x/39x/49x sont créditeurs."
          : `Comptes anormalement débiteurs : ${negativeContra.map((line) => line.account).join(", ")}.`,
      passed: negativeContra.length === 0
    },
    {
      id: "stock-net-positif",
      label: "Stock net positif ou nul",
      detail: `Stock ${stock?.debit?.toLocaleString("fr-FR") ?? 0} € — dépréciation ${stockDepreciation?.credit?.toLocaleString("fr-FR") ?? 0} €, net ${stockNet.toLocaleString("fr-FR")} €.`,
      passed: stockNet >= 0
    }
  ];
}

/**
 * Feuille maîtresse d'un cycle : les comptes qu'elle agrège et le montant net
 * qui monte au bilan. Le poste « Clients et comptes rattachés » sert de pivot
 * aux exercices N4.
 */
export function clientCycleLeadSchedule(balance: BalanceLine[] = velociteClosingBalance): {
  lines: BalanceLine[];
  net: number;
} {
  const accounts = new Set(["411", "416", "418", "491"]);
  const lines = balance.filter((line) => accounts.has(line.account));
  const net = round2(lines.reduce((sum, line) => sum + signedBalance(line), 0));

  return { lines, net };
}

// Les constantes que les énoncés N4 citent. Dérivées, pas re-tapées : un test
// vérifie qu'elles restent égales aux fonctions ci-dessus.
export const VELOCITE_TRIAL_BALANCE_TOTAL = 305140;
export const VELOCITE_RESULTAT = 23660;
export const VELOCITE_TOTAL_BILAN = 107300;
export const VELOCITE_CLIENTS_NET = 48300;
export const VELOCITE_BALANCE_AVANT_INVENTAIRE = 274040;
export const VELOCITE_MOUVEMENTS_INVENTAIRE = 31100;

// --- Exercices ---------------------------------------------------------------

interface ClotureExerciseSeed {
  id: string;
  level: 3 | 4;
  minutes: number;
  type: Exercise["type"];
  title: string;
  statement: string;
  expectedAnswer: string;
  competencyIds: string[];
  rubric: Array<{ label: string; points: number }>;
}

function toExercise(seed: ClotureExerciseSeed): Exercise {
  return {
    id: seed.id,
    domainId: "compta-generale",
    type: seed.type,
    title: seed.title,
    level: seed.level,
    estimatedMinutes: seed.minutes,
    statement: seed.statement,
    expectedAnswer: seed.expectedAnswer,
    rubric: seed.rubric,
    competencyIds: seed.competencyIds,
    sourceChunkIds: []
  };
}

const JOURNAL_RUBRIC = [
  { label: "Comptes utilisés", points: 4 },
  { label: "Sens débit/crédit", points: 3 },
  { label: "Montants", points: 4 },
  { label: "Équilibre de l'écriture", points: 2 }
];

export const comptaGeneraleClotureExercises: Exercise[] = [
  // --- N3 : écritures d'inventaire -----------------------------------------
  toExercise({
    id: "ex-cgv1-cca",
    level: 3,
    minutes: 8,
    type: "journal-entry",
    title: "Charge constatée d'avance sur l'assurance (SARL Vélo Cité)",
    statement:
      "31 décembre N. La prime d'assurance annuelle de 2 400,00 €, payée le 1er novembre N (compte 616), couvre la période du 1er novembre N au 31 octobre N+1.\nPassez l'écriture de régularisation au 31/12/N.",
    expectedAnswer:
      "Débit 486 Charges constatées d'avance 2 000,00 ; crédit 616 Primes d'assurance 2 000,00.\n10 mois sur 12 concernent N+1 : 2 400 × 10/12 = 2 000,00 €. La charge de N ne garde que novembre et décembre.",
    competencyIds: ["cg-inventaire", "cg-cutoff"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-pca",
    level: 3,
    minutes: 8,
    type: "journal-entry",
    title: "Produit constaté d'avance sur contrat de maintenance",
    statement:
      "1er décembre N : la SARL facture 3 600,00 € HT un contrat d'entretien de flotte couvrant décembre N, janvier et février N+1 (compte 706).\nPassez l'écriture de régularisation au 31/12/N.",
    expectedAnswer:
      "Débit 706 Prestations de services 2 400,00 ; crédit 487 Produits constatés d'avance 2 400,00.\nDeux mois sur trois concernent N+1 : 3 600 × 2/3 = 2 400,00 €. La TVA, exigible à la facturation, n'est pas corrigée.",
    competencyIds: ["cg-inventaire", "cg-cutoff"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-fnp",
    level: 3,
    minutes: 10,
    type: "journal-entry",
    title: "Facture non parvenue sur marchandises reçues",
    statement:
      "28 décembre N : réception de marchandises pour 900,00 € HT (TVA 20 %) ; la facture du fournisseur n'est pas arrivée au 31/12/N.\nPassez l'écriture d'inventaire.",
    expectedAnswer:
      "Débit 607 Achats de marchandises 900,00 ; débit 44586 TVA sur factures non parvenues 180,00 ; crédit 408 Fournisseurs — factures non parvenues 1 080,00.\nLa TVA d'une FNP va au 44586 (elle n'est pas encore déductible), la dette au 408 et non au 401.",
    competencyIds: ["cg-inventaire", "cg-cutoff", "cg-tva"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-fae",
    level: 3,
    minutes: 10,
    type: "journal-entry",
    title: "Facture à établir sur livraison de décembre",
    statement:
      "30 décembre N : livraison de marchandises au client Sport Loisirs pour 1 500,00 € HT (TVA 20 %) ; la facture ne sera émise qu'en janvier N+1.\nPassez l'écriture d'inventaire.",
    expectedAnswer:
      "Débit 418 Clients — produits non encore facturés 1 800,00 ; crédit 707 Ventes de marchandises 1 500,00 ; crédit 44587 TVA sur factures à établir 300,00.\nLe produit est acquis à la livraison ; la TVA en attente va au 44587.",
    competencyIds: ["cg-inventaire", "cg-cutoff", "cg-tva"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-creance-douteuse",
    level: 3,
    minutes: 12,
    type: "journal-entry",
    title: "Client douteux : reclassement et dépréciation",
    statement:
      "31 décembre N. Le client Durand, en retard de paiement, doit 2 400,00 € TTC (2 000,00 € HT). Le recouvrement n'est estimé qu'à 40 % du montant HT.\nPassez les écritures d'inventaire (reclassement puis dépréciation).",
    expectedAnswer:
      "Reclassement : débit 416 Clients douteux 2 400,00 ; crédit 411 Clients 2 400,00 (pour le TTC).\nDépréciation : débit 68174 Dotations aux dépréciations des créances 1 200,00 ; crédit 491 Dépréciations des comptes de clients 1 200,00.\nLa dépréciation se calcule sur le HT : 2 000 × 60 % = 1 200,00 € — la TVA sera récupérée si la créance devient irrécouvrable.",
    competencyIds: ["cg-inventaire", "cg-provisions"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-depreciation-stock",
    level: 3,
    minutes: 6,
    type: "calculation",
    title: "Dépréciation du stock de marchandises",
    statement:
      "À l'inventaire au 31/12/N, le stock de marchandises ressort à 5 420,00 € au coût d'achat ; sa valeur actuelle est estimée à 4 470,00 €. Aucune dépréciation n'existe au bilan.\nCalculez la dotation aux dépréciations à comptabiliser, en euros.",
    expectedAnswer:
      "5 420 − 4 470 = 950,00 €. Le stock reste au bilan à son coût (5 420) ; la perte probable est portée au compte 397 par une dotation (68173).",
    competencyIds: ["cg-inventaire"],
    rubric: [{ label: "Dotation aux dépréciations", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-variation-stocks",
    level: 3,
    minutes: 12,
    type: "journal-entry",
    title: "Variation des stocks de marchandises",
    statement:
      "31 décembre N. Stock initial de marchandises (compte 37) : 6 800,00 €. L'inventaire physique valorise le stock final à 5 420,00 €.\nPassez les deux écritures de régularisation (annulation du stock initial, constatation du stock final).",
    expectedAnswer:
      "Annulation du stock initial : débit 6037 Variation des stocks de marchandises 6 800,00 ; crédit 37 Stocks de marchandises 6 800,00.\nConstatation du stock final : débit 37 Stocks de marchandises 5 420,00 ; crédit 6037 Variation des stocks de marchandises 5 420,00.\nLe solde débiteur du 6037 (1 380,00 €) traduit un déstockage : il augmente les charges de l'exercice.",
    competencyIds: ["cg-inventaire"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-regularisations-bancaires",
    level: 3,
    minutes: 12,
    type: "journal-entry",
    title: "Écritures de régularisation après rapprochement bancaire",
    statement:
      "Le rapprochement bancaire au 31/12/N fait apparaître, côté entreprise : un virement du client Sport Loisirs de 1 260,00 € figurant sur le relevé mais non comptabilisé, et des intérêts débiteurs de 40,00 € prélevés par la banque, non comptabilisés. (Un chèque de 790,00 € émis et non débité ne corrige que le relevé.)\nPassez les écritures de régularisation du compte 512.",
    expectedAnswer:
      "Débit 512 Banque 1 260,00 ; crédit 411 Clients 1 260,00.\nDébit 661 Charges d'intérêts 40,00 ; crédit 512 Banque 40,00.\nSeuls les éléments connus de la banque mais absents du compte 512 se régularisent ; le chèque non débité reste une correction du relevé.",
    competencyIds: ["cg-inventaire", "cg-operations-courantes"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-controle-tva",
    level: 3,
    minutes: 8,
    type: "calculation",
    title: "Contrôle de cohérence de la TVA collectée",
    statement:
      "Contrôle de TVA au 31/12/N : le chiffre d'affaires comptabilisé soumis au taux normal de 20 % s'élève à 138 000,00 € HT ; le compte 44571 TVA collectée totalise 27 100,00 € sur l'exercice.\nCalculez l'écart entre la TVA théorique et la TVA comptabilisée (valeur positive), en euros.",
    expectedAnswer:
      "TVA théorique = 138 000 × 20 % = 27 600,00 €. Écart = 27 600 − 27 100 = 500,00 €.\nUn écart doit être expliqué (avoirs, autoliquidation, erreur de saisie) avant l'arrêté — jamais laissé en l'état.",
    competencyIds: ["cg-tva", "cg-inventaire"],
    rubric: [{ label: "Écart de TVA collectée", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-cutoff-inventaire-qcm",
    level: 3,
    minutes: 8,
    type: "qcm",
    title: "Quelles situations déclenchent une écriture d'inventaire ?",
    statement:
      "Au 31/12/N, parmi les situations suivantes, lesquelles donnent lieu à une écriture de régularisation au titre de l'exercice N ?",
    expectedAnswer:
      "Le loyer de janvier N+1 payé en décembre (CCA), les marchandises reçues sans facture (FNP) et la livraison de décembre non facturée (FAE). Une commande non livrée ne produit rien ; un acompte versé reste au 4091 jusqu'à la facture.",
    competencyIds: ["cg-cutoff", "cg-inventaire"],
    rubric: [{ label: "Situations à régulariser", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-amortissements-cloture",
    level: 3,
    minutes: 8,
    type: "calculation",
    title: "Dotation totale aux amortissements de l'exercice",
    statement:
      "Parc immobilisé de la SARL Vélo Cité au 31/12/N : une camionnette de 12 000,00 € HT, amortie en linéaire sur 5 ans, mise en service le 1er juillet N−2 ; un poste informatique de 3 000,00 € HT, amorti en linéaire sur 5 ans, mis en service le 1er octobre N.\nCalculez la dotation totale aux amortissements de l'exercice N, en euros.",
    expectedAnswer:
      "Camionnette : annuité pleine 12 000 / 5 = 2 400,00 € (en service toute l'année N). Poste informatique : 3 000 / 5 × 3/12 = 150,00 €. Dotation totale = 2 550,00 €.",
    competencyIds: ["cg-immobilisations", "cg-inventaire"],
    rubric: [{ label: "Dotation totale de l'exercice", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-provision-cloture",
    level: 3,
    minutes: 8,
    type: "journal-entry",
    title: "Provision pour litige prud'homal",
    statement:
      "31 décembre N. Un ancien salarié a saisi les prud'hommes ; l'avocat de la SARL estime la sortie de ressources probable et la chiffre à 4 500,00 €.\nPassez l'écriture d'inventaire.",
    expectedAnswer:
      "Débit 6815 Dotations aux provisions d'exploitation 4 500,00 ; crédit 1511 Provisions pour litiges 4 500,00.\nObligation née avant la clôture, sortie probable, montant estimable : les trois conditions sont réunies.",
    competencyIds: ["cg-provisions", "cg-inventaire"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-balance-apres-inventaire",
    level: 3,
    minutes: 6,
    type: "calculation",
    title: "Total de la balance après inventaire",
    statement:
      "Avant écritures d'inventaire, la balance de la SARL Vélo Cité totalise 274 040,00 € (débits = crédits). Les écritures d'inventaire passées représentent 31 100,00 € de mouvements au débit (et autant au crédit).\nCalculez le total des débits de la balance après inventaire, en euros.",
    expectedAnswer:
      "274 040 + 31 100 = 305 140,00 €. Les écritures d'inventaire mouvementent débits et crédits du même montant : la balance reste équilibrée, son total augmente des mouvements passés.",
    competencyIds: ["cg-inventaire"],
    rubric: [{ label: "Total de la balance après inventaire", points: 20 }]
  }),

  // --- N4 : révision et états financiers ------------------------------------
  toExercise({
    id: "ex-cgv1-feuille-maitresse",
    level: 4,
    minutes: 8,
    type: "calculation",
    title: "Feuille maîtresse du cycle clients",
    statement:
      "Feuille maîtresse « Clients et comptes rattachés » au 31/12/N (balance après inventaire de la SARL Vélo Cité) : 411 Clients 45 300,00 € (débit) ; 416 Clients douteux 2 400,00 € (débit) ; 418 Clients — produits non encore facturés 1 800,00 € (débit) ; 491 Dépréciations des comptes de clients 1 200,00 € (crédit).\nCalculez le montant net du poste au bilan, en euros.",
    expectedAnswer:
      "45 300 + 2 400 + 1 800 − 1 200 = 48 300,00 €. La feuille maîtresse agrège les comptes du cycle et rapproche leur somme du poste de bilan : c'est la passerelle entre la balance et les états financiers.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Poste net Clients et comptes rattachés", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-controles-coherence-qcm",
    level: 4,
    minutes: 8,
    type: "qcm",
    title: "Contrôles de cohérence avant l'arrêté",
    statement: "Parmi les contrôles suivants, lesquels sont de véritables contrôles de cohérence de fin d'exercice ?",
    expectedAnswer:
      "La concordance balance / grand livre, l'égalité du résultat entre bilan et compte de résultat, et le rapprochement entre TVA théorique et TVA comptabilisée. L'actif n'a aucune raison d'égaler les charges, et une trésorerie négative n'est pas une incohérence comptable.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Contrôles de cohérence valides", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-revue-cycle-fournisseurs-qcm",
    level: 4,
    minutes: 8,
    type: "qcm",
    title: "Revue du cycle fournisseurs",
    statement: "Lors de la revue des cycles, quels contrôles relèvent du cycle fournisseurs / achats ?",
    expectedAnswer:
      "La circularisation des fournisseurs, le rapprochement des comptes 401 avec les relevés fournisseurs et la revue des factures non parvenues. Le comptage de caisse relève du cycle trésorerie, le contrôle des salaires du cycle personnel.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Contrôles du cycle fournisseurs", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-resultat-exercice",
    level: 4,
    minutes: 6,
    type: "calculation",
    title: "Résultat de l'exercice depuis la balance",
    statement:
      "Balance après inventaire de la SARL Vélo Cité au 31/12/N : total des produits (classe 7) 213 200,00 € ; total des charges (classe 6) 189 540,00 €.\nCalculez le résultat de l'exercice, en euros (positif si bénéfice).",
    expectedAnswer:
      "213 200 − 189 540 = 23 660,00 € de bénéfice. Le même montant apparaît au passif du bilan : c'est le premier contrôle de cohérence de l'arrêté.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Résultat de l'exercice", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-total-bilan",
    level: 4,
    minutes: 8,
    type: "calculation",
    title: "Total du bilan après inventaire",
    statement:
      "Toujours d'après la balance après inventaire de la SARL Vélo Cité : l'actif brut (classes 1 à 5 débitrices) s'élève à 115 600,00 € ; les amortissements et dépréciations (28x, 39x, 49x) totalisent 8 300,00 €.\nCalculez le total de l'actif net du bilan, en euros.",
    expectedAnswer:
      "115 600 − 8 300 = 107 300,00 €. Au passif : capitaux propres (résultat compris) et dettes totalisent le même montant — l'équilibre du bilan est l'aboutissement mécanique d'une balance équilibrée.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Total de l'actif net", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-annexe-qcm",
    level: 4,
    minutes: 8,
    type: "qcm",
    title: "Contenu de l'annexe simplifiée",
    statement: "Quelles informations figurent obligatoirement dans une annexe comptable, même simplifiée ?",
    expectedAnswer:
      "Les méthodes d'évaluation retenues, le tableau des amortissements et dépréciations, et les engagements de crédit-bail. Le détail nominatif des salaires et la liste des clients n'ont rien à y faire.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Contenu obligatoire de l'annexe", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-ajustement-revision",
    level: 4,
    minutes: 12,
    type: "journal-entry",
    title: "Ajustement issu de la note de révision (créance irrécouvrable)",
    statement:
      "La note de révision du cycle clients conclut : le client Durand (créance de 2 400,00 € TTC, soit 2 000,00 € HT, reclassée en 416 et dépréciée à hauteur de 1 200,00 €) est parti sans laisser d'adresse — la créance est irrécouvrable.\nPassez les écritures d'ajustement recommandées (perte et reprise de la dépréciation devenue sans objet).",
    expectedAnswer:
      "Perte : débit 654 Pertes sur créances irrécouvrables 2 000,00 ; débit 44571 TVA collectée 400,00 ; crédit 416 Clients douteux 2 400,00.\nReprise : débit 491 Dépréciations des comptes de clients 1 200,00 ; crédit 78174 Reprises sur dépréciations des créances 1 200,00.\nLa perte est HT — la TVA collectée est récupérée ; la dépréciation, devenue sans objet, est reprise.",
    competencyIds: ["cg-etats-financiers", "cg-inventaire"],
    rubric: JOURNAL_RUBRIC
  }),
  toExercise({
    id: "ex-cgv1-evenements-posterieurs-qcm",
    level: 4,
    minutes: 8,
    type: "qcm",
    title: "Événements postérieurs à la clôture",
    statement:
      "L'exercice est clos le 31/12/N ; les comptes ne sont pas encore arrêtés. Quels événements de début N+1 conduisent à AJUSTER les comptes de l'exercice N ?",
    expectedAnswer:
      "Le jugement rendu en janvier sur un litige né en N et la faillite d'un client déjà douteux au 31/12 : ils précisent une situation qui existait à la clôture. L'incendie de février et la décision d'augmenter le capital sont des événements nouveaux — information en annexe le cas échéant, pas d'ajustement.",
    competencyIds: ["cg-etats-financiers", "cg-provisions"],
    rubric: [{ label: "Événements donnant lieu à ajustement", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-pcg-ifrs-etats-qcm",
    level: 4,
    minutes: 10,
    type: "qcm",
    title: "États financiers : PCG et IFRS comparés",
    statement: "Parmi les affirmations suivantes sur la présentation des états financiers, lesquelles sont exactes ?",
    expectedAnswer:
      "En IFRS, l'état du résultat global inclut les autres éléments du résultat global (OCI), sans équivalent direct en PCG ; le PCG impose des modèles normalisés là où les IFRS imposent surtout un contenu minimal ; et sur les provisions, IAS 37 et le PCG retiennent des critères voisins (obligation, sortie probable, évaluation fiable). En revanche les IFRS n'imposent pas une présentation des charges par nature, et le tableau des flux de trésorerie n'est pas « interdit » en PCG.",
    competencyIds: ["cg-etats-financiers", "ifrs-ias37"],
    rubric: [{ label: "Affirmations exactes PCG / IFRS", points: 20 }]
  }),
  toExercise({
    id: "ex-cgv1-dossier-annuel-qcm",
    level: 4,
    minutes: 8,
    type: "qcm",
    title: "Contenu du dossier annuel",
    statement: "Que doit contenir le dossier annuel (dossier de travail) qui justifie l'arrêté des comptes ?",
    expectedAnswer:
      "La balance définitive après inventaire, les feuilles maîtresses par cycle et les pièces justifiant chaque écriture d'inventaire. La liasse fiscale seule ne justifie rien, et des brouillons non datés et non référencés n'ont pas leur place dans un dossier de révision.",
    competencyIds: ["cg-etats-financiers"],
    rubric: [{ label: "Contenu du dossier annuel", points: 20 }]
  })
];

// --- Spécifications typées et cas dorés --------------------------------------

const JOURNAL_POINTS = { accounts: 4, direction: 3, amounts: 4, balance: 2 };

function journalVersion(
  exerciseId: string,
  expectedLines: Array<{ account: string; debit?: number; credit?: number; label: string; alsoAccept?: string[] }>,
  testCases: AuthoredExerciseVersion["testCases"],
  options: { allowExtraLines?: boolean } = {}
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      expectedLines,
      amountToleranceAbs: 0,
      allowExtraLines: options.allowExtraLines ?? false,
      points: JOURNAL_POINTS
    },
    testCases
  };
}

function numericVersion(
  exerciseId: string,
  expected: number,
  label: string,
  testCases: AuthoredExerciseVersion["testCases"]
): AuthoredExerciseVersion {
  return {
    id: `exv-${exerciseId.replace(/^ex-/, "")}-1`,
    exerciseId,
    version: 1,
    evaluationType: "numeric",
    spec: { expected, toleranceAbs: 0.01, unit: "EUR", label },
    testCases
  };
}

export const comptaGeneraleClotureExerciseVersions: AuthoredExerciseVersion[] = [
  journalVersion(
    "ex-cgv1-cca",
    [
      { account: "486", debit: 2000, label: "Charges constatées d'avance" },
      { account: "616", credit: 2000, label: "Primes d'assurance", alsoAccept: ["6161"] }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "486", debit: 2000 },
            { account: "616", credit: 2000 }
          ]
        },
        expectedScore: 20
      },
      {
        // Variante explicitement acceptée : le sous-compte 6161.
        name: "variante-sous-compte-6161",
        submission: {
          kind: "journal",
          lines: [
            { account: "486", debit: 2000 },
            { account: "6161", credit: 2000 }
          ]
        },
        expectedScore: 20
      },
      {
        name: "sens-inverse",
        submission: {
          kind: "journal",
          lines: [
            { account: "486", credit: 2000 },
            { account: "616", debit: 2000 }
          ]
        },
        expectedScore: 9.23,
        expectedOutcomes: { accounts: "met", direction: "missed", amounts: "missed", balance: "met" }
      },
      {
        // Oubli du prorata : toute la prime basculée en CCA.
        name: "oubli-du-prorata",
        submission: {
          kind: "journal",
          lines: [
            { account: "486", debit: 2400 },
            { account: "616", credit: 2400 }
          ]
        },
        expectedScore: 13.85,
        expectedOutcomes: { accounts: "met", direction: "met", amounts: "missed", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-pca",
    [
      { account: "706", debit: 2400, label: "Prestations de services" },
      { account: "487", credit: 2400, label: "Produits constatés d'avance" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "706", debit: 2400 },
            { account: "487", credit: 2400 }
          ]
        },
        expectedScore: 20
      },
      {
        // CCA au lieu de PCA : le contresens de cut-off classique.
        name: "confond-cca",
        submission: {
          kind: "journal",
          lines: [
            { account: "486", debit: 2400 },
            { account: "706", credit: 2400 }
          ]
        },
        expectedScore: 3.08,
        expectedOutcomes: { accounts: "missed", direction: "missed", amounts: "missed", balance: "met" }
      },
      {
        name: "montant-total-facture",
        submission: {
          kind: "journal",
          lines: [
            { account: "706", debit: 3600 },
            { account: "487", credit: 3600 }
          ]
        },
        expectedScore: 13.85,
        expectedOutcomes: { accounts: "met", direction: "met", amounts: "missed", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-fnp",
    [
      { account: "607", debit: 900, label: "Achats de marchandises" },
      { account: "44586", debit: 180, label: "TVA sur factures non parvenues" },
      { account: "408", credit: 1080, label: "Fournisseurs — factures non parvenues" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 900 },
            { account: "44586", debit: 180 },
            { account: "408", credit: 1080 }
          ]
        },
        expectedScore: 20
      },
      {
        // TVA au 44566 et dette au 401 : la facture est traitée comme reçue.
        name: "comptes-de-facture-recue",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 900 },
            { account: "44566", debit: 180 },
            { account: "401", credit: 1080 }
          ]
        },
        expectedScore: 6.66,
        expectedOutcomes: { accounts: "missed", direction: "partial", amounts: "partial", balance: "met" }
      },
      {
        name: "dette-en-ht",
        submission: {
          kind: "journal",
          lines: [
            { account: "607", debit: 900 },
            { account: "44586", debit: 180 },
            { account: "408", credit: 900 }
          ]
        },
        expectedScore: 14.88,
        expectedOutcomes: { accounts: "met", direction: "met", amounts: "partial", balance: "missed" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-fae",
    [
      { account: "418", debit: 1800, label: "Clients — produits non encore facturés" },
      { account: "707", credit: 1500, label: "Ventes de marchandises" },
      { account: "44587", credit: 300, label: "TVA sur factures à établir" }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "418", debit: 1800 },
            { account: "707", credit: 1500 },
            { account: "44587", credit: 300 }
          ]
        },
        expectedScore: 20
      },
      {
        // Créance portée au 411 comme une facture émise.
        name: "creance-au-411",
        submission: {
          kind: "journal",
          lines: [
            { account: "411", debit: 1800 },
            { account: "707", credit: 1500 },
            { account: "44587", credit: 300 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      },
      {
        name: "produit-en-ttc",
        submission: {
          kind: "journal",
          lines: [
            { account: "418", debit: 1800 },
            { account: "707", credit: 1800 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-creance-douteuse",
    [
      { account: "416", debit: 2400, label: "Clients douteux" },
      { account: "411", credit: 2400, label: "Clients" },
      { account: "68174", debit: 1200, label: "Dotations aux dépréciations des créances" },
      { account: "491", credit: 1200, label: "Dépréciations des comptes de clients" }
    ],
    [
      {
        name: "ecritures-exactes",
        submission: {
          kind: "journal",
          lines: [
            { account: "416", debit: 2400 },
            { account: "411", credit: 2400 },
            { account: "68174", debit: 1200 },
            { account: "491", credit: 1200 }
          ]
        },
        expectedScore: 20
      },
      {
        // Dépréciation calculée sur le TTC : 2 400 × 60 % = 1 440.
        name: "depreciation-sur-ttc",
        submission: {
          kind: "journal",
          lines: [
            { account: "416", debit: 2400 },
            { account: "411", credit: 2400 },
            { account: "68174", debit: 1440 },
            { account: "491", credit: 1440 }
          ]
        },
        expectedScore: 16.92,
        expectedOutcomes: { accounts: "met", direction: "met", amounts: "partial", balance: "met" }
      },
      {
        name: "oublie-le-reclassement",
        submission: {
          kind: "journal",
          lines: [
            { account: "68174", debit: 1200 },
            { account: "491", credit: 1200 }
          ]
        },
        expectedScore: 11.54,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-depreciation-stock", 950, "Dotation aux dépréciations du stock", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 950 }, expectedScore: 20 },
    {
      // La valeur actuelle prise pour la dotation.
      name: "valeur-actuelle",
      submission: { kind: "numeric", value: 4470 },
      expectedScore: 0
    }
  ]),
  journalVersion(
    "ex-cgv1-variation-stocks",
    [
      { account: "6037", debit: 6800, label: "Variation des stocks — annulation du stock initial" },
      { account: "37", credit: 6800, label: "Stocks de marchandises — annulation" },
      { account: "37", debit: 5420, label: "Stocks de marchandises — constatation" },
      { account: "6037", credit: 5420, label: "Variation des stocks — constatation" }
    ],
    [
      {
        name: "ecritures-exactes",
        submission: {
          kind: "journal",
          lines: [
            { account: "6037", debit: 6800 },
            { account: "37", credit: 6800 },
            { account: "37", debit: 5420 },
            { account: "6037", credit: 5420 }
          ]
        },
        expectedScore: 20
      },
      {
        // Même contenu, lignes dans un autre ordre : l'appariement ne dépend
        // pas de l'ordre de saisie.
        name: "ordre-different",
        submission: {
          kind: "journal",
          lines: [
            { account: "37", debit: 5420 },
            { account: "6037", credit: 5420 },
            { account: "6037", debit: 6800 },
            { account: "37", credit: 6800 }
          ]
        },
        expectedScore: 20
      },
      {
        name: "sens-inverses",
        submission: {
          kind: "journal",
          lines: [
            { account: "6037", credit: 6800 },
            { account: "37", debit: 6800 },
            { account: "37", credit: 5420 },
            { account: "6037", debit: 5420 }
          ]
        },
        expectedScore: 9.23,
        expectedOutcomes: { accounts: "met", direction: "missed", amounts: "missed", balance: "met" }
      },
      {
        // Une seule écriture « en net » : variante refusée, elle masque les flux.
        name: "variation-en-net",
        submission: {
          kind: "journal",
          lines: [
            { account: "6037", debit: 1380 },
            { account: "37", credit: 1380 }
          ]
        },
        expectedScore: 8.46,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "missed", balance: "met" }
      }
    ]
  ),
  journalVersion(
    "ex-cgv1-regularisations-bancaires",
    [
      { account: "512", debit: 1260, label: "Banque — virement client" },
      { account: "411", credit: 1260, label: "Clients" },
      { account: "661", debit: 40, label: "Charges d'intérêts", alsoAccept: ["6616"] },
      { account: "512", credit: 40, label: "Banque — intérêts débiteurs" }
    ],
    [
      {
        name: "ecritures-exactes",
        submission: {
          kind: "journal",
          lines: [
            { account: "512", debit: 1260 },
            { account: "411", credit: 1260 },
            { account: "661", debit: 40 },
            { account: "512", credit: 40 }
          ]
        },
        expectedScore: 20
      },
      {
        // Le chèque non débité comptabilisé une seconde fois.
        name: "comptabilise-le-cheque",
        submission: {
          kind: "journal",
          lines: [
            { account: "512", debit: 1260 },
            { account: "411", credit: 1260 },
            { account: "661", debit: 40 },
            { account: "512", credit: 40 },
            { account: "401", debit: 790 },
            { account: "512", credit: 790 }
          ]
        },
        expectedScore: 16.92,
        expectedOutcomes: { accounts: "partial", direction: "met", amounts: "met", balance: "met" }
      },
      {
        name: "interets-au-627",
        submission: {
          kind: "journal",
          lines: [
            { account: "512", debit: 1260 },
            { account: "411", credit: 1260 },
            { account: "627", debit: 40 },
            { account: "512", credit: 40 }
          ]
        },
        expectedScore: 14.23,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-controle-tva", 500, "Écart de TVA collectée", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 500 }, expectedScore: 20 },
    {
      // La TVA théorique donnée comme écart.
      name: "tva-theorique",
      submission: { kind: "numeric", value: 27600 },
      expectedScore: 0
    }
  ]),
  {
    id: "exv-cgv1-cutoff-inventaire-qcm-1",
    exerciseId: "ex-cgv1-cutoff-inventaire-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Situations à régulariser au 31/12/N",
      options: [
        { id: "loyer-davance", label: "Le loyer de janvier N+1 a été payé et comptabilisé en décembre N" },
        { id: "marchandises-sans-facture", label: "Des marchandises ont été reçues, la facture n'est pas arrivée" },
        {
          id: "commande-non-livree",
          label: "Une commande client est enregistrée mais non livrée au 31/12",
          rationale: "Sans livraison, ni produit ni créance ne sont acquis : aucune écriture d'inventaire."
        },
        { id: "livraison-non-facturee", label: "Une livraison de décembre n'est pas encore facturée" },
        {
          id: "acompte-verse",
          label: "Un acompte a été versé sur une commande fournisseur non reçue",
          rationale: "L'acompte reste au 4091 jusqu'à la facture : rien à régulariser."
        }
      ],
      correctOptionIds: ["loyer-davance", "marchandises-sans-facture", "livraison-non-facturee"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: {
          kind: "choice",
          selectedOptionIds: ["loyer-davance", "marchandises-sans-facture", "livraison-non-facturee"]
        },
        expectedScore: 20
      },
      {
        name: "coche-tout",
        submission: {
          kind: "choice",
          selectedOptionIds: [
            "loyer-davance",
            "marchandises-sans-facture",
            "commande-non-livree",
            "livraison-non-facturee",
            "acompte-verse"
          ]
        },
        expectedScore: 0
      },
      {
        name: "oublie-la-fae",
        submission: { kind: "choice", selectedOptionIds: ["loyer-davance", "marchandises-sans-facture"] },
        expectedScore: 13.33
      }
    ]
  },
  numericVersion("ex-cgv1-amortissements-cloture", 2550, "Dotation totale de l'exercice N", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 2550 }, expectedScore: 20 },
    {
      // Deux annuités pleines : le prorata du poste informatique est oublié.
      name: "annuites-pleines",
      submission: { kind: "numeric", value: 3000 },
      expectedScore: 0
    }
  ]),
  journalVersion(
    "ex-cgv1-provision-cloture",
    [
      { account: "6815", debit: 4500, label: "Dotations aux provisions d'exploitation" },
      { account: "1511", credit: 4500, label: "Provisions pour litiges", alsoAccept: ["151"] }
    ],
    [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "6815", debit: 4500 },
            { account: "1511", credit: 4500 }
          ]
        },
        expectedScore: 20
      },
      {
        // Variante acceptée : le compte de rattachement 151.
        name: "variante-compte-151",
        submission: {
          kind: "journal",
          lines: [
            { account: "6815", debit: 4500 },
            { account: "151", credit: 4500 }
          ]
        },
        expectedScore: 20
      },
      {
        // Provision portée en dette fournisseur : le passif n'est pas une dette certaine.
        name: "provision-au-401",
        submission: {
          kind: "journal",
          lines: [
            { account: "6815", debit: 4500 },
            { account: "401", credit: 4500 }
          ]
        },
        expectedScore: 8.46,
        expectedOutcomes: { accounts: "missed", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  numericVersion("ex-cgv1-balance-apres-inventaire", VELOCITE_TRIAL_BALANCE_TOTAL, "Total de la balance après inventaire", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 305140 }, expectedScore: 20 },
    {
      name: "oublie-les-mouvements",
      submission: { kind: "numeric", value: 274040 },
      expectedScore: 0
    }
  ]),
  numericVersion("ex-cgv1-feuille-maitresse", VELOCITE_CLIENTS_NET, "Poste net Clients et comptes rattachés", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 48300 }, expectedScore: 20 },
    {
      // La dépréciation ajoutée au lieu d'être soustraite.
      name: "depreciation-ajoutee",
      submission: { kind: "numeric", value: 50700 },
      expectedScore: 0
    }
  ]),
  {
    id: "exv-cgv1-controles-coherence-qcm-1",
    exerciseId: "ex-cgv1-controles-coherence-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Contrôles de cohérence de fin d'exercice",
      options: [
        { id: "balance-grand-livre", label: "Concordance entre la balance et le grand livre" },
        { id: "resultat-bilan-cr", label: "Égalité du résultat entre bilan et compte de résultat" },
        { id: "tva-theorique", label: "Rapprochement TVA théorique / TVA comptabilisée" },
        {
          id: "actif-egal-charges",
          label: "Égalité entre total de l'actif et total des charges",
          rationale: "Aucune identité comptable ne relie l'actif aux charges : ce contrôle ne prouve rien."
        },
        {
          id: "tresorerie-positive",
          label: "Vérification que la trésorerie est positive",
          rationale: "Une trésorerie négative peut être une réalité économique ; ce n'est pas une incohérence comptable."
        }
      ],
      correctOptionIds: ["balance-grand-livre", "resultat-bilan-cr", "tva-theorique"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: {
          kind: "choice",
          selectedOptionIds: ["balance-grand-livre", "resultat-bilan-cr", "tva-theorique"]
        },
        expectedScore: 20
      },
      {
        name: "retient-la-tresorerie",
        submission: {
          kind: "choice",
          selectedOptionIds: ["balance-grand-livre", "resultat-bilan-cr", "tresorerie-positive"]
        },
        expectedScore: 3.33
      }
    ]
  },
  {
    id: "exv-cgv1-revue-cycle-fournisseurs-qcm-1",
    exerciseId: "ex-cgv1-revue-cycle-fournisseurs-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Contrôles du cycle fournisseurs / achats",
      options: [
        { id: "circularisation", label: "Circularisation (confirmation directe) des fournisseurs" },
        { id: "rapprochement-401", label: "Rapprochement des comptes 401 avec les relevés fournisseurs" },
        { id: "revue-fnp", label: "Revue des factures non parvenues et de leur dénouement en N+1" },
        {
          id: "comptage-caisse",
          label: "Comptage de la caisse",
          rationale: "Le comptage de caisse appartient au cycle trésorerie."
        },
        {
          id: "controle-paie",
          label: "Contrôle des bulletins de paie",
          rationale: "La paie relève du cycle personnel, pas du cycle achats."
        }
      ],
      correctOptionIds: ["circularisation", "rapprochement-401", "revue-fnp"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: {
          kind: "choice",
          selectedOptionIds: ["circularisation", "rapprochement-401", "revue-fnp"]
        },
        expectedScore: 20
      },
      {
        name: "coche-tout",
        submission: {
          kind: "choice",
          selectedOptionIds: ["circularisation", "rapprochement-401", "revue-fnp", "comptage-caisse", "controle-paie"]
        },
        expectedScore: 0
      }
    ]
  },
  numericVersion("ex-cgv1-resultat-exercice", VELOCITE_RESULTAT, "Résultat de l'exercice", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 23660 }, expectedScore: 20 },
    { name: "signe-inverse", submission: { kind: "numeric", value: -23660 }, expectedScore: 0 }
  ]),
  numericVersion("ex-cgv1-total-bilan", VELOCITE_TOTAL_BILAN, "Total de l'actif net", [
    { name: "valeur-exacte", submission: { kind: "numeric", value: 107300 }, expectedScore: 20 },
    {
      // L'actif brut donné sans déduire amortissements et dépréciations.
      name: "actif-brut",
      submission: { kind: "numeric", value: 115600 },
      expectedScore: 0
    }
  ]),
  {
    id: "exv-cgv1-annexe-qcm-1",
    exerciseId: "ex-cgv1-annexe-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Contenu obligatoire de l'annexe simplifiée",
      options: [
        { id: "methodes", label: "Les méthodes d'évaluation retenues" },
        { id: "tableau-amortissements", label: "Le tableau des amortissements et dépréciations" },
        { id: "credit-bail", label: "Les engagements de crédit-bail" },
        {
          id: "salaires-nominatifs",
          label: "Le détail nominatif des salaires",
          rationale: "L'annexe agrège ; elle ne publie jamais de données nominatives."
        },
        {
          id: "liste-clients",
          label: "La liste des clients de l'exercice",
          rationale: "La liste des clients est une donnée de gestion, pas une information d'annexe."
        }
      ],
      correctOptionIds: ["methodes", "tableau-amortissements", "credit-bail"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: { kind: "choice", selectedOptionIds: ["methodes", "tableau-amortissements", "credit-bail"] },
        expectedScore: 20
      },
      {
        name: "oublie-le-credit-bail",
        submission: { kind: "choice", selectedOptionIds: ["methodes", "tableau-amortissements"] },
        expectedScore: 13.33
      }
    ]
  },
  journalVersion(
    "ex-cgv1-ajustement-revision",
    [
      { account: "654", debit: 2000, label: "Pertes sur créances irrécouvrables" },
      { account: "44571", debit: 400, label: "TVA collectée (récupérée)" },
      { account: "416", credit: 2400, label: "Clients douteux" },
      { account: "491", debit: 1200, label: "Dépréciations des comptes de clients (reprise)" },
      { account: "78174", credit: 1200, label: "Reprises sur dépréciations des créances" }
    ],
    [
      {
        name: "ecritures-exactes",
        submission: {
          kind: "journal",
          lines: [
            { account: "654", debit: 2000 },
            { account: "44571", debit: 400 },
            { account: "416", credit: 2400 },
            { account: "491", debit: 1200 },
            { account: "78174", credit: 1200 }
          ]
        },
        expectedScore: 20
      },
      {
        // Perte comptabilisée en TTC, sans récupération de TVA.
        name: "perte-en-ttc",
        submission: {
          kind: "journal",
          lines: [
            { account: "654", debit: 2400 },
            { account: "416", credit: 2400 },
            { account: "491", debit: 1200 },
            { account: "78174", credit: 1200 }
          ]
        },
        expectedScore: 15.38,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      },
      {
        name: "oublie-la-reprise",
        submission: {
          kind: "journal",
          lines: [
            { account: "654", debit: 2000 },
            { account: "44571", debit: 400 },
            { account: "416", credit: 2400 }
          ]
        },
        expectedScore: 13.23,
        expectedOutcomes: { accounts: "partial", direction: "partial", amounts: "partial", balance: "met" }
      }
    ]
  ),
  {
    id: "exv-cgv1-evenements-posterieurs-qcm-1",
    exerciseId: "ex-cgv1-evenements-posterieurs-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Événements postérieurs donnant lieu à ajustement",
      options: [
        { id: "jugement", label: "Jugement rendu en janvier N+1 sur un litige né en N" },
        { id: "faillite-client", label: "Faillite en janvier N+1 d'un client déjà douteux au 31/12/N" },
        {
          id: "incendie",
          label: "Incendie de l'entrepôt en février N+1",
          rationale:
            "Événement nouveau, sans lien avec une situation existant à la clôture : information en annexe si significatif, pas d'ajustement."
        },
        {
          id: "augmentation-capital",
          label: "Décision d'augmenter le capital prise en N+1",
          rationale: "Décision nouvelle de N+1 : elle n'ajuste pas les comptes de N."
        }
      ],
      correctOptionIds: ["jugement", "faillite-client"]
    },
    testCases: [
      {
        name: "les-deux",
        submission: { kind: "choice", selectedOptionIds: ["jugement", "faillite-client"] },
        expectedScore: 20
      },
      {
        name: "retient-l-incendie",
        submission: { kind: "choice", selectedOptionIds: ["jugement", "faillite-client", "incendie"] },
        expectedScore: 10
      }
    ]
  },
  {
    id: "exv-cgv1-pcg-ifrs-etats-qcm-1",
    exerciseId: "ex-cgv1-pcg-ifrs-etats-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Affirmations exactes sur la présentation PCG / IFRS",
      options: [
        {
          id: "oci",
          label:
            "En IFRS, l'état du résultat global inclut les autres éléments du résultat global (OCI), sans équivalent direct en PCG"
        },
        {
          id: "formats",
          label: "Le PCG impose des modèles normalisés ; les IFRS imposent surtout un contenu minimal"
        },
        {
          id: "provisions-voisines",
          label: "Sur les provisions, IAS 37 et le PCG retiennent des critères voisins"
        },
        {
          id: "par-nature-obligatoire",
          label: "En IFRS, les charges doivent obligatoirement être présentées par nature",
          rationale: "Les IFRS admettent la présentation par nature ou par fonction ; aucune n'est imposée seule."
        },
        {
          id: "flux-interdit",
          label: "Le tableau des flux de trésorerie est interdit en PCG",
          rationale: "Rien n'interdit un tableau de flux en PCG ; il est simplement obligatoire en IFRS et pas dans les comptes annuels de base."
        }
      ],
      correctOptionIds: ["oci", "formats", "provisions-voisines"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: { kind: "choice", selectedOptionIds: ["oci", "formats", "provisions-voisines"] },
        expectedScore: 20
      },
      {
        name: "retient-par-nature",
        submission: {
          kind: "choice",
          selectedOptionIds: ["oci", "formats", "provisions-voisines", "par-nature-obligatoire"]
        },
        expectedScore: 10
      }
    ]
  },
  {
    id: "exv-cgv1-dossier-annuel-qcm-1",
    exerciseId: "ex-cgv1-dossier-annuel-qcm",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Contenu du dossier annuel",
      options: [
        { id: "balance-definitive", label: "La balance définitive après inventaire" },
        { id: "feuilles-maitresses", label: "Les feuilles maîtresses par cycle" },
        { id: "justificatifs", label: "Les pièces justifiant chaque écriture d'inventaire" },
        {
          id: "liasse-seule",
          label: "Uniquement la liasse fiscale",
          rationale: "La liasse est un produit du dossier, pas sa justification."
        },
        {
          id: "brouillons",
          label: "Des brouillons non datés et non référencés",
          rationale: "Un document de travail sans date ni référence ne justifie rien."
        }
      ],
      correctOptionIds: ["balance-definitive", "feuilles-maitresses", "justificatifs"]
    },
    testCases: [
      {
        name: "les-trois",
        submission: {
          kind: "choice",
          selectedOptionIds: ["balance-definitive", "feuilles-maitresses", "justificatifs"]
        },
        expectedScore: 20
      },
      {
        name: "liasse-seule",
        submission: { kind: "choice", selectedOptionIds: ["liasse-seule"] },
        expectedScore: 0
      }
    ]
  }
];

// --- Case studies ------------------------------------------------------------

export interface CaseStudyDocument {
  id: string;
  reference: string;
  date: string;
  summary: string;
}

export interface CaseStudyStep {
  exerciseId: string;
  instruction: string;
  documentId: string;
}

export interface ComptaCaseStudy {
  id: string;
  /** Segment d'URL sous /modules/comptabilite-generale/cas/. */
  slug: string;
  title: string;
  trackId: string;
  levelId: string;
  context: string;
  documents: CaseStudyDocument[];
  steps: CaseStudyStep[];
  /** Étapes de la checklist de clôture affichée avec le cas. */
  checklist: string[];
  sourceReferences: SourceReference[];
}

/**
 * Case study N3 : la clôture mensuelle de décembre. Les étapes sont des
 * exercices du niveau, dans l'ordre d'une vraie clôture : banque, cut-off,
 * stocks, TVA, balance. Même principe que le mini-cas N2 : les drills et le cas
 * sont les mêmes écritures.
 */
export const comptaClotureMensuelleCase: ComptaCaseStudy = {
  id: "case-cgv1-cloture-decembre",
  slug: "cloture-mensuelle",
  title: "Clôture mensuelle de décembre (SARL Vélo Cité)",
  trackId: COMPTA_GENERALE_V1_TRACK,
  levelId: "level-compta-generale-v1-3",
  context:
    "Décembre N. Vous préparez la clôture mensuelle de la SARL Vélo Cité : rapprochement bancaire, régularisations de cut-off, stocks et contrôle de TVA, jusqu'à la balance après inventaire.",
  documents: [
    {
      id: "doc-releve-1231",
      reference: "Relevé bancaire au 31/12",
      date: "31/12/N",
      summary:
        "Solde relevé 36 240,00 €. En rapprochement : chèque n° 78 de 790,00 € non débité ; virement client de 1 260,00 € non comptabilisé ; intérêts débiteurs de 40,00 € non comptabilisés."
    },
    {
      id: "doc-assurance",
      reference: "Quittance d'assurance",
      date: "01/11/N",
      summary: "Prime annuelle de 2 400,00 € payée le 1er novembre N, couvrant du 01/11/N au 31/10/N+1 (compte 616)."
    },
    {
      id: "doc-bl-cyclo",
      reference: "Bon de livraison Cyclo Pro n° BL-889",
      date: "28/12/N",
      summary: "Marchandises reçues pour 900,00 € HT, TVA 20 % ; facture non parvenue au 31/12."
    },
    {
      id: "doc-inventaire-stock",
      reference: "État d'inventaire des stocks",
      date: "31/12/N",
      summary:
        "Stock final de marchandises : 5 420,00 € au coût d'achat ; valeur actuelle estimée 4 470,00 € ; aucune dépréciation antérieure."
    },
    {
      id: "doc-controle-tva",
      reference: "Feuille de contrôle TVA",
      date: "31/12/N",
      summary:
        "CA comptabilisé au taux normal : 138 000,00 € HT ; solde du compte 44571 TVA collectée : 27 100,00 €."
    },
    {
      id: "doc-balance-provisoire",
      reference: "Balance avant inventaire",
      date: "31/12/N",
      summary:
        "Total des débits (= crédits) avant écritures d'inventaire : 274 040,00 €. Mouvements d'inventaire passés : 31 100,00 € au débit."
    }
  ],
  steps: [
    {
      exerciseId: "ex-cgv1-regularisations-bancaires",
      documentId: "doc-releve-1231",
      instruction: "Passez les écritures de régularisation issues du rapprochement bancaire."
    },
    {
      exerciseId: "ex-cgv1-cca",
      documentId: "doc-assurance",
      instruction: "Régularisez la prime d'assurance payée d'avance."
    },
    {
      exerciseId: "ex-cgv1-fnp",
      documentId: "doc-bl-cyclo",
      instruction: "Constatez la facture non parvenue sur les marchandises reçues."
    },
    {
      exerciseId: "ex-cgv1-depreciation-stock",
      documentId: "doc-inventaire-stock",
      instruction: "Calculez la dotation aux dépréciations du stock."
    },
    {
      exerciseId: "ex-cgv1-controle-tva",
      documentId: "doc-controle-tva",
      instruction: "Contrôlez la cohérence de la TVA collectée et chiffrez l'écart."
    },
    {
      exerciseId: "ex-cgv1-balance-apres-inventaire",
      documentId: "doc-balance-provisoire",
      instruction: "Déterminez le total de la balance après inventaire."
    }
  ],
  checklist: [
    "Rapprochement bancaire établi et régularisations passées",
    "Charges et produits rattachés au bon exercice (CCA, PCA, FNP, FAE)",
    "Stocks inventoriés, variation et dépréciation comptabilisées",
    "Dotations aux amortissements et provisions passées",
    "TVA contrôlée et écarts expliqués",
    "Balance après inventaire équilibrée et éditée"
  ],
  sourceReferences: [clotureCourseSource, pcgComptesSource]
};

/**
 * Case study N4 : l'arrêté annuel. De la balance après inventaire aux états
 * financiers, avec revue, ajustement et contrôles — le dossier annuel complet.
 */
export const comptaArreteAnnuelCase: ComptaCaseStudy = {
  id: "case-cgv1-arrete-annuel",
  slug: "arrete-annuel",
  title: "Arrêté annuel de la SARL Vélo Cité",
  trackId: COMPTA_GENERALE_V1_TRACK,
  levelId: "level-compta-generale-v1-4",
  context:
    "L'exercice N est clos. À partir de la balance après inventaire, vous montez le dossier annuel : feuilles maîtresses, revue des cycles, ajustements, états financiers et note de révision.",
  documents: [
    {
      id: "doc-balance-definitive",
      reference: "Balance après inventaire au 31/12/N",
      date: "31/12/N",
      summary:
        "Total 305 140,00 € (débits = crédits). Actif brut (classes 1 à 5 débitrices) : 115 600,00 € ; amortissements et dépréciations : 8 300,00 € ; produits 213 200,00 € ; charges 189 540,00 €."
    },
    {
      id: "doc-fm-clients",
      reference: "Feuille maîtresse — cycle clients",
      date: "31/12/N",
      summary:
        "411 Clients 45 300,00 (D) ; 416 Clients douteux 2 400,00 (D) ; 418 Produits non encore facturés 1 800,00 (D) ; 491 Dépréciations 1 200,00 (C)."
    },
    {
      id: "doc-note-revision",
      reference: "Note de révision — cycle clients",
      date: "15/01/N+1",
      summary:
        "Le client Durand (2 400,00 € TTC en 416, déprécié à 1 200,00 €) est parti sans laisser d'adresse : créance irrécouvrable, ajustement recommandé."
    },
    {
      id: "doc-evenements",
      reference: "Revue des événements postérieurs",
      date: "20/01/N+1",
      summary:
        "Janvier N+1 : jugement rendu sur le litige prud'homal né en N ; faillite d'un client déjà douteux au 31/12 ; projet d'augmentation de capital évoqué en N+1."
    },
    {
      id: "doc-cr",
      reference: "Projet de compte de résultat",
      date: "31/12/N",
      summary: "Produits (classe 7) : 213 200,00 € ; charges (classe 6) : 189 540,00 €."
    },
    {
      id: "doc-bilan",
      reference: "Projet de bilan",
      date: "31/12/N",
      summary: "Actif brut 115 600,00 € ; amortissements et dépréciations 8 300,00 €."
    }
  ],
  steps: [
    {
      exerciseId: "ex-cgv1-feuille-maitresse",
      documentId: "doc-fm-clients",
      instruction: "Établissez le poste net « Clients et comptes rattachés » de la feuille maîtresse."
    },
    {
      exerciseId: "ex-cgv1-ajustement-revision",
      documentId: "doc-note-revision",
      instruction: "Passez les écritures d'ajustement recommandées par la note de révision."
    },
    {
      exerciseId: "ex-cgv1-evenements-posterieurs-qcm",
      documentId: "doc-evenements",
      instruction: "Qualifiez les événements postérieurs : ajustement ou simple information."
    },
    {
      exerciseId: "ex-cgv1-resultat-exercice",
      documentId: "doc-cr",
      instruction: "Arrêtez le résultat de l'exercice depuis la balance."
    },
    {
      exerciseId: "ex-cgv1-total-bilan",
      documentId: "doc-bilan",
      instruction: "Arrêtez le total du bilan et vérifiez l'équilibre actif/passif."
    }
  ],
  checklist: [
    "Feuilles maîtresses établies pour chaque cycle significatif",
    "Revue des cycles réalisée et ajustements comptabilisés",
    "Événements postérieurs analysés et traités",
    "Compte de résultat arrêté et rapproché de la balance",
    "Bilan équilibré, résultat identique au compte de résultat",
    "Annexe simplifiée rédigée, dossier annuel archivé"
  ],
  sourceReferences: [clotureCourseSource, pcgEtatsSource, ias37NotesSource, ifrs18NotesSource]
};

export const comptaCaseStudies: ComptaCaseStudy[] = [comptaClotureMensuelleCase, comptaArreteAnnuelCase];

export function getComptaCaseStudyBySlug(slug: string): ComptaCaseStudy | null {
  return comptaCaseStudies.find((caseStudy) => caseStudy.slug === slug) ?? null;
}

/** Tous les exercices appartenant à une étape d'un case study N3/N4. */
export function isCaseStudyExercise(exerciseId: string): boolean {
  return comptaCaseStudies.some((caseStudy) =>
    caseStudy.steps.some((step) => step.exerciseId === exerciseId)
  );
}

// --- Rattachement niveau / exercice -----------------------------------------

export const comptaGeneraleClotureLevelByExercise: Record<string, string> = Object.fromEntries(
  comptaGeneraleClotureExercises.map((exercise) => [
    exercise.id,
    exercise.level === 3 ? "level-compta-generale-v1-3" : "level-compta-generale-v1-4"
  ])
);

export function getComptaGeneraleClotureExercises(level: 3 | 4): Exercise[] {
  return comptaGeneraleClotureExercises.filter((exercise) => exercise.level === level);
}
