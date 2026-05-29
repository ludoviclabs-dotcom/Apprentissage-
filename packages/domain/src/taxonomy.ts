import type { Competency, Domain, DomainId } from "./types";

export const domains: Domain[] = [
  {
    id: "compta-generale",
    name: "Comptabilité générale",
    shortName: "Compta générale",
    accent: "#2563eb",
    softAccent: "#dbeafe",
    description: "Ecritures, clôture, immobilisations, provisions et cut-off."
  },
  {
    id: "compta-analytique",
    name: "Comptabilité analytique",
    shortName: "Analytique",
    accent: "#15803d",
    softAccent: "#dcfce7",
    description: "Coûts complets, variables, ABC, seuil et écarts."
  },
  {
    id: "controle-gestion",
    name: "Contrôle de gestion",
    shortName: "Contrôle",
    accent: "#c2410c",
    softAccent: "#ffedd5",
    description: "Budget, forecast, business review, marges et KPI."
  },
  {
    id: "ifrs-ias",
    name: "IFRS / IAS",
    shortName: "IFRS / IAS",
    accent: "#7c3aed",
    softAccent: "#ede9fe",
    description: "Normes, jugements comptables, notes et présentation."
  },
  {
    id: "iso",
    name: "ISO",
    shortName: "ISO",
    accent: "#0891b2",
    softAccent: "#cffafe",
    description: "Audit interne, preuves, non-conformités et actions correctives."
  },
  {
    id: "fiscalite",
    name: "Fiscalité",
    shortName: "Fiscalité",
    accent: "#be123c",
    softAccent: "#ffe4e6",
    description: "Résultat fiscal, retraitements, TVA et obligations."
  },
  {
    id: "finance",
    name: "Finance",
    shortName: "Finance",
    accent: "#0f766e",
    softAccent: "#ccfbf1",
    description: "Analyse financière, cash-flow, ratios et diagnostic."
  }
];

export const competencies: Competency[] = [
  {
    id: "cg-cutoff",
    domainId: "compta-generale",
    name: "Rattacher charges et produits à la bonne période",
    levelMin: 1,
    levelMax: 3,
    status: "in-progress",
    strength: 68,
    focus: "Identifier le fait générateur avant le compte."
  },
  {
    id: "cg-provisions",
    domainId: "compta-generale",
    name: "Qualifier et comptabiliser une provision",
    levelMin: 2,
    levelMax: 4,
    status: "fragile",
    strength: 45,
    focus: "Distinguer obligation, probabilité et estimation fiable."
  },
  {
    id: "ca-centres",
    domainId: "compta-analytique",
    name: "Répartir les charges indirectes par centres",
    levelMin: 1,
    levelMax: 3,
    status: "in-progress",
    strength: 58,
    focus: "Séparer auxiliaires, principaux et unités d'oeuvre."
  },
  {
    id: "ca-seuil",
    domainId: "compta-analytique",
    name: "Calculer seuil de rentabilité et marge sur coût variable",
    levelMin: 1,
    levelMax: 3,
    status: "mastered",
    strength: 82,
    focus: "Relier taux de marge et charges fixes."
  },
  {
    id: "cdg-ecarts",
    domainId: "controle-gestion",
    name: "Expliquer les écarts prix-volume-mix",
    levelMin: 2,
    levelMax: 5,
    status: "in-progress",
    strength: 64,
    focus: "Isoler la mécanique avant le commentaire business."
  },
  {
    id: "cdg-forecast",
    domainId: "controle-gestion",
    name: "Construire un forecast exploitable",
    levelMin: 2,
    levelMax: 4,
    status: "not-started",
    strength: 22,
    focus: "Relier hypothèses opérationnelles et états financiers."
  },
  {
    id: "ifrs-ias37",
    domainId: "ifrs-ias",
    name: "Comparer PCG provisions et IAS 37",
    levelMin: 3,
    levelMax: 5,
    status: "fragile",
    strength: 41,
    focus: "Justifier les critères de comptabilisation et d'information."
  },
  {
    id: "ifrs-18",
    domainId: "ifrs-ias",
    name: "Comprendre la logique de présentation IFRS 18",
    levelMin: 3,
    levelMax: 5,
    status: "not-started",
    strength: 18,
    focus: "Distinguer catégories de performance et agrégats."
  },
  {
    id: "iso-audit",
    domainId: "iso",
    name: "Qualifier un constat d'audit interne",
    levelMin: 1,
    levelMax: 4,
    status: "in-progress",
    strength: 49,
    focus: "Relier exigence, preuve, écart et risque."
  },
  {
    id: "iso-actions",
    domainId: "iso",
    name: "Formuler actions correctives et preuves attendues",
    levelMin: 2,
    levelMax: 4,
    status: "fragile",
    strength: 37,
    focus: "Eviter les actions vagues sans responsable ni échéance."
  },
  {
    id: "fisc-retraitements",
    domainId: "fiscalite",
    name: "Identifier les retraitements extra-comptables",
    levelMin: 2,
    levelMax: 4,
    status: "not-started",
    strength: 28,
    focus: "Distinguer résultat comptable, fiscal et temporalité."
  },
  {
    id: "fin-diagnostic",
    domainId: "finance",
    name: "Diagnostiquer marge, BFR et trésorerie",
    levelMin: 2,
    levelMax: 4,
    status: "in-progress",
    strength: 61,
    focus: "Passer du ratio au phénomène économique."
  }
];

export function getDomain(domainId: DomainId): Domain {
  const domain = domains.find((item) => item.id === domainId);

  if (!domain) {
    throw new Error(`Unknown domain: ${domainId}`);
  }

  return domain;
}

export function getCompetenciesByDomain(domainId: DomainId): Competency[] {
  return competencies.filter((competency) => competency.domainId === domainId);
}
