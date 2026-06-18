import type { BusinessCase, ExamSession } from "./types";

// Hand-authored, corpus-grounded annales and business case for the Compta V1 vertical.
// Exercise and competency ids reference the generated seed in compta-v1.ts.

export const comptaExamSessions: ExamSession[] = [
  {
    id: "exam-compta-generale",
    title: "Annale blanche - Comptabilité générale",
    exerciseIds: [
      "ex-operations-courantes-1",
      "ex-constitution-entreprises-1",
      "ex-travaux-cloture-1",
      "ex-titres-1",
      "ex-emprunts-obligataires-2"
    ],
    durationMinutes: 60,
    status: "draft"
  },
  {
    id: "exam-pilotage-performance",
    title: "Annale blanche - Pilotage de la performance",
    exerciseIds: ["ex-methode-abc-1", "ex-cout-cible-1", "ex-yield-management-1", "ex-ecarts-1"],
    durationMinutes: 50,
    status: "draft"
  }
];

export const comptaBusinessCase: BusinessCase = {
  id: "bc-cloture-pme",
  title: "Clôture d'un exercice PME : régularisations et provisions",
  domainId: "compta-generale",
  level: 3,
  status: "available",
  description:
    "Dossier de clôture d'une PME : passer les régularisations, qualifier une provision et justifier chaque écriture par une source.",
  dossier:
    "La société Atelier Roule (négoce de cycles) prépare sa clôture au 31/12. On relève des charges constatées d'avance et des produits à recevoir non enregistrés, un litige client probable, des stocks à ajuster et une immobilisation à amortir. Le dossier réunit un extrait de balance avant inventaire et les pièces justificatives.",
  documents: [
    {
      id: "bc-cloture-doc-balance",
      title: "Extrait de balance avant inventaire",
      summary: "Soldes des comptes de gestion et de bilan avant écritures d'inventaire.",
      sourceReferences: [
        {
          pack: "compta-master",
          document: "Les travaux de clôture - Mise en situation",
          sourceType: "exercise",
          effectiveDate: "2025-09-01"
        }
      ]
    },
    {
      id: "bc-cloture-doc-fiche",
      title: "Fiche méthode - travaux de clôture",
      summary: "Rappel des régularisations de charges et produits, des amortissements et des provisions.",
      sourceReferences: [
        {
          pack: "compta-master",
          document: "Les travaux de clôture - Fiche de cours",
          sourceType: "course",
          effectiveDate: "2025-09-01"
        }
      ]
    }
  ],
  questions: [
    {
      id: "bc-cloture-q-regul",
      prompt: "Identifier et passer les écritures de régularisation des charges et produits.",
      competencyIds: ["cg-cutoff", "cg-operations-courantes"],
      expectedPoints: ["charges constatées d'avance", "produits à recevoir", "rattachement à la période"]
    },
    {
      id: "bc-cloture-q-provision",
      prompt: "Qualifier le litige client puis justifier la provision (ou son absence).",
      competencyIds: ["cg-provisions"],
      expectedPoints: ["obligation actuelle", "sortie probable de ressources", "estimation fiable"]
    },
    {
      id: "bc-cloture-q-justif",
      prompt: "Justifier chaque écriture par une source (pièce, fiche, page).",
      competencyIds: ["cg-cutoff"],
      expectedPoints: ["pièce justificative", "fiche méthode", "traçabilité de la source"]
    }
  ],
  expectedDeliverable:
    "Tableau des écritures d'inventaire commenté + note de 10 à 15 lignes justifiant les choix avec leurs sources.",
  competencyIds: ["cg-cutoff", "cg-provisions", "cg-operations-courantes"],
  sourceReferences: [
    {
      pack: "compta-master",
      document: "Les travaux de clôture - Mise en situation",
      sourceType: "exercise",
      effectiveDate: "2025-09-01"
    },
    {
      pack: "compta-master",
      document: "Les opérations courantes - Fiche de cours",
      sourceType: "course",
      effectiveDate: "2025-09-01"
    }
  ]
};
