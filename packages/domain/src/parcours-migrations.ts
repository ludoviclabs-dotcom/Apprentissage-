import type { AuthoredExerciseVersion } from "./exercise-specs";

/**
 * Migration des exercices « essentiels du parcours » encore notés par le
 * rubric matcher.
 *
 * Les dix exercices du parcours de 30 jours (six de comptabilité générale,
 * quatre d'analytique) étaient les derniers items du chemin principal à passer
 * par `legacy_rubric`. Chacun reçoit ici une spécification typée dont la valeur
 * attendue est EXTRAITE DU CORRIGÉ EXISTANT — jamais recalculée de tête, jamais
 * inventée. Quand l'énoncé demandait plusieurs livrables, la partie notée est
 * désormais désignée par une phrase « Réponse notée : … » ajoutée à l'énoncé ;
 * le reste du travail demandé garde sa correction dans `expectedAnswer`.
 */

export const parcoursMigratedVersions: AuthoredExerciseVersion[] = [
  {
    id: "exv-operations-courantes-1-1",
    exerciseId: "ex-operations-courantes-1",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Opérations à immobiliser (classe 2)",
      options: [
        { id: "vehicule", label: "1) Acquisition d'un véhicule de livraison" },
        {
          id: "essence",
          label: "2) Achat d'essence pour le véhicule",
          rationale: "Consommable détruit au premier usage : charge (606)."
        },
        {
          id: "casques",
          label: "3) Achat de 500 casques destinés à la revente",
          rationale: "Destinés à la revente dans le cycle normal : marchandises (607), jamais immobilisées."
        },
        { id: "entrepot", label: "4) Construction d'un entrepôt de stockage" },
        {
          id: "photocopieur",
          label: "5) Location d'un photocopieur",
          rationale: "Bien loué, non contrôlé : loyer en charge (613)."
        },
        { id: "ordinateur", label: "6) Achat d'un ordinateur pour la comptabilité" }
      ],
      correctOptionIds: ["vehicule", "entrepot", "ordinateur"]
    },
    testCases: [
      {
        name: "les-trois-immobilisations",
        submission: { kind: "choice", selectedOptionIds: ["vehicule", "entrepot", "ordinateur"] },
        expectedScore: 20
      },
      {
        // Les casques retenus : la destination (revente) est ignorée.
        name: "immobilise-les-casques",
        submission: {
          kind: "choice",
          selectedOptionIds: ["vehicule", "entrepot", "ordinateur", "casques"]
        },
        expectedScore: 13.33
      },
      {
        name: "coche-tout",
        submission: {
          kind: "choice",
          selectedOptionIds: ["vehicule", "essence", "casques", "entrepot", "photocopieur", "ordinateur"]
        },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-constitution-entreprises-1-1",
    exerciseId: "ex-constitution-entreprises-1",
    version: 1,
    evaluationType: "numeric",
    spec: {
      // Corrigé existant : nature libérée à 100 % (70 000) + numéraire libéré du
      // minimum légal SA (30 000 × 1/2 = 15 000) = 85 000.
      expected: 85000,
      toleranceAbs: 0.01,
      unit: "EUR",
      label: "Total appelé et versé à la constitution"
    },
    testCases: [
      { name: "valeur-exacte", submission: { kind: "numeric", value: 85000 }, expectedScore: 20 },
      {
        // Minimum légal appliqué à tort aux apports en nature.
        name: "minimum-sur-tout",
        submission: { kind: "numeric", value: 50000 },
        expectedScore: 0
      },
      {
        // Tout le capital supposé versé.
        name: "capital-total",
        submission: { kind: "numeric", value: 100000 },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-travaux-cloture-1-1",
    exerciseId: "ex-travaux-cloture-1",
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      // Corrigé existant : annulation SI 6 800, constatation SF 5 420, reprise
      // de dépréciation 1 235 − 950 = 285 (391 → 78173).
      expectedLines: [
        { account: "6031", debit: 6800, label: "Variation des stocks de MP — annulation du stock initial" },
        { account: "310", credit: 6800, label: "Stocks de matières premières — annulation", alsoAccept: ["31"] },
        { account: "310", debit: 5420, label: "Stocks de matières premières — constatation", alsoAccept: ["31"] },
        { account: "6031", credit: 5420, label: "Variation des stocks de MP — constatation" },
        { account: "391", debit: 285, label: "Dépréciations des stocks de MP (reprise)" },
        { account: "78173", credit: 285, label: "Reprises sur dépréciations des stocks" }
      ],
      amountToleranceAbs: 0,
      allowExtraLines: false,
      points: { accounts: 4, direction: 3, amounts: 4, balance: 2 }
    },
    testCases: [
      {
        name: "ecritures-exactes",
        submission: {
          kind: "journal",
          lines: [
            { account: "6031", debit: 6800 },
            { account: "310", credit: 6800 },
            { account: "310", debit: 5420 },
            { account: "6031", credit: 5420 },
            { account: "391", debit: 285 },
            { account: "78173", credit: 285 }
          ]
        },
        expectedScore: 20
      },
      {
        // Dotation complémentaire au lieu d'une reprise : le sens de
        // l'ajustement est inversé.
        name: "dotation-au-lieu-de-reprise",
        submission: {
          kind: "journal",
          lines: [
            { account: "6031", debit: 6800 },
            { account: "310", credit: 6800 },
            { account: "310", debit: 5420 },
            { account: "6031", credit: 5420 },
            { account: "391", credit: 285 },
            { account: "78173", debit: 285 }
          ]
        },
        expectedScore: 16.42,
        expectedOutcomes: { direction: "partial" }
      },
      {
        // Variation passée « en net » : les flux disparaissent.
        name: "variation-en-net",
        submission: {
          kind: "journal",
          lines: [
            { account: "6031", debit: 1380 },
            { account: "310", credit: 1380 },
            { account: "391", debit: 285 },
            { account: "78173", credit: 285 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { amounts: "partial" }
      }
    ]
  },
  {
    id: "exv-titres-1-1",
    exerciseId: "ex-titres-1",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Affectations exactes des titres",
      options: [
        { id: "a-261", label: "A) Actions Morin (15 % du capital, détention durable) → 261 Titres de participation" },
        {
          id: "a-503",
          label: "A) Actions Morin → 503 Actions (VMP)",
          rationale: "15 % du capital détenu durablement : l'influence est présumée, c'est une participation (261)."
        },
        { id: "b-273", label: "B) Actions « Chez Gigi » (6 %, durable, sans gestion) → 273 TIAP" },
        {
          id: "b-261",
          label: "B) Actions « Chez Gigi » → 261 Titres de participation",
          rationale: "6 % sans intervention dans la gestion : pas de participation présumée, TIAP (273)."
        },
        { id: "c-503", label: "C) Actions Jérôme (but spéculatif) → 503 Actions (VMP)" },
        { id: "d-273", label: "D) Obligations Gilbert (durables, pour le rendement) → 273 TIAP" },
        {
          id: "d-506",
          label: "D) Obligations Gilbert → 506 Obligations (VMP)",
          rationale: "Le 506 vaudrait pour des obligations spéculatives ; une détention durable pour le rendement va en TIAP."
        }
      ],
      correctOptionIds: ["a-261", "b-273", "c-503", "d-273"]
    },
    testCases: [
      {
        name: "les-quatre-affectations",
        submission: { kind: "choice", selectedOptionIds: ["a-261", "b-273", "c-503", "d-273"] },
        expectedScore: 20
      },
      {
        // Les obligations classées en VMP : l'intention de détention est ignorée.
        name: "obligations-en-vmp",
        submission: { kind: "choice", selectedOptionIds: ["a-261", "b-273", "c-503", "d-506"] },
        expectedScore: 8.33
      }
    ]
  },
  {
    id: "exv-emprunts-obligataires-1-1",
    exerciseId: "ex-emprunts-obligataires-1",
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      // Corrigé existant : 4671 pour 7 968 000, 169 pour 80 000, 163 pour
      // 8 048 000 (prix de remboursement).
      expectedLines: [
        { account: "4671", debit: 7968000, label: "Obligataires, obligations à placer", alsoAccept: ["467"] },
        { account: "169", debit: 80000, label: "Primes de remboursement des obligations" },
        { account: "163", credit: 8048000, label: "Autres emprunts obligataires" }
      ],
      amountToleranceAbs: 0,
      allowExtraLines: false,
      points: { accounts: 4, direction: 3, amounts: 4, balance: 2 }
    },
    testCases: [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "4671", debit: 7968000 },
            { account: "169", debit: 80000 },
            { account: "163", credit: 8048000 }
          ]
        },
        expectedScore: 20
      },
      {
        // Dette inscrite au prix d'émission : la prime disparaît.
        name: "dette-au-prix-d-emission",
        submission: {
          kind: "journal",
          lines: [
            { account: "4671", debit: 7968000 },
            { account: "163", credit: 7968000 }
          ]
        },
        expectedScore: 12.31,
        expectedOutcomes: { accounts: "partial", amounts: "partial" }
      },
      {
        name: "sens-inverse",
        submission: {
          kind: "journal",
          lines: [
            { account: "4671", credit: 7968000 },
            { account: "169", credit: 80000 },
            { account: "163", debit: 8048000 }
          ]
        },
        expectedScore: 9.23,
        expectedOutcomes: { direction: "missed" }
      }
    ]
  },
  {
    id: "exv-variations-capital-1-1",
    exerciseId: "ex-variations-capital-1",
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      // Corrigé existant, écriture (e) : 4563 45 000 et 109 75 000 au débit ;
      // 1011 75 000, 1013 25 000, 1041 20 000 au crédit.
      expectedLines: [
        { account: "4563", debit: 45000, label: "Actionnaires — versements reçus sur augmentation de capital" },
        { account: "109", debit: 75000, label: "Actionnaires : capital souscrit non appelé" },
        { account: "1011", credit: 75000, label: "Capital souscrit non appelé" },
        { account: "1013", credit: 25000, label: "Capital souscrit appelé, versé" },
        { account: "1041", credit: 20000, label: "Primes d'émission" }
      ],
      amountToleranceAbs: 0,
      allowExtraLines: false,
      points: { accounts: 4, direction: 3, amounts: 4, balance: 2 }
    },
    testCases: [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "4563", debit: 45000 },
            { account: "109", debit: 75000 },
            { account: "1011", credit: 75000 },
            { account: "1013", credit: 25000 },
            { account: "1041", credit: 20000 }
          ]
        },
        expectedScore: 20
      },
      {
        // La prime oubliée : les fonds reçus ne sont plus expliqués.
        name: "prime-oubliee",
        submission: {
          kind: "journal",
          lines: [
            { account: "4563", debit: 45000 },
            { account: "109", debit: 75000 },
            { account: "1011", credit: 75000 },
            { account: "1013", credit: 45000 }
          ]
        },
        expectedScore: 15.38,
        expectedOutcomes: { accounts: "partial" }
      }
    ]
  },
  {
    id: "exv-methode-abc-1-1",
    exerciseId: "ex-methode-abc-1",
    version: 1,
    evaluationType: "numeric",
    spec: {
      // Corrigé existant : coût d'inducteur 30 700 / 614 = 50 ; Manager des
      // achats : 550 × 50 = 27 500.
      expected: 27500,
      toleranceAbs: 0.01,
      unit: "EUR",
      label: "Charges imputées à la formation Manager des achats"
    },
    testCases: [
      { name: "valeur-exacte", submission: { kind: "numeric", value: 27500 }, expectedScore: 20 },
      {
        // L'autre formation donnée à la place.
        name: "l-autre-formation",
        submission: { kind: "numeric", value: 3200 },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-cout-cible-1-1",
    exerciseId: "ex-cout-cible-1",
    version: 1,
    evaluationType: "numeric",
    spec: {
      // Corrigé existant : coût cible global = 3,12 − 1,25 = 1,87 € (1,872
      // avant arrondi) ; la tolérance au centime accepte les deux.
      expected: 1.87,
      toleranceAbs: 0.01,
      unit: "EUR",
      label: "Coût cible global des composants"
    },
    testCases: [
      { name: "valeur-arrondie", submission: { kind: "numeric", value: 1.87 }, expectedScore: 20 },
      {
        // Variante acceptée : la valeur avant arrondi.
        name: "valeur-avant-arrondi",
        submission: { kind: "numeric", value: 1.872 },
        expectedScore: 20
      },
      {
        // Le coût estimé donné à la place du coût cible.
        name: "cout-estime",
        submission: { kind: "numeric", value: 2.1 },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-yield-management-1-1",
    exerciseId: "ex-yield-management-1",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Affirmations exactes sur le yield management",
      options: [
        { id: "q1-c", label: "Q1 : la compagnie C maximise le chiffre d'affaires (1 422 000 €)" },
        {
          id: "q1-b",
          label: "Q1 : la compagnie B maximise le chiffre d'affaires",
          rationale: "B réalise 1 380 000 €, comme A : maximiser le prix moyen seul ne suffit pas."
        },
        { id: "q2-81", label: "Q2 : le taux d'occupation de C est de 81 %" },
        {
          id: "q2-72",
          label: "Q2 : le taux d'occupation de C est de 72 %",
          rationale: "C vend 192 + 132 = 324 cabines sur 400, soit 81 %."
        },
        {
          id: "q3-eleve",
          label: "Q3 : le yield management exige un coût marginal élevé par client",
          rationale: "C'est l'inverse : un coût marginal FAIBLE rend profitables les tarifs réduits."
        },
        { id: "q4-etancheite", label: "Q4 : la règle d'étanchéité évite la dilution tarifaire" }
      ],
      correctOptionIds: ["q1-c", "q2-81", "q4-etancheite"]
    },
    testCases: [
      {
        name: "les-trois-exactes",
        submission: { kind: "choice", selectedOptionIds: ["q1-c", "q2-81", "q4-etancheite"] },
        expectedScore: 20
      },
      {
        name: "retient-le-cout-marginal-eleve",
        submission: {
          kind: "choice",
          selectedOptionIds: ["q1-c", "q2-81", "q4-etancheite", "q3-eleve"]
        },
        expectedScore: 13.33
      }
    ]
  },
  {
    id: "exv-ecarts-1-1",
    exerciseId: "ex-ecarts-1",
    version: 1,
    evaluationType: "numeric",
    spec: {
      // Corrigé existant : 2 940 + 4 640 − 5 760 = +1 820 € défavorable,
      // égal à 124 320 − 122 500.
      expected: 1820,
      toleranceAbs: 0.01,
      unit: "EUR",
      label: "Écart global du centre (production réelle)"
    },
    testCases: [
      { name: "valeur-exacte", submission: { kind: "numeric", value: 1820 }, expectedScore: 20 },
      {
        // L'écart sur budget donné seul.
        name: "ecart-sur-budget",
        submission: { kind: "numeric", value: 4640 },
        expectedScore: 0
      }
    ]
  }
];
