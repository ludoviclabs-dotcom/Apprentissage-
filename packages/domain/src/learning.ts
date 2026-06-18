import type {
  Attempt,
  BusinessCase,
  Concept,
  Correction,
  DashboardPriority,
  DocumentRecord,
  ErrorJournalEntry,
  ExamSession,
  Exercise,
  Flashcard,
  LearningPath,
  LearningModule,
  Lesson,
  RevisionSession,
  SourcePack
} from "./types";
import {
  comptaConcepts,
  comptaExercises,
  comptaFlashcards,
  comptaLearningDays,
  comptaLessons,
  comptaModules,
  comptaSourcePack
} from "./compta-v1";
import { comptaBusinessCase, comptaExamSessions } from "./compta-extra";

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
  },
  comptaSourcePack
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

const provisionCourseSource = {
  pack: "cours-master-2025",
  document: "Cloture comptable et regularisations",
  sourceType: "course" as const,
  pageStart: 42,
  pageEnd: 44,
  effectiveDate: "2025-09-01"
};

const pcgProvisionSource = {
  pack: "pcg-anc-2026",
  document: "Plan comptable general - notes personnelles",
  sourceType: "official-reference" as const,
  effectiveDate: "2026-01-01"
};

const ias37Source = {
  pack: "ifrs-preparation-2027",
  document: "IAS 37 - cas pratiques et comparaison PCG",
  sourceType: "personal-note" as const,
  pageStart: 3,
  pageEnd: 5,
  effectiveDate: "2027-01-01"
};

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
  },
  ...comptaLessons
];

export const learningModules: LearningModule[] = [
  {
    id: "module-compta-provisions",
    title: "Comptabilite generale pilote : provisions, cut-off et IAS 37",
    domainId: "compta-generale",
    tier: "fondations",
    description:
      "Module complet pour comprendre quand un risque devient une provision, comment le rattacher a la cloture et comment justifier l'ecriture.",
    objective:
      "Qualifier une situation de cloture, passer le traitement attendu et expliquer les limites avec sources.",
    prerequisites: ["Debit/credit", "Charges et passifs", "Principe de rattachement"],
    competencyIds: ["cg-provisions", "cg-cutoff", "ifrs-ias37"],
    conceptIds: [
      "concept-obligation-actuelle",
      "concept-sortie-probable",
      "concept-estimation-fiable",
      "concept-cutoff",
      "concept-ecriture-provision",
      "concept-annexe"
    ],
    lessonIds: ["lesson-provisions", "lesson-ias37"],
    exerciseIds: [
      "ex-provision-litige",
      "ex-ias37-comparison",
      "ex-provision-qcm-conditions",
      "ex-provision-calcul-fourchette",
      "ex-cutoff-fait-generateur",
      "ex-ecriture-provision-simple",
      "ex-annexe-incertitude",
      "ex-ias37-passif-eventuel",
      "ex-provision-erreur-frequente",
      "ex-provision-note-synthese",
      "ex-provision-mini-cas-garantie",
      "ex-provision-source-qualite",
      "ex-provision-reprise",
      "ex-provision-interleaving-tva",
      "ex-examen-court-provisions"
    ],
    flashcardIds: [
      "fc-obligation-definition",
      "fc-obligation-diagnostic",
      "fc-sortie-probable-definition",
      "fc-sortie-probable-error",
      "fc-estimation-fiable-definition",
      "fc-estimation-fiable-formula",
      "fc-cutoff-definition",
      "fc-cutoff-diagnostic",
      "fc-ecriture-provision-debit",
      "fc-ecriture-provision-credit",
      "fc-annexe-definition",
      "fc-annexe-error",
      "fc-ias37-criteria",
      "fc-ias37-passif-eventuel",
      "fc-pcg-vs-ias37",
      "fc-fourchette-best-estimate",
      "fc-litige-fait-generateur",
      "fc-garantie-diagnostic",
      "fc-source-course-reference",
      "fc-source-official-reference",
      "fc-error-debt-provision",
      "fc-error-risk-provision",
      "fc-justification-four-blocks",
      "fc-mini-case-triage"
    ],
    estimatedMinutes: 360,
    status: "in-progress",
    progress: 42,
    nextAction: "Terminer la revision due puis traiter le mini-cas garantie client."
  },
  {
    id: "module-business-case-lab",
    title: "Business Case Lab avance : audit P2P et controle interne",
    domainId: "controle-gestion",
    tier: "maitrise",
    description:
      "Espace avance pour transformer les acquis en diagnostic documente sur fraude fournisseur, audit et controle interne.",
    objective: "Produire une note de synthese argumentee a partir d'un dossier multi-documents.",
    prerequisites: ["Module provisions pilote", "Justification sourcee", "Lecture d'un dossier"],
    competencyIds: ["cdg-ecarts", "iso-audit", "fin-diagnostic"],
    conceptIds: [],
    lessonIds: [],
    exerciseIds: [],
    flashcardIds: [],
    estimatedMinutes: 180,
    status: "not-started",
    progress: 0,
    nextAction: "Debloquer apres validation des fondations comptables."
  },
  ...comptaModules
];

export const concepts: Concept[] = [
  {
    id: "concept-obligation-actuelle",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Obligation actuelle",
    shortDefinition: "Evenement passe qui cree une responsabilite presente envers un tiers.",
    frequentTrap: "Confondre risque vague et obligation deja nee.",
    miniExample: "Un litige ne avant la cloture peut creer une obligation actuelle si les faits sont documentes.",
    competencyIds: ["cg-provisions"],
    status: "in-progress",
    strength: 56,
    sourceReferences: [provisionCourseSource, pcgProvisionSource]
  },
  {
    id: "concept-sortie-probable",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Sortie probable de ressources",
    shortDefinition: "Probabilite suffisante que l'entreprise devra payer ou abandonner un avantage economique.",
    frequentTrap: "Provisionner une possibilite faible par simple prudence.",
    miniExample: "Un avis d'avocat defavorable a 70 % soutient la probabilite de sortie.",
    competencyIds: ["cg-provisions"],
    status: "fragile",
    strength: 44,
    sourceReferences: [provisionCourseSource, pcgProvisionSource]
  },
  {
    id: "concept-estimation-fiable",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Estimation fiable",
    shortDefinition: "Montant documente par une methode, une fourchette ou une meilleure estimation.",
    formula: "Meilleure estimation = montant le plus probable ou point central justifie de la fourchette.",
    frequentTrap: "Reprendre le montant reclame sans discuter la fourchette disponible.",
    miniExample: "Entre 12 000 et 16 000 EUR, 14 000 EUR peut etre retenu si c'est le point le mieux justifie.",
    competencyIds: ["cg-provisions"],
    status: "fragile",
    strength: 45,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "concept-cutoff",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Cut-off de cloture",
    shortDefinition: "Rattacher la charge ou le risque a la periode ou le fait generateur existe.",
    frequentTrap: "Raisonner a partir de la date de paiement au lieu de la date du fait generateur.",
    miniExample: "Un litige ne avant le 31/12 appartient a l'exercice meme si le jugement arrive apres.",
    competencyIds: ["cg-cutoff"],
    status: "in-progress",
    strength: 68,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "concept-ecriture-provision",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Ecriture de provision",
    shortDefinition: "Constater une dotation en charge et une provision au passif.",
    formula: "Debit dotation / Credit provision pour risques et charges.",
    frequentTrap: "Crediter directement une dette certaine quand l'incertitude demeure.",
    miniExample: "Debit dotation 14 000 EUR, credit provision 14 000 EUR.",
    competencyIds: ["cg-provisions"],
    status: "in-progress",
    strength: 53,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "concept-annexe",
    moduleId: "module-compta-provisions",
    domainId: "compta-generale",
    title: "Information en annexe",
    shortDefinition: "Mentionner l'incertitude, les hypotheses ou le passif eventuel quand le lecteur doit comprendre le risque.",
    frequentTrap: "S'arreter a l'ecriture sans expliquer l'incertitude restante.",
    miniExample: "Une fourchette significative peut justifier une information sur l'incertitude.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "fragile",
    strength: 38,
    sourceReferences: [provisionCourseSource, ias37Source]
  },
  ...comptaConcepts
];

export const exercises: Exercise[] = [
  {
    id: "ex-provision-litige",
    domainId: "compta-generale",
    type: "mini-case",
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
    type: "justification",
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
  },
  {
    id: "ex-provision-qcm-conditions",
    domainId: "compta-generale",
    type: "qcm",
    title: "Identifier les trois conditions",
    level: 1,
    estimatedMinutes: 8,
    statement:
      "Coche mentalement les trois conditions a verifier avant de constater une provision : obligation actuelle, sortie probable, estimation fiable, paiement deja effectue.",
    expectedAnswer:
      "Les trois conditions utiles sont obligation actuelle, sortie probable de ressources et estimation fiable. Le paiement deja effectue n'est pas une condition de provision.",
    rubric: [
      { label: "Obligation actuelle", points: 6 },
      { label: "Sortie probable", points: 6 },
      { label: "Estimation fiable", points: 6 },
      { label: "Exclusion du paiement", points: 2 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-provision-calcul-fourchette",
    domainId: "compta-generale",
    type: "calculation",
    title: "Choisir une estimation dans une fourchette",
    level: 2,
    estimatedMinutes: 10,
    statement:
      "Une fourchette documentee donne 12 000 a 16 000 EUR, sans scenario plus probable. Propose une estimation et justifie-la.",
    expectedAnswer:
      "Retenir une estimation centrale de 14 000 EUR si aucun point de la fourchette n'est plus probable, en expliquant que le montant reclame seul ne suffit pas.",
    rubric: [
      { label: "Calcul du point central", points: 7 },
      { label: "Justification de la meilleure estimation", points: 8 },
      { label: "Limite du montant reclame", points: 5 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-cutoff-fait-generateur",
    domainId: "compta-generale",
    type: "short-answer",
    title: "Rattacher le fait generateur",
    level: 2,
    estimatedMinutes: 12,
    statement:
      "Le courrier de reclamation arrive le 5 janvier, mais le litige porte sur une livraison de decembre. Explique le rattachement.",
    expectedAnswer:
      "Le fait generateur est lie a la livraison ou au conflit ne avant la cloture ; la date du courrier ne suffit pas a decaler le rattachement.",
    rubric: [
      { label: "Identification du fait generateur", points: 8 },
      { label: "Lien avec la cloture", points: 7 },
      { label: "Conclusion claire", points: 5 }
    ],
    competencyIds: ["cg-cutoff", "cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-ecriture-provision-simple",
    domainId: "compta-generale",
    type: "journal-entry",
    title: "Passer l'ecriture de provision",
    level: 2,
    estimatedMinutes: 12,
    statement:
      "La meilleure estimation du litige est 14 000 EUR. Propose l'ecriture et precise le sens debit/credit.",
    expectedAnswer:
      "Debiter une dotation aux provisions pour 14 000 EUR et crediter une provision pour risques et charges pour 14 000 EUR.",
    rubric: [
      { label: "Debit dotation", points: 7 },
      { label: "Credit provision", points: 7 },
      { label: "Montant coherent", points: 4 },
      { label: "Libelle clair", points: 2 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-annexe-incertitude",
    domainId: "compta-generale",
    type: "justification",
    title: "Decider quoi dire en annexe",
    level: 3,
    estimatedMinutes: 14,
    statement:
      "La provision est comptabilisee, mais la fourchette d'estimation reste large. Redige deux phrases d'annexe.",
    expectedAnswer:
      "Indiquer la nature du litige, l'incertitude d'evaluation et les hypotheses retenues, sans melanger cours et reference officielle.",
    rubric: [
      { label: "Nature du risque", points: 5 },
      { label: "Incertitude", points: 6 },
      { label: "Hypotheses retenues", points: 6 },
      { label: "Formulation sourcee", points: 3 }
    ],
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    sourceChunkIds: ["chunk-provision-42", "chunk-ias37-3"]
  },
  {
    id: "ex-ias37-passif-eventuel",
    domainId: "ifrs-ias",
    type: "short-answer",
    title: "Provision ou passif eventuel",
    level: 4,
    estimatedMinutes: 15,
    statement:
      "Selon les notes IAS 37, un litige est possible mais non probable. Explique le traitement attendu.",
    expectedAnswer:
      "Ne pas comptabiliser de provision si la sortie n'est pas probable ; envisager une information en annexe comme passif eventuel si l'information est significative.",
    rubric: [
      { label: "Absence de provision", points: 7 },
      { label: "Passif eventuel", points: 7 },
      { label: "Importance de l'information", points: 4 },
      { label: "Source IAS 37", points: 2 }
    ],
    competencyIds: ["ifrs-ias37", "cg-provisions"],
    sourceChunkIds: ["chunk-ias37-3"]
  },
  {
    id: "ex-provision-erreur-frequente",
    domainId: "compta-generale",
    type: "short-answer",
    title: "Corriger une mauvaise reponse",
    level: 2,
    estimatedMinutes: 10,
    statement:
      "Un apprenant ecrit : 'Il y a un risque donc on provisionne toujours le montant reclame'. Corrige cette phrase.",
    expectedAnswer:
      "Il faut verifier obligation actuelle, sortie probable et estimation fiable ; le montant reclame doit etre discute avec les preuves disponibles.",
    rubric: [
      { label: "Refus de l'automatisme", points: 5 },
      { label: "Trois conditions", points: 9 },
      { label: "Montant justifie", points: 6 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-provision-note-synthese",
    domainId: "compta-generale",
    type: "justification",
    title: "Note de synthese sourcee",
    level: 3,
    estimatedMinutes: 20,
    statement:
      "Redige une note courte en quatre blocs : faits, regle, traitement, conclusion sourcee.",
    expectedAnswer:
      "La note doit separer les faits, citer la regle, appliquer le traitement et conclure avec pack, document, page et date lorsque disponibles.",
    rubric: [
      { label: "Faits", points: 4 },
      { label: "Regle", points: 5 },
      { label: "Traitement", points: 6 },
      { label: "Conclusion sourcee", points: 5 }
    ],
    competencyIds: ["cg-provisions", "cg-cutoff"],
    sourceChunkIds: ["chunk-provision-42", "chunk-pcg-provision"]
  },
  {
    id: "ex-provision-mini-cas-garantie",
    domainId: "compta-generale",
    type: "mini-case",
    title: "Garantie client statistique",
    level: 3,
    estimatedMinutes: 22,
    statement:
      "Une entreprise vend des produits avec garantie. Les retours historiques rendent le cout probable et mesurable. Qualifie le traitement.",
    expectedAnswer:
      "Une provision peut etre comptabilisee si l'obligation de garantie existe, la sortie est probable et le cout est estimable a partir des statistiques.",
    rubric: [
      { label: "Obligation de garantie", points: 6 },
      { label: "Probabilite statistique", points: 5 },
      { label: "Estimation fiable", points: 5 },
      { label: "Conclusion operationnelle", points: 4 }
    ],
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    sourceChunkIds: ["chunk-ias37-3"]
  },
  {
    id: "ex-provision-source-qualite",
    domainId: "compta-generale",
    type: "justification",
    title: "Distinguer cours et reference",
    level: 2,
    estimatedMinutes: 10,
    statement:
      "Explique pourquoi une reponse doit dire si elle s'appuie sur un cours ou une reference officielle.",
    expectedAnswer:
      "Le cours aide a comprendre, la reference officielle fonde la regle ; les melanger sans le dire fragilise la justification.",
    rubric: [
      { label: "Role du cours", points: 5 },
      { label: "Role de la reference officielle", points: 7 },
      { label: "Risque de melange", points: 5 },
      { label: "Citation complete", points: 3 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-pcg-provision"]
  },
  {
    id: "ex-provision-reprise",
    domainId: "compta-generale",
    type: "journal-entry",
    title: "Reprise de provision",
    level: 3,
    estimatedMinutes: 14,
    statement:
      "Le risque provisionne a 14 000 EUR est finalement regle pour 10 000 EUR. Indique la logique de reprise.",
    expectedAnswer:
      "Utiliser la provision pour couvrir le risque realise et reprendre l'excedent non utilise, en separant reglement et reprise.",
    rubric: [
      { label: "Utilisation de la provision", points: 7 },
      { label: "Reprise de l'excedent", points: 7 },
      { label: "Separation des flux", points: 4 },
      { label: "Justification", points: 2 }
    ],
    competencyIds: ["cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-provision-interleaving-tva",
    domainId: "fiscalite",
    type: "mini-case",
    title: "Ne pas confondre provision et TVA",
    level: 2,
    estimatedMinutes: 12,
    statement:
      "Un cas melange une facture avec TVA et un litige probable. Dis ce qui releve de la TVA et ce qui releve de la provision.",
    expectedAnswer:
      "La TVA suit la facture et les regles fiscales ; la provision suit le risque probable, l'obligation et l'estimation fiable.",
    rubric: [
      { label: "Separation TVA", points: 6 },
      { label: "Separation provision", points: 8 },
      { label: "Choix de methode", points: 4 },
      { label: "Conclusion", points: 2 }
    ],
    competencyIds: ["fisc-retraitements", "cg-provisions"],
    sourceChunkIds: ["chunk-provision-42"]
  },
  {
    id: "ex-examen-court-provisions",
    domainId: "compta-generale",
    type: "mini-case",
    title: "Examen court provisions et annexe",
    level: 4,
    estimatedMinutes: 30,
    statement:
      "Traite un dossier court : litige avant cloture, avis juridique defavorable, fourchette d'estimation et incertitude annexe.",
    expectedAnswer:
      "La copie doit qualifier les conditions, rattacher a la cloture, choisir une estimation, proposer l'ecriture et mentionner l'annexe.",
    rubric: [
      { label: "Qualification", points: 5 },
      { label: "Rattachement", points: 4 },
      { label: "Estimation", points: 4 },
      { label: "Ecriture", points: 4 },
      { label: "Annexe", points: 3 }
    ],
    competencyIds: ["cg-provisions", "cg-cutoff", "ifrs-ias37"],
    sourceChunkIds: ["chunk-provision-42", "chunk-ias37-3"]
  },
  ...comptaExercises
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

export const flashcards: Flashcard[] = [
  {
    id: "fc-obligation-definition",
    moduleId: "module-compta-provisions",
    conceptId: "concept-obligation-actuelle",
    domainId: "compta-generale",
    type: "concept",
    front: "Qu'est-ce qu'une obligation actuelle ?",
    back: "Un evenement passe cree une responsabilite presente envers un tiers.",
    explanation: "La provision ne part pas d'une peur vague : elle part d'un fait deja ne.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource, pcgProvisionSource]
  },
  {
    id: "fc-obligation-diagnostic",
    moduleId: "module-compta-provisions",
    conceptId: "concept-obligation-actuelle",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Un litige ne apres la cloture cree-t-il une provision de l'exercice ?",
    back: "Non, sauf si le fait generateur existait deja avant la cloture.",
    explanation: "La date du fait generateur prime sur la date a laquelle l'information devient confortable.",
    competencyIds: ["cg-cutoff", "cg-provisions"],
    status: "learning",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-sortie-probable-definition",
    moduleId: "module-compta-provisions",
    conceptId: "concept-sortie-probable",
    domainId: "compta-generale",
    type: "concept",
    front: "Que signifie sortie probable de ressources ?",
    back: "Il est suffisamment probable que l'entreprise devra payer ou abandonner un avantage economique.",
    explanation: "La probabilite se documente avec les faits disponibles : avis juridique, statistiques, historique.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-sortie-probable-error",
    moduleId: "module-compta-provisions",
    conceptId: "concept-sortie-probable",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Pourquoi 'il y a un risque donc on provisionne' est faux ?",
    back: "Parce qu'il faut une sortie probable, pas seulement possible.",
    explanation: "Une simple eventualite peut relever de l'annexe plutot que de la comptabilisation.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource, ias37Source]
  },
  {
    id: "fc-estimation-fiable-definition",
    moduleId: "module-compta-provisions",
    conceptId: "concept-estimation-fiable",
    domainId: "compta-generale",
    type: "concept",
    front: "Qu'est-ce qu'une estimation fiable ?",
    back: "Un montant documente par une methode, une fourchette ou une meilleure estimation.",
    explanation: "La reponse doit dire pourquoi ce montant, pas seulement recopier le chiffre le plus visible.",
    competencyIds: ["cg-provisions"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-estimation-fiable-formula",
    moduleId: "module-compta-provisions",
    conceptId: "concept-estimation-fiable",
    domainId: "compta-generale",
    type: "formula",
    front: "Fourchette 12 000-16 000 EUR sans scenario plus probable : quelle estimation ?",
    back: "14 000 EUR peut etre retenu comme point central justifie.",
    explanation: "Le point central n'est pas automatique dans tous les cas, mais il est defensible ici faute de scenario dominant.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-cutoff-definition",
    moduleId: "module-compta-provisions",
    conceptId: "concept-cutoff",
    domainId: "compta-generale",
    type: "concept",
    front: "A quoi sert le cut-off ?",
    back: "A rattacher la charge, le produit ou le risque a la bonne periode.",
    explanation: "Le cut-off evite de raisonner uniquement avec la date de paiement.",
    competencyIds: ["cg-cutoff"],
    status: "mastered",
    dueAt: "2026-06-24T08:00:00.000Z",
    intervalDays: 7,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-cutoff-diagnostic",
    moduleId: "module-compta-provisions",
    conceptId: "concept-cutoff",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Courrier en janvier, livraison contestee en decembre : quel rattachement ?",
    back: "Rattachement a decembre si le fait generateur existe avant la cloture.",
    explanation: "La date du courrier peut confirmer une situation deja nee.",
    competencyIds: ["cg-cutoff"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-ecriture-provision-debit",
    moduleId: "module-compta-provisions",
    conceptId: "concept-ecriture-provision",
    domainId: "compta-generale",
    type: "journal-entry",
    front: "Dans une provision, que debite-t-on ?",
    back: "Une dotation aux provisions.",
    explanation: "La charge traduit l'impact de l'exercice.",
    competencyIds: ["cg-provisions"],
    status: "new",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 0,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-ecriture-provision-credit",
    moduleId: "module-compta-provisions",
    conceptId: "concept-ecriture-provision",
    domainId: "compta-generale",
    type: "journal-entry",
    front: "Dans une provision, que credite-t-on ?",
    back: "Une provision pour risques et charges.",
    explanation: "Le passif porte l'incertitude restant a denouer.",
    competencyIds: ["cg-provisions"],
    status: "new",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 0,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-annexe-definition",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "compta-generale",
    type: "concept",
    front: "Quand l'annexe devient-elle utile pour une provision ?",
    back: "Quand l'incertitude ou les hypotheses doivent etre comprises par le lecteur.",
    explanation: "L'annexe complete la comptabilisation lorsque le risque reste significatif.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource, ias37Source]
  },
  {
    id: "fc-annexe-error",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Quelle erreur fait-on si on s'arrete a l'ecriture ?",
    back: "On oublie d'expliquer l'incertitude restante et les hypotheses d'estimation.",
    explanation: "Une bonne correction separe traitement comptable et information utile.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [provisionCourseSource, ias37Source]
  },
  {
    id: "fc-ias37-criteria",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "ifrs-ias",
    type: "concept",
    front: "Quels sont les criteres IAS 37 de provision ?",
    back: "Obligation actuelle, sortie probable de ressources, estimation fiable.",
    explanation: "La comparaison PCG/IAS 37 doit citer ces criteres au lieu de conclure par prudence seule.",
    competencyIds: ["ifrs-ias37"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [ias37Source]
  },
  {
    id: "fc-ias37-passif-eventuel",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "ifrs-ias",
    type: "diagnostic",
    front: "Sortie possible mais non probable : provision ou passif eventuel ?",
    back: "Pas de provision ; information en annexe si significative.",
    explanation: "Le seuil de probabilite change le traitement.",
    competencyIds: ["ifrs-ias37"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [ias37Source]
  },
  {
    id: "fc-pcg-vs-ias37",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "ifrs-ias",
    type: "concept",
    front: "Pourquoi ne pas dire PCG et IAS 37 sont identiques ?",
    back: "La logique peut etre proche, mais IAS 37 exige une justification explicite des criteres.",
    explanation: "La bonne reponse compare sans ecraser les differences de documentation.",
    competencyIds: ["ifrs-ias37"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [ias37Source, pcgProvisionSource]
  },
  {
    id: "fc-fourchette-best-estimate",
    moduleId: "module-compta-provisions",
    conceptId: "concept-estimation-fiable",
    domainId: "compta-generale",
    type: "formula",
    front: "Pourquoi discuter une fourchette d'estimation ?",
    back: "Parce que le montant retenu doit etre la meilleure estimation documentee.",
    explanation: "La fourchette evite de reprendre automatiquement le montant reclame.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-litige-fait-generateur",
    moduleId: "module-compta-provisions",
    conceptId: "concept-cutoff",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Quel est le premier reflexe sur un litige de cloture ?",
    back: "Identifier le fait generateur avant de choisir le compte.",
    explanation: "Le compte vient apres la qualification.",
    competencyIds: ["cg-cutoff", "cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-garantie-diagnostic",
    moduleId: "module-compta-provisions",
    conceptId: "concept-sortie-probable",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Garantie client statistiquement mesurable : quelle logique ?",
    back: "Provision si obligation de garantie, sortie probable et cout estimable.",
    explanation: "Les statistiques peuvent soutenir l'estimation fiable.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "new",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 0,
    sourceReferences: [ias37Source]
  },
  {
    id: "fc-source-course-reference",
    moduleId: "module-compta-provisions",
    conceptId: "concept-obligation-actuelle",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Pourquoi citer un cours comme cours ?",
    back: "Parce qu'il explique la methode sans etre forcement la source officielle de la regle.",
    explanation: "Le produit doit signaler la nature de la source.",
    competencyIds: ["cg-provisions"],
    status: "mastered",
    dueAt: "2026-06-24T08:00:00.000Z",
    intervalDays: 7,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-source-official-reference",
    moduleId: "module-compta-provisions",
    conceptId: "concept-obligation-actuelle",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Pourquoi isoler la reference officielle ?",
    back: "Parce qu'elle fonde la regle et ne doit pas etre melangee silencieusement au cours.",
    explanation: "C'est une contrainte centrale du hub.",
    competencyIds: ["cg-provisions"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [pcgProvisionSource]
  },
  {
    id: "fc-error-debt-provision",
    moduleId: "module-compta-provisions",
    conceptId: "concept-ecriture-provision",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Dette certaine ou provision : que verifier ?",
    back: "La presence d'incertitude sur l'echeance ou le montant.",
    explanation: "Une dette certaine n'a pas la meme logique qu'un risque estime.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-error-risk-provision",
    moduleId: "module-compta-provisions",
    conceptId: "concept-sortie-probable",
    domainId: "compta-generale",
    type: "frequent-error",
    front: "Pourquoi un risque vague ne suffit-il pas ?",
    back: "Il manque la probabilite documentee et parfois l'obligation actuelle.",
    explanation: "La prudence n'autorise pas une provision automatique.",
    competencyIds: ["cg-provisions"],
    status: "due",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 1,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-justification-four-blocks",
    moduleId: "module-compta-provisions",
    conceptId: "concept-obligation-actuelle",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Quels sont les quatre blocs d'une bonne justification ?",
    back: "Faits, regle, traitement, conclusion sourcee.",
    explanation: "Cette structure rend la correction actionnable.",
    competencyIds: ["cg-provisions", "cg-cutoff"],
    status: "new",
    dueAt: "2026-06-17T08:00:00.000Z",
    intervalDays: 0,
    sourceReferences: [provisionCourseSource]
  },
  {
    id: "fc-mini-case-triage",
    moduleId: "module-compta-provisions",
    conceptId: "concept-annexe",
    domainId: "compta-generale",
    type: "diagnostic",
    front: "Mini-cas : obligation oui, probable non. Que faire ?",
    back: "Ne pas provisionner ; envisager une information si le risque est significatif.",
    explanation: "C'est le tri provision / information / absence de traitement.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    status: "learning",
    dueAt: "2026-06-18T08:00:00.000Z",
    intervalDays: 3,
    sourceReferences: [ias37Source]
  },
  ...comptaFlashcards
];

export const revisionSession: RevisionSession = {
  id: "revision-2026-06-17",
  generatedAt: "2026-06-17T08:00:00.000Z",
  dueCount: flashcards.filter((card) => card.status === "due").length,
  newCount: flashcards.filter((card) => card.status === "new").length,
  fragileCount: flashcards.filter((card) => card.status === "learning").length,
  masteredCount: flashcards.filter((card) => card.status === "mastered").length,
  cards: flashcards.filter((card) => card.status !== "mastered").slice(0, 12)
};

export const errorJournalEntries: ErrorJournalEntry[] = [
  {
    id: "err-journal-annexe",
    exerciseId: "ex-provision-litige",
    correctionId: "corr-provision-litige",
    category: "accounting-treatment",
    summary: "L'annexe n'est pas mentionnee alors que l'incertitude doit etre documentee.",
    competencyIds: ["cg-provisions", "ifrs-ias37"],
    nextAction: "Reprendre les cartes annexe puis refaire un mini-cas avec fourchette.",
    createdAt: "2026-05-28T18:22:00.000Z"
  },
  {
    id: "err-journal-source",
    exerciseId: "ex-provision-litige",
    correctionId: "corr-provision-litige",
    category: "source-quality",
    summary: "La reponse ne cite pas explicitement document, page, pack et date.",
    competencyIds: ["cg-provisions"],
    nextAction: "Reecrire la conclusion en citant la source complete.",
    createdAt: "2026-05-28T18:22:00.000Z"
  }
];

export const examSessions: ExamSession[] = [
  ...comptaExamSessions,
  {
    id: "exam-provisions-quick",
    title: "Examen court - provisions, cut-off et annexe",
    exerciseIds: [
      "ex-provision-qcm-conditions",
      "ex-provision-calcul-fourchette",
      "ex-ecriture-provision-simple",
      "ex-annexe-incertitude",
      "ex-examen-court-provisions"
    ],
    durationMinutes: 45,
    status: "draft"
  }
];

export const businessCases: BusinessCase[] = [
  {
    id: "bc-p2p-fraud-lab",
    title: "Audit P2P avance : fournisseur atypique et controle interne",
    domainId: "controle-gestion",
    level: 5,
    status: "locked",
    description:
      "Cas avance inspire du demonstrateur P2P Fraud Detective, replace comme laboratoire de fin de parcours.",
    dossier:
      "Un fournisseur concentre plusieurs signaux : creation recente, paiement rapide, rapprochement incomplet et justification metier fragile. L'objectif est de produire une note de diagnostic sans oublier les preuves.",
    documents: [
      {
        id: "bc-doc-invoice",
        title: "Extrait factures et paiements",
        summary: "Liste synthetique des factures, dates de validation, montants et delais de paiement.",
        sourceReferences: [
          {
            pack: "cours-master-2025",
            document: "Cas audit P2P - support de formation",
            sourceType: "exercise",
            pageStart: 1,
            pageEnd: 2,
            effectiveDate: "2025-09-01"
          }
        ]
      },
      {
        id: "bc-doc-controls",
        title: "Matrice de controle interne",
        summary: "Controles attendus sur creation fournisseur, rapprochement commande-facture et validation.",
        sourceReferences: [
          {
            pack: "iso-notes-personnelles",
            document: "Audit interne - constats et actions correctives",
            sourceType: "personal-note",
            pageStart: 4,
            pageEnd: 6,
            effectiveDate: "2026-05-01"
          }
        ]
      }
    ],
    questions: [
      {
        id: "bc-q-risk",
        prompt: "Identifier les trois signaux de risque les plus forts.",
        competencyIds: ["iso-audit", "fin-diagnostic"],
        expectedPoints: ["creation fournisseur", "paiement rapide", "rapprochement incomplet"]
      },
      {
        id: "bc-q-proof",
        prompt: "Relier chaque signal a une preuve documentaire.",
        competencyIds: ["iso-audit"],
        expectedPoints: ["facture", "validation", "matrice de controle"]
      },
      {
        id: "bc-q-action",
        prompt: "Proposer une decision et une action corrective.",
        competencyIds: ["cdg-ecarts", "iso-actions"],
        expectedPoints: ["suspendre ou revoir", "responsable", "echeance", "preuve attendue"]
      }
    ],
    expectedDeliverable: "Note de synthese de 12 a 20 lignes : risque, preuves, decision, action corrective.",
    competencyIds: ["iso-audit", "iso-actions", "fin-diagnostic"],
    sourceReferences: [
      {
        pack: "cours-master-2025",
        document: "Cas audit P2P - support de formation",
        sourceType: "exercise",
        pageStart: 1,
        pageEnd: 2,
        effectiveDate: "2025-09-01"
      }
    ]
  },
  comptaBusinessCase
];

export const learningPath: LearningPath = {
  id: "path-30-days-foundation",
  name: "Remise à niveau Comptabilité & pilotage - 30 jours",
  durationDays: 30,
  currentDay: 3,
  goal: "Construire le socle comptable (opérations, clôture, financement) puis le pilotage de la performance, à partir du corpus Master CCA.",
  days: comptaLearningDays
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
