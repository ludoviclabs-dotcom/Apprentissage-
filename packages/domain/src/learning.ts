import type {
  Attempt,
  Correction,
  DashboardPriority,
  DocumentRecord,
  Exercise,
  LearningPath,
  Lesson,
  SourcePack
} from "./types";

export const sourcePacks: SourcePack[] = [
  {
    id: "cours-master-2025",
    name: "cours-master-2025",
    description: "Cours et exercices structurants pour la remise à niveau.",
    domainId: "compta-generale",
    versionLabel: "2025",
    effectiveDate: "2025-09-01",
    importedAt: "2026-05-28",
    status: "ready",
    documentsCount: 184,
    chunksCount: 1260
  },
  {
    id: "pcg-anc-2026",
    name: "pcg-anc-2026",
    description: "Pack de référence PCG importé manuellement.",
    domainId: "compta-generale",
    versionLabel: "consolidé 2026",
    effectiveDate: "2026-01-01",
    importedAt: "2026-05-28",
    status: "needs-review",
    documentsCount: 2,
    chunksCount: 214
  },
  {
    id: "ifrs-preparation-2027",
    name: "ifrs-preparation-2027",
    description: "Notes IFRS 18, IFRS 19 et cas IAS associés.",
    domainId: "ifrs-ias",
    versionLabel: "préparation 2027",
    effectiveDate: "2027-01-01",
    importedAt: "2026-05-28",
    status: "processing",
    documentsCount: 6,
    chunksCount: 148
  },
  {
    id: "iso-notes-personnelles",
    name: "iso-notes-personnelles",
    description: "Notes, checklists et cas pratiques internes sans reproduction normative complète.",
    domainId: "iso",
    versionLabel: "2026-05",
    effectiveDate: "2026-05-01",
    importedAt: "2026-05-28",
    status: "ready",
    documentsCount: 18,
    chunksCount: 202
  }
];

export const documents: DocumentRecord[] = [
  {
    id: "doc-cloture",
    sourcePackId: "cours-master-2025",
    filename: "cloture-comptable.pdf",
    fileType: "pdf",
    domainId: "compta-generale",
    title: "Clôture comptable et régularisations",
    originalPath: "source-packs/cours-master-2025/compta-generale/cloture-comptable.pdf",
    checksum: "seed-cloture-001",
    importedAt: "2026-05-28",
    pages: 64,
    status: "ready"
  },
  {
    id: "doc-ias37",
    sourcePackId: "ifrs-preparation-2027",
    filename: "IAS37-cas-pratiques.md",
    fileType: "md",
    domainId: "ifrs-ias",
    title: "IAS 37 - cas pratiques et comparaison PCG",
    originalPath: "source-packs/ifrs-preparation-2027/IAS37-cas-pratiques.md",
    checksum: "seed-ias37-001",
    importedAt: "2026-05-28",
    pages: 12,
    status: "processing"
  },
  {
    id: "doc-audit-iso",
    sourcePackId: "iso-notes-personnelles",
    filename: "audit-interne-cas.md",
    fileType: "md",
    domainId: "iso",
    title: "Audit interne - constats et actions correctives",
    originalPath: "source-packs/iso-notes-personnelles/audit-interne-cas.md",
    checksum: "seed-iso-001",
    importedAt: "2026-05-28",
    pages: 9,
    status: "ready"
  }
];

export const lessons: Lesson[] = [
  {
    id: "lesson-provisions",
    domainId: "compta-generale",
    title: "Provision : raisonner avant de comptabiliser",
    concept: "Une provision traduit un risque ou une charge probable rattachée à l'exercice.",
    rule: "On vérifie l'existence d'une obligation, la probabilité de sortie de ressources et la possibilité d'estimer le montant.",
    reasoning: "Le compte vient après la qualification. Il faut d'abord prouver pourquoi l'événement appartient à la période et pourquoi il n'est ni une simple éventualité ni une dette certaine.",
    example: "Un litige né avant la clôture, avec avis juridique défavorable et estimation fiable, conduit à constater une provision.",
    frequentError: "Comptabiliser dès qu'un risque existe, sans distinguer risque probable, dette certaine et engagement seulement éventuel.",
    linkedExerciseId: "ex-provision-litige",
    sourceReferences: [
      {
        pack: "cours-master-2025",
        document: "Clôture comptable et régularisations",
        sourceType: "course",
        pageStart: 42,
        pageEnd: 44,
        effectiveDate: "2025-09-01"
      },
      {
        pack: "pcg-anc-2026",
        document: "Plan comptable général - notes personnelles",
        sourceType: "official-reference",
        effectiveDate: "2026-01-01"
      }
    ]
  },
  {
    id: "lesson-ias37",
    domainId: "ifrs-ias",
    title: "PCG vs IAS 37 : même intuition, exigences plus explicites",
    concept: "IAS 37 structure les passifs incertains autour de l'obligation actuelle, de la probabilité et de la meilleure estimation.",
    rule: "Une provision IFRS est reconnue si l'entité a une obligation actuelle, une sortie probable de ressources et une estimation fiable.",
    reasoning: "La logique est proche de la prudence comptable, mais la justification attendue est plus documentée et distingue comptabilisation, information en annexe et passif éventuel.",
    example: "Une garantie client statistiquement mesurable se comptabilise, tandis qu'une action en justice peu probable relève plutôt de l'information.",
    frequentError: "Confondre provision IFRS et simple réserve de prudence non rattachée à une obligation actuelle.",
    linkedExerciseId: "ex-ias37-comparison",
    sourceReferences: [
      {
        pack: "ifrs-preparation-2027",
        document: "IAS 37 - cas pratiques et comparaison PCG",
        sourceType: "personal-note",
        pageStart: 3,
        pageEnd: 5,
        effectiveDate: "2027-01-01"
      }
    ]
  }
];

export const exercises: Exercise[] = [
  {
    id: "ex-provision-litige",
    domainId: "compta-generale",
    title: "Litige fournisseur à la clôture",
    level: 2,
    estimatedMinutes: 18,
    statement: "Au 31/12, un fournisseur réclame 18 000 EUR. L'avocat estime que la société a 70 % de chances de perdre et propose une fourchette entre 12 000 et 16 000 EUR. Qualifie le traitement comptable et propose l'écriture.",
    expectedAnswer: "Constater une provision si l'obligation est née avant clôture, la sortie probable et l'estimation fiable. Retenir l'estimation la plus pertinente documentée, par exemple 14 000 EUR si c'est la meilleure estimation.",
    rubric: [
      { label: "Qualification obligation/probabilité/estimation", points: 8 },
      { label: "Rattachement à la clôture", points: 4 },
      { label: "Ecriture et justification", points: 6 },
      { label: "Limites et annexe", points: 2 }
    ],
    competencyIds: ["cg-provisions", "cg-cutoff"],
    sourceChunkIds: ["chunk-provision-42", "chunk-pcg-provision"]
  },
  {
    id: "ex-ias37-comparison",
    domainId: "ifrs-ias",
    title: "Comparer PCG et IAS 37 sur un litige",
    level: 4,
    estimatedMinutes: 25,
    statement: "Rédige une note courte qui compare le traitement d'un litige probable en PCG et selon IAS 37, en indiquant ce qui doit être cité dans la justification.",
    expectedAnswer: "La note doit comparer les critères, le degré de documentation, la meilleure estimation, et le traitement annexe si les critères ne sont pas satisfaits.",
    rubric: [
      { label: "Critères IAS 37", points: 7 },
      { label: "Comparaison PCG", points: 5 },
      { label: "Qualité de la justification", points: 5 },
      { label: "Conclusion opérationnelle", points: 3 }
    ],
    competencyIds: ["ifrs-ias37", "cg-provisions"],
    sourceChunkIds: ["chunk-ias37-3", "chunk-pcg-provision"]
  }
];

export const corrections: Correction[] = [
  {
    id: "corr-provision-litige",
    exerciseId: "ex-provision-litige",
    score: 14,
    rubricScores: [
      {
        criterion: "Qualification obligation/probabilite/estimation",
        maxPoints: 8,
        awardedPoints: 6,
        justification: "La provision est identifiee, mais les trois conditions ne sont pas toutes explicitees."
      },
      {
        criterion: "Rattachement a la cloture",
        maxPoints: 4,
        awardedPoints: 4,
        justification: "Le fait generateur au 31/12 est correctement rattache a l'exercice."
      },
      {
        criterion: "Ecriture et justification",
        maxPoints: 6,
        awardedPoints: 4,
        justification: "L'ecriture est plausible, mais le montant retenu doit etre mieux documente."
      },
      {
        criterion: "Limites et annexe",
        maxPoints: 2,
        awardedPoints: 0,
        justification: "L'information en annexe n'est pas traitee."
      }
    ],
    summary: "La logique de provision est comprise, mais la justification doit mieux isoler l'obligation actuelle et la meilleure estimation.",
    correct: [
      "Le rattachement à la clôture est identifié.",
      "La probabilité de sortie de ressources est bien utilisée.",
      "L'écriture proposée est cohérente avec le traitement attendu."
    ],
    partialPoints: [
      "La meilleure estimation est suggeree, mais la fourchette 12 000-16 000 EUR n'est pas discutee."
    ],
    errors: [
      "La fourchette n'est pas discutée pour justifier le montant retenu.",
      "L'annexe n'est pas mentionnée alors que l'incertitude mérite d'être documentée."
    ],
    remediation: "Refaire un mini-cas en trois colonnes : fait générateur, preuve disponible, conséquence comptable.",
    sourceReferences: [
      {
        pack: "cours-master-2025",
        document: "Clôture comptable et régularisations",
        sourceType: "course",
        pageStart: 42,
        pageEnd: 44,
        effectiveDate: "2025-09-01"
      }
    ],
    calculationErrors: [],
    accountingTreatmentErrors: [
      "L'annexe n'est pas mentionnee alors que l'incertitude doit etre documentee."
    ],
    reasoningErrors: [
      "La reponse conclut trop vite sans isoler obligation, probabilite et estimation fiable."
    ],
    sourceQualityIssues: [
      "La justification ne cite pas explicitement le document ou la page utilisee."
    ],
    missingElements: [
      "Discussion de la fourchette d'estimation.",
      "Mention de l'information en annexe."
    ],
    remediationPlan: {
      microLesson: "Reprendre la sequence fait generateur, obligation actuelle, sortie probable, estimation fiable, puis annexe.",
      nextAction: "Refaire la reponse en quatre blocs et justifier le montant retenu dans la fourchette.",
      competencyTags: ["cg-provisions", "cg-cutoff"],
      expectedAnswer: "Constater une provision si l'obligation est nee avant cloture, la sortie probable et l'incertitude.",
      nextExerciseId: "ex-ias37-comparison"
    }
  }
];

export const attempts: Attempt[] = [
  {
    id: "attempt-001",
    exerciseId: "ex-provision-litige",
    userAnswer: "Provisionner le litige car la perte est probable, puis passer une dotation pour 14 000 EUR.",
    score: 14,
    correctionId: "corr-provision-litige",
    createdAt: "2026-05-28T18:20:00.000Z"
  }
];

export const learningPath: LearningPath = {
  id: "path-30-days-foundation",
  name: "Remise à niveau finance métiers - 30 jours",
  durationDays: 30,
  currentDay: 4,
  goal: "Construire un socle logique avant les automatismes de correction et de simulation.",
  days: [
    {
      day: 1,
      title: "Diagnostic compta générale",
      domainId: "compta-generale",
      competencyIds: ["cg-cutoff"],
      lessonId: "lesson-provisions",
      exerciseId: "ex-provision-litige",
      minutes: 45,
      status: "done"
    },
    {
      day: 2,
      title: "Centres d'analyse et unités d'oeuvre",
      domainId: "compta-analytique",
      competencyIds: ["ca-centres"],
      lessonId: "lesson-provisions",
      exerciseId: "ex-provision-litige",
      minutes: 55,
      status: "done"
    },
    {
      day: 3,
      title: "Ecarts prix-volume-mix",
      domainId: "controle-gestion",
      competencyIds: ["cdg-ecarts"],
      lessonId: "lesson-provisions",
      exerciseId: "ex-provision-litige",
      minutes: 50,
      status: "done"
    },
    {
      day: 4,
      title: "Provisions PCG puis IAS 37",
      domainId: "ifrs-ias",
      competencyIds: ["ifrs-ias37", "cg-provisions"],
      lessonId: "lesson-ias37",
      exerciseId: "ex-ias37-comparison",
      minutes: 60,
      status: "today"
    },
    {
      day: 5,
      title: "Constat d'audit ISO",
      domainId: "iso",
      competencyIds: ["iso-audit"],
      lessonId: "lesson-provisions",
      exerciseId: "ex-provision-litige",
      minutes: 40,
      status: "next"
    },
    {
      day: 6,
      title: "Retraitements fiscaux courants",
      domainId: "fiscalite",
      competencyIds: ["fisc-retraitements"],
      lessonId: "lesson-provisions",
      exerciseId: "ex-provision-litige",
      minutes: 45,
      status: "locked"
    }
  ]
};

export const dashboardPriorities: DashboardPriority[] = [
  {
    id: "priority-ifrs18",
    domainId: "ifrs-ias",
    title: "IFRS 18 et présentation de la performance",
    reason: "Niveau actuel faible et impact métier transversal.",
    action: "Lancer une leçon courte puis une note de synthèse."
  },
  {
    id: "priority-provisions",
    domainId: "compta-generale",
    title: "Provisions PCG vs IAS 37",
    reason: "Erreur fréquente sur la qualification avant l'écriture.",
    action: "Refaire un cas guidé avec barème."
  },
  {
    id: "priority-iso",
    domainId: "iso",
    title: "Qualifier un constat d'audit",
    reason: "Compétence utile pour comprendre preuves, risques et actions.",
    action: "Simuler un entretien d'audit interne."
  }
];
