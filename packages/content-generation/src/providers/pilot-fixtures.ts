import type { SourceEnvelope } from "../envelope/build";
import type { CalculationBatch } from "../types/calculation";
import type { ErrorDiagnosisBatch } from "../types/error-diagnosis";
import type { FlashcardBatch, GeneratedFlashcard } from "../types/flashcard";
import type { JournalEntryBatch } from "../types/journal-entry";
import type { ProgressiveCase } from "../types/progressive-case";
import type { SmartRevisionSheet } from "../types/smart-revision-sheet";
import type { StrictSourceReference } from "../types/source-reference";
import { referenceForTerms, referenceSpanningTerms } from "./fixture-helpers";

/**
 * Fixtures techniques du mode mock, pour le chapitre « Emprunts obligataires ».
 *
 * Ce sont des FIXTURES, pas du contenu validé : elles servent à exercer la
 * chaîne complète (génération → validation → revue) sans appeler de service
 * externe. Les brouillons qui en sortent portent `mode: "mock"` dans leurs
 * métadonnées et sont affichés comme tels dans l'interface de revue.
 *
 * Elles restent néanmoins ancrées sur le corpus réel : chaque référence est
 * résolue par recherche dans l'enveloppe, et tout élément dont la source est
 * introuvable est **omis** plutôt qu'inventé. Le rapport signale alors la
 * couverture manquante.
 */

interface Anchors {
  nominal?: StrictSourceReference;
  conditions?: StrictSourceReference;
  coupon?: StrictSourceReference;
  emissionAccounts?: StrictSourceReference;
  interetsCourus?: StrictSourceReference;
  amortissementPrime?: StrictSourceReference;
  fraisEmission?: StrictSourceReference;
  casData?: StrictSourceReference;
}

function resolveAnchors(envelope: SourceEnvelope): Anchors {
  return {
    nominal: referenceForTerms(envelope, ["valeur nominale"], { category: "course" }),
    conditions: referenceForTerms(envelope, ["societes par actions"], { category: "course" }),
    coupon: referenceForTerms(envelope, ["coupon"], { category: "course" }),
    // Les comptes de l'écriture d'émission sont répartis sur deux fragments
    // voisins : la référence couvre les deux plutôt que d'en citer un seul.
    emissionAccounts: referenceSpanningTerms(envelope, ["163", "4671", "169"], { category: "course" }),
    interetsCourus: referenceForTerms(envelope, ["16883"], { category: "course" }),
    amortissementPrime: referenceForTerms(envelope, ["6861"], { category: "course" }),
    fraisEmission: referenceForTerms(envelope, ["4816"], { category: "course" }),
    casData: referenceForTerms(envelope, ["996"], { category: "exercise" })
  };
}

/** Données du cas CSP, telles qu'elles figurent dans la mise en situation. */
const CSP = {
  nombreObligations: 8000,
  valeurNominale: 1000,
  prixEmission: 996,
  prixRemboursement: 1006,
  dureeMois: 96,
  moisEcoulesN: 4
} as const;

const PRIME_TOTALE = (CSP.prixRemboursement - CSP.prixEmission) * CSP.nombreObligations; // 80 000
const MONTANT_EMISSION = CSP.prixEmission * CSP.nombreObligations; // 7 968 000
const DETTE_TOTALE = CSP.prixRemboursement * CSP.nombreObligations; // 8 048 000
const AMORTISSEMENT_PRIME_N =
  Math.round(((PRIME_TOTALE * CSP.moisEcoulesN) / CSP.dureeMois + Number.EPSILON) * 100) / 100; // 3 333,33

export function buildSheetFixture(envelope: SourceEnvelope): SmartRevisionSheet | undefined {
  const anchors = resolveAnchors(envelope);
  const primary = anchors.nominal ?? anchors.emissionAccounts ?? anchors.coupon;

  // Sans la fiche de cours, il n'y a rien de citable : on ne produit pas de fiche.
  if (!primary || !anchors.emissionAccounts) {
    return undefined;
  }

  const essentialRules: SmartRevisionSheet["essentialRules"] = [];

  if (anchors.conditions) {
    essentialRules.push({
      statement:
        "Seules les sociétés par actions dont le capital est entièrement libéré et qui ont clos deux exercices approuvés peuvent émettre des obligations négociables.",
      rationale:
        "L'appel public à l'épargne suppose des comptes déjà arrêtés et approuvés, faute de quoi une vérification de l'actif et du passif devient obligatoire.",
      sourceReferences: [anchors.conditions]
    });
  }

  if (anchors.nominal) {
    essentialRules.push({
      statement:
        "La valeur nominale est le montant sur lequel les intérêts sont calculés ; le prix d'émission peut en différer.",
      sourceReferences: [anchors.nominal]
    });
  }

  essentialRules.push({
    statement:
      "À la souscription, le prix de remboursement est porté au crédit du compte 163, le prix d'émission au débit du compte 4671, et l'écart entre les deux au débit du compte 169.",
    rationale:
      "La dette est inscrite pour ce qu'il faudra rembourser ; l'écart constitue une charge financière étalée sur la durée de l'emprunt.",
    sourceReferences: [anchors.emissionAccounts]
  });

  if (anchors.amortissementPrime) {
    essentialRules.push({
      statement:
        "La prime de remboursement est amortie sur la durée de l'emprunt, obligatoirement, par le débit du compte 6861.",
      rationale:
        "Le PCG admet deux méthodes : au prorata des intérêts courus, ou par fractions égales sur la durée.",
      sourceReferences: [anchors.amortissementPrime]
    });
  }

  const accountMap: SmartRevisionSheet["accountMap"] = [
    {
      accountNumber: "163",
      label: "Autres emprunts obligataires",
      usage: "Crédité du prix de remboursement des obligations à la souscription.",
      side: "credit",
      sourceReferences: [anchors.emissionAccounts]
    },
    {
      accountNumber: "4671",
      label: "Obligataires, obligations à placer",
      usage: "Débité du prix d'émission, puis soldé lors du versement des fonds.",
      side: "debit",
      sourceReferences: [anchors.emissionAccounts]
    },
    {
      accountNumber: "169",
      label: "Primes de remboursement des obligations",
      usage: "Débité de l'écart entre prix de remboursement et prix d'émission.",
      side: "debit",
      sourceReferences: [anchors.emissionAccounts]
    }
  ];

  if (anchors.amortissementPrime) {
    accountMap.push({
      accountNumber: "6861",
      label: "Dotations aux amortissements des primes de remboursement des obligations",
      usage: "Débité de la dotation annuelle d'amortissement de la prime.",
      side: "debit",
      sourceReferences: [anchors.amortissementPrime]
    });
  }

  if (anchors.fraisEmission) {
    accountMap.push(
      {
        accountNumber: "4816",
        label: "Frais d'émission des emprunts",
        usage: "Reçoit les frais d'émission lorsqu'ils sont étalés, puis est amorti directement.",
        side: "both",
        sourceReferences: [anchors.fraisEmission]
      },
      {
        accountNumber: "6812",
        label: "Dotations aux amortissements des charges d'exploitation à répartir",
        usage: "Débité de l'amortissement des frais d'émission étalés.",
        side: "debit",
        sourceReferences: [anchors.fraisEmission]
      }
    );
  }

  const formulas: SmartRevisionSheet["formulas"] = [];

  if (anchors.nominal) {
    formulas.push({
      name: "Prime de remboursement unitaire",
      expression: "prime = prix de remboursement − prix d'émission",
      variableDefinitions: [
        { symbol: "prix de remboursement", meaning: "montant remboursé pour une obligation", unit: "€" },
        { symbol: "prix d'émission", meaning: "montant versé par le souscripteur", unit: "€" }
      ],
      unit: "€",
      roundingRule: "cent",
      sourceReferences: [anchors.nominal]
    });
  }

  if (anchors.coupon) {
    formulas.push({
      name: "Coupon annuel",
      expression: "coupon = valeur nominale × taux d'intérêt",
      variableDefinitions: [
        { symbol: "valeur nominale", meaning: "base de calcul des intérêts", unit: "€" },
        { symbol: "taux d'intérêt", meaning: "taux annuel servi à l'obligation", unit: "%" }
      ],
      unit: "€",
      roundingRule: "cent",
      sourceReferences: [anchors.coupon]
    });
  }

  const timelineSteps: SmartRevisionSheet["timelineSteps"] = [
    {
      order: 1,
      moment: "Souscription de l'emprunt",
      action:
        "Constater la dette au prix de remboursement, la créance sur les obligataires au prix d'émission et la prime au débit du 169.",
      accountsInvolved: ["163", "4671", "169"],
      sourceReferences: [anchors.emissionAccounts]
    },
    {
      order: 2,
      moment: "Versement des fonds",
      action: "Solder le compte 4671 par le compte de trésorerie.",
      accountsInvolved: ["4671"],
      sourceReferences: [anchors.emissionAccounts]
    }
  ];

  if (anchors.interetsCourus) {
    timelineSteps.push({
      order: 3,
      moment: "Clôture de l'exercice",
      action: "Rattacher les intérêts courus à l'exercice.",
      accountsInvolved: ["16883"],
      sourceReferences: [anchors.interetsCourus]
    });
  }

  if (anchors.amortissementPrime) {
    timelineSteps.push({
      order: timelineSteps.length + 1,
      moment: "Clôture de l'exercice",
      action: "Doter l'amortissement de la prime de remboursement sur la durée de l'emprunt.",
      accountsInvolved: ["6861", "169"],
      sourceReferences: [anchors.amortissementPrime]
    });
  }

  const commonMistakes: SmartRevisionSheet["commonMistakes"] = [
    {
      mistake: "Créditer le compte 163 du prix d'émission au lieu du prix de remboursement.",
      correction:
        "Le compte 163 enregistre ce que la société devra rembourser : le prix de remboursement, l'écart allant au 169.",
      sourceReferences: [anchors.emissionAccounts]
    }
  ];

  if (anchors.amortissementPrime) {
    commonMistakes.push({
      mistake: "Amortir la prime de remboursement sur une durée choisie librement.",
      correction: "La durée d'amortissement de la prime est obligatoirement celle de l'emprunt.",
      sourceReferences: [anchors.amortissementPrime]
    });
  }

  const activeRecallQuestions: SmartRevisionSheet["activeRecallQuestions"] = [
    {
      question: "Quel compte est crédité à la souscription d'un emprunt obligataire, et pour quel montant ?",
      answer: "Le compte 163 « Autres emprunts obligataires », pour le prix de remboursement.",
      sourceReferences: [anchors.emissionAccounts]
    }
  ];

  if (anchors.nominal) {
    activeRecallQuestions.push({
      question: "Sur quel montant les intérêts d'une obligation sont-ils calculés ?",
      answer: "Sur la valeur nominale, aussi appelée « pair » de l'obligation.",
      sourceReferences: [anchors.nominal]
    });
  }

  const workedExampleSources = anchors.casData ?? anchors.emissionAccounts;

  return {
    title: "Les emprunts obligataires — fiche de révision",
    slug: "emprunts-obligataires",
    chapter: envelope.chapterLabel,
    learningObjective:
      "Comptabiliser l'émission d'un emprunt obligataire, puis les écritures d'inventaire relatives à la prime de remboursement et aux frais d'émission.",
    prerequisites: ["Distinction capitaux propres / dettes", "Principe de rattachement à l'exercice"],
    essentialRules,
    accountMap,
    formulas,
    timelineSteps,
    workedExample: {
      title: "Émission de l'emprunt obligataire de la société CSP",
      steps: [
        {
          kind: "understand",
          title: "Comprendre l'opération",
          content:
            "La société émet des obligations dont le prix de remboursement dépasse le prix d'émission : l'écart est une prime de remboursement, charge financière étalée sur la durée de l'emprunt."
        },
        {
          kind: "data",
          title: "Données utiles",
          content: `${CSP.nombreObligations} obligations de ${CSP.valeurNominale} € de nominal, prix d'émission ${CSP.prixEmission} €, prix de remboursement ${CSP.prixRemboursement} €.`
        },
        {
          kind: "rule",
          title: "Règle applicable",
          content:
            "Le compte 163 est crédité du prix de remboursement, le compte 4671 débité du prix d'émission, le compte 169 débité de l'écart."
        },
        {
          kind: "calculation",
          title: "Calculs",
          content: `Dette : ${CSP.prixRemboursement} × ${CSP.nombreObligations} = ${DETTE_TOTALE} €. Émission : ${CSP.prixEmission} × ${CSP.nombreObligations} = ${MONTANT_EMISSION} €. Prime : ${DETTE_TOTALE} − ${MONTANT_EMISSION} = ${PRIME_TOTALE} €.`
        },
        {
          kind: "entry",
          title: "Écriture",
          content: `Débit 4671 ${MONTANT_EMISSION} € et débit 169 ${PRIME_TOTALE} €, crédit 163 ${DETTE_TOTALE} €.`
        },
        {
          kind: "result",
          title: "Résultat",
          content: `La dette figure au passif pour ${DETTE_TOTALE} € et la prime à l'actif pour ${PRIME_TOTALE} €.`
        },
        {
          kind: "justification",
          title: "Justification",
          content:
            "L'écriture s'équilibre parce que la prime comble exactement l'écart entre ce qui est encaissé et ce qui sera remboursé."
        }
      ],
      sourceReferences: [workedExampleSources]
    },
    commonMistakes,
    activeRecallQuestions,
    summary:
      "Un emprunt obligataire est inscrit au passif pour son prix de remboursement. L'écart avec le prix d'émission constitue la prime de remboursement, portée au 169 et amortie sur la durée de l'emprunt par le 6861. Les frais d'émission sont enregistrés en 6272 et peuvent être étalés via le 4816.",
    sourceReferences: [primary],
    difficulty: 3,
    estimatedMinutes: 25
  };
}

export function buildFlashcardFixture(envelope: SourceEnvelope): FlashcardBatch | undefined {
  const anchors = resolveAnchors(envelope);
  const cards: GeneratedFlashcard[] = [];

  function card(
    reference: StrictSourceReference | undefined,
    card: Omit<GeneratedFlashcard, "sourceReferences" | "atomicityCheck"> &
      Partial<Pick<GeneratedFlashcard, "atomicityCheck">>
  ): void {
    if (!reference) {
      return;
    }

    cards.push({
      ...card,
      sourceReferences: [reference],
      atomicityCheck: card.atomicityCheck ?? {
        testedFactCount: 1,
        singleFocus: true,
        justification: "La carte porte sur une seule notion issue des sources."
      }
    });
  }

  card(anchors.nominal, {
    type: "concept",
    front: "Sur quelle base les intérêts d'une obligation sont-ils calculés ?",
    back: "Sur la valeur nominale, également appelée « pair ».",
    explanation:
      "La valeur nominale sert uniquement de base de calcul des intérêts ; elle est indépendante du prix effectivement payé par le souscripteur et du montant remboursé à l'échéance.",
    learningObjective: "Identifier la base de calcul des intérêts obligataires.",
    difficulty: 1,
    tags: ["emprunts-obligataires", "vocabulaire"],
    relatedConceptIds: []
  });

  card(anchors.nominal, {
    type: "distinction",
    front: "Quelle différence sépare le prix d'émission de la valeur nominale ?",
    back: "Le prix d'émission est ce que verse le souscripteur ; il peut être inférieur au nominal, l'écart constituant une prime.",
    explanation:
      "La valeur nominale ne sert qu'au calcul des intérêts. Le prix d'émission est le décaissement réel du souscripteur, et il peut s'en écarter.",
    learningObjective: "Distinguer les trois prix d'une obligation.",
    difficulty: 2,
    tags: ["emprunts-obligataires", "distinction"],
    relatedConceptIds: []
  });

  card(anchors.emissionAccounts, {
    type: "account",
    front: "Quel compte est crédité à la souscription d'un emprunt obligataire ?",
    back: "Le compte 163 « Autres emprunts obligataires », pour le prix de remboursement.",
    explanation:
      "La dette est constatée pour ce qui devra être remboursé, et non pour ce qui a été encaissé : l'écart transite par le compte 169.",
    learningObjective: "Mémoriser le compte de dette obligataire et son montant.",
    difficulty: 2,
    tags: ["emprunts-obligataires", "comptes"],
    relatedConceptIds: []
  });

  card(anchors.emissionAccounts, {
    type: "account",
    front: "À quoi sert le compte 4671 lors d'une émission obligataire ?",
    back: "Il est débité du prix d'émission, puis soldé au versement des fonds.",
    explanation:
      "Ce compte, non prévu par le PCG, matérialise la créance sur les obligataires entre la souscription et la libération des fonds.",
    learningObjective: "Situer le compte de liaison de l'émission obligataire.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "comptes"],
    relatedConceptIds: []
  });

  card(anchors.emissionAccounts, {
    type: "account",
    front: "Quel compte enregistre l'écart entre prix de remboursement et prix d'émission ?",
    back: "Le compte 169 « Primes de remboursement des obligations », au débit.",
    explanation:
      "Cette prime est une charge financière répartie sur plusieurs exercices, présentée à l'actif du bilan tant qu'elle n'est pas amortie.",
    learningObjective: "Identifier le compte de la prime de remboursement.",
    difficulty: 2,
    tags: ["emprunts-obligataires", "comptes"],
    relatedConceptIds: []
  });

  card(anchors.amortissementPrime, {
    type: "account",
    front: "Quel compte est débité lors de l'amortissement de la prime de remboursement ?",
    back: "Le compte 6861 « Dotations aux amortissements des primes de remboursement des obligations ».",
    explanation:
      "La prime étant une charge financière répartie, sa dotation emprunte un compte distinct des dotations d'exploitation.",
    learningObjective: "Mémoriser le compte de dotation de la prime.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "inventaire"],
    relatedConceptIds: []
  });

  card(anchors.amortissementPrime, {
    type: "concept",
    front: "Sur quelle durée la prime de remboursement doit-elle être amortie ?",
    back: "Obligatoirement sur la durée de l'emprunt.",
    explanation:
      "Le PCG laisse le choix entre deux méthodes — prorata des intérêts courus ou fractions égales — mais impose la durée.",
    learningObjective: "Connaître la contrainte de durée d'amortissement de la prime.",
    difficulty: 2,
    tags: ["emprunts-obligataires", "inventaire"],
    relatedConceptIds: []
  });

  card(anchors.amortissementPrime, {
    type: "distinction",
    front: "Quelles sont les deux méthodes admises pour amortir la prime de remboursement ?",
    back: "Au prorata des intérêts courus, ou par fractions égales sur la durée de l'emprunt.",
    explanation:
      "La première suit la logique financière, la prime complétant la charge d'intérêts ; la seconde est linéaire.",
    learningObjective: "Comparer les deux méthodes d'amortissement de la prime.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "inventaire"],
    relatedConceptIds: []
  });

  card(anchors.coupon, {
    type: "concept",
    front: "Que désigne le terme « coupon » dans un emprunt obligataire ?",
    back: "Le montant de l'intérêt annuel, égal à la valeur nominale multipliée par le taux.",
    explanation:
      "Le coupon peut être fixe, variable, ou partiellement indexé sur un agrégat de l'entreprise.",
    learningObjective: "Définir le coupon obligataire.",
    difficulty: 1,
    tags: ["emprunts-obligataires", "vocabulaire"],
    relatedConceptIds: []
  });

  card(anchors.coupon, {
    type: "distinction",
    front: "Qu'est-ce qui caractérise une obligation dite « à coupon zéro » ?",
    back: "Elle ne porte pas d'intérêt, mais elle est émise avec une prime de remboursement importante.",
    explanation:
      "La rémunération du souscripteur passe entièrement par l'écart entre prix d'émission et prix de remboursement.",
    learningObjective: "Distinguer coupon unique et coupon zéro.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "distinction"],
    relatedConceptIds: []
  });

  card(anchors.coupon, {
    type: "concept",
    front: "Quelle est la modalité de remboursement la plus répandue des emprunts obligataires ?",
    back: "Le remboursement in fine, en bloc à la fin de la période.",
    explanation:
      "Les alternatives, par tirages au sort avec amortissements constants ou annuités constantes, sont de moins en moins utilisées.",
    learningObjective: "Connaître les modalités de remboursement.",
    difficulty: 2,
    tags: ["emprunts-obligataires", "vocabulaire"],
    relatedConceptIds: []
  });

  card(anchors.conditions, {
    type: "concept",
    front: "Quelles sociétés peuvent émettre des obligations négociables ?",
    back: "Les sociétés par actions dont le capital est entièrement libéré et qui ont clos deux exercices approuvés.",
    explanation:
      "À défaut d'approbation des comptes, une vérification de l'actif et du passif devient obligatoire.",
    learningObjective: "Connaître les conditions d'émission.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "conditions"],
    relatedConceptIds: []
  });

  card(anchors.fraisEmission, {
    type: "account",
    front: "Dans quel compte les commissions de placement d'un emprunt sont-elles d'abord enregistrées ?",
    back: "Le compte 6272 « Commissions et frais sur émission d'emprunts ».",
    explanation:
      "Ce sont des charges d'exploitation ; elles peuvent ensuite être étalées en transitant par le compte 4816.",
    learningObjective: "Situer l'enregistrement initial des frais d'émission.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "frais"],
    relatedConceptIds: []
  });

  card(anchors.fraisEmission, {
    type: "distinction",
    front: "Quelle option s'offre à l'entreprise pour les frais d'émission d'un emprunt ?",
    back: "Les conserver en charges de l'exercice, ou les étaler sur la durée de l'emprunt.",
    explanation:
      "Le choix de l'étalement s'applique alors à tous les emprunts obligataires émis, par permanence des méthodes.",
    learningObjective: "Connaître l'option sur les frais d'émission.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "frais"],
    relatedConceptIds: []
  });

  card(anchors.interetsCourus, {
    type: "account",
    front: "Quel compte reçoit les intérêts courus non échus d'un emprunt obligataire ?",
    back: "Le compte 16883 « Intérêts courus ».",
    explanation:
      "La charge d'intérêts à payer est rattachée à l'exercice comme pour toute autre forme d'emprunt.",
    learningObjective: "Identifier le compte d'intérêts courus.",
    difficulty: 3,
    tags: ["emprunts-obligataires", "inventaire"],
    relatedConceptIds: []
  });

  return cards.length > 0 ? { cards } : undefined;
}

export function buildCalculationFixture(envelope: SourceEnvelope): CalculationBatch | undefined {
  const anchors = resolveAnchors(envelope);
  const dataReference = anchors.casData;

  // Sans les données chiffrées de la mise en situation, aucun calcul n'est
  // adossé à une source : on n'en produit aucun.
  if (!dataReference) {
    return undefined;
  }

  const exercises: CalculationBatch["exercises"] = [
    {
      title: "Prime de remboursement totale de l'emprunt CSP",
      statement: `La société CSP a émis ${CSP.nombreObligations} obligations de ${CSP.valeurNominale} € de valeur nominale. Le prix d'émission est de ${CSP.prixEmission} € et le prix de remboursement de ${CSP.prixRemboursement} €. Calculer la prime de remboursement totale de l'emprunt.`,
      variables: [
        { name: "prixRemboursement", label: "Prix de remboursement d'une obligation", value: CSP.prixRemboursement, unit: "€", providedInStatement: true },
        { name: "prixEmission", label: "Prix d'émission d'une obligation", value: CSP.prixEmission, unit: "€", providedInStatement: true },
        { name: "nombreObligations", label: "Nombre d'obligations émises", value: CSP.nombreObligations, unit: "titres", providedInStatement: true }
      ],
      expectedAnswer: PRIME_TOTALE,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent",
      formulaTemplateId: "prime-remboursement-totale.v1",
      templateInputs: {
        prixRemboursement: CSP.prixRemboursement,
        prixEmission: CSP.prixEmission,
        nombreObligations: CSP.nombreObligations
      },
      calculationSteps: [
        {
          order: 1,
          description: "Calculer la prime unitaire : prix de remboursement moins prix d'émission.",
          expression: `${CSP.prixRemboursement} − ${CSP.prixEmission}`,
          intermediateResult: CSP.prixRemboursement - CSP.prixEmission
        },
        {
          order: 2,
          description: "Multiplier la prime unitaire par le nombre d'obligations émises.",
          expression: `${CSP.prixRemboursement - CSP.prixEmission} × ${CSP.nombreObligations}`,
          intermediateResult: PRIME_TOTALE
        }
      ],
      explanation:
        "La prime de remboursement mesure l'écart total entre ce que la société encaisse à l'émission et ce qu'elle devra rembourser. Elle est portée au débit du compte 169 et amortie sur la durée de l'emprunt.",
      gradingRubric: [
        { label: "Prime unitaire correcte", points: 4 },
        { label: "Multiplication par le nombre d'obligations", points: 4 },
        { label: "Unité et arrondi", points: 2 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "prime-de-remboursement"],
      sourceReferences: [dataReference],
      difficulty: 2
    },
    {
      title: "Dette inscrite au passif à la souscription",
      statement: `Pour le même emprunt CSP (${CSP.nombreObligations} obligations, prix de remboursement ${CSP.prixRemboursement} €), déterminer le montant porté au crédit du compte 163 « Autres emprunts obligataires ».`,
      variables: [
        { name: "prixRemboursement", label: "Prix de remboursement d'une obligation", value: CSP.prixRemboursement, unit: "€", providedInStatement: true },
        { name: "nombreObligations", label: "Nombre d'obligations émises", value: CSP.nombreObligations, unit: "titres", providedInStatement: true }
      ],
      expectedAnswer: DETTE_TOTALE,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent",
      formulaTemplateId: "dette-remboursement-totale.v1",
      templateInputs: {
        prixRemboursement: CSP.prixRemboursement,
        nombreObligations: CSP.nombreObligations
      },
      calculationSteps: [
        {
          order: 1,
          description: "La dette est constatée au prix de remboursement, non au prix d'émission.",
          expression: `${CSP.prixRemboursement} × ${CSP.nombreObligations}`,
          intermediateResult: DETTE_TOTALE
        }
      ],
      explanation:
        "Le compte 163 enregistre ce que la société devra rembourser aux obligataires. L'écart avec le montant encaissé constitue la prime portée au 169.",
      gradingRubric: [
        { label: "Base de valorisation correcte (prix de remboursement)", points: 6 },
        { label: "Calcul exact", points: 4 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "dette-obligataire"],
      sourceReferences: [dataReference],
      difficulty: 2
    },
    {
      title: "Montant encaissé à l'émission",
      statement: `Toujours pour l'emprunt CSP, calculer le montant total correspondant au prix d'émission des ${CSP.nombreObligations} obligations.`,
      variables: [
        { name: "prixEmission", label: "Prix d'émission d'une obligation", value: CSP.prixEmission, unit: "€", providedInStatement: true },
        { name: "nombreObligations", label: "Nombre d'obligations émises", value: CSP.nombreObligations, unit: "titres", providedInStatement: true }
      ],
      expectedAnswer: MONTANT_EMISSION,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent",
      formulaTemplateId: "montant-emission-total.v1",
      templateInputs: {
        prixEmission: CSP.prixEmission,
        nombreObligations: CSP.nombreObligations
      },
      calculationSteps: [
        {
          order: 1,
          description: "Multiplier le prix d'émission par le nombre d'obligations.",
          expression: `${CSP.prixEmission} × ${CSP.nombreObligations}`,
          intermediateResult: MONTANT_EMISSION
        }
      ],
      explanation:
        "Ce montant est porté au débit du compte 4671, qui sera soldé lors du versement effectif des fonds.",
      gradingRubric: [
        { label: "Calcul exact", points: 6 },
        { label: "Rattachement au compte 4671", points: 4 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "emission-obligataire"],
      sourceReferences: [dataReference],
      difficulty: 1
    }
  ];

  if (anchors.amortissementPrime) {
    exercises.push({
      title: "Amortissement linéaire de la prime au 31/12/N",
      statement: `L'emprunt CSP a été émis le 01/09/N et sera remboursé en huit séries annuelles, soit une durée de ${CSP.dureeMois} mois. La prime de remboursement totale s'élève à ${PRIME_TOTALE} €. En retenant un amortissement linéaire sur la durée de l'emprunt, calculer la dotation à constater au 31/12/N.`,
      variables: [
        { name: "montantAEtaler", label: "Prime de remboursement totale", value: PRIME_TOTALE, unit: "€", providedInStatement: true },
        { name: "dureeMois", label: "Durée de l'emprunt", value: CSP.dureeMois, unit: "mois", providedInStatement: true },
        { name: "moisEcoules", label: "Mois écoulés du 01/09/N au 31/12/N", value: CSP.moisEcoulesN, unit: "mois", providedInStatement: true }
      ],
      expectedAnswer: AMORTISSEMENT_PRIME_N,
      unit: "€",
      tolerance: 0.01,
      roundingRule: "cent",
      formulaTemplateId: "amortissement-lineaire-periode.v1",
      templateInputs: {
        montantAEtaler: PRIME_TOTALE,
        dureeMois: CSP.dureeMois,
        moisEcoules: CSP.moisEcoulesN
      },
      calculationSteps: [
        {
          order: 1,
          description: "Déterminer la fraction de la durée écoulée sur l'exercice N.",
          expression: `${CSP.moisEcoulesN} / ${CSP.dureeMois}`
        },
        {
          order: 2,
          description: "Appliquer cette fraction à la prime totale.",
          expression: `${PRIME_TOTALE} × ${CSP.moisEcoulesN} / ${CSP.dureeMois}`,
          intermediateResult: AMORTISSEMENT_PRIME_N
        }
      ],
      explanation:
        "L'amortissement de la prime court à compter de l'émission, sur la durée de l'emprunt. Il est constaté au débit du compte 6861 par le crédit du compte 169.",
      gradingRubric: [
        { label: "Durée retenue correcte", points: 4 },
        { label: "Prorata de l'exercice", points: 4 },
        { label: "Arrondi au centime", points: 2 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "amortissement-prime"],
      sourceReferences: [anchors.amortissementPrime, dataReference],
      difficulty: 3
    });
  }

  return { exercises };
}

export function buildJournalEntryFixture(envelope: SourceEnvelope): JournalEntryBatch | undefined {
  const anchors = resolveAnchors(envelope);

  if (!anchors.emissionAccounts || !anchors.casData) {
    return undefined;
  }

  const exercises: JournalEntryBatch["exercises"] = [
    {
      title: "Écriture de souscription de l'emprunt obligataire CSP",
      statement: `La société CSP émet le 01/09/N ${CSP.nombreObligations} obligations de ${CSP.valeurNominale} € de nominal. Le prix d'émission est fixé à ${CSP.prixEmission} € et le prix de remboursement à ${CSP.prixRemboursement} €. Passer l'écriture de souscription au journal.`,
      operationDate: "01/09/N",
      contextualData: [
        { label: "Nombre d'obligations", value: `${CSP.nombreObligations}` },
        { label: "Prix d'émission", value: `${CSP.prixEmission} €` },
        { label: "Prix de remboursement", value: `${CSP.prixRemboursement} €` }
      ],
      expectedLines: [
        {
          accountNumber: "4671",
          accountLabel: "Obligataires, obligations à placer",
          debit: MONTANT_EMISSION,
          credit: 0,
          lineExplanation: "Créance sur les obligataires, au prix d'émission."
        },
        {
          accountNumber: "169",
          accountLabel: "Primes de remboursement des obligations",
          debit: PRIME_TOTALE,
          credit: 0,
          lineExplanation: "Écart entre prix de remboursement et prix d'émission."
        },
        {
          accountNumber: "163",
          accountLabel: "Autres emprunts obligataires",
          debit: 0,
          credit: DETTE_TOTALE,
          lineExplanation: "Dette constatée au prix de remboursement."
        }
      ],
      requiredAccounts: ["163", "169", "4671"],
      allowedAlternativeAccounts: [],
      expectedTotalDebit: MONTANT_EMISSION + PRIME_TOTALE,
      expectedTotalCredit: DETTE_TOTALE,
      gradingRubric: [
        { label: "Compte 163 crédité du prix de remboursement", points: 5 },
        { label: "Compte 169 débité de la prime", points: 5 },
        { label: "Compte 4671 débité du prix d'émission", points: 5 },
        { label: "Équilibre de l'écriture", points: 5 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "ecriture-emission"],
      explanation:
        "La dette est inscrite pour ce qui sera remboursé. La différence avec le montant encaissé est une charge financière étalée, isolée au compte 169 et présentée à l'actif du bilan tant qu'elle n'est pas amortie.",
      sourceReferences: [anchors.emissionAccounts, anchors.casData],
      difficulty: 3
    }
  ];

  if (anchors.amortissementPrime) {
    exercises.push({
      title: "Dotation à l'amortissement de la prime au 31/12/N",
      statement: `Au 31/12/N, la société CSP amortit linéairement la prime de remboursement de son emprunt obligataire (prime totale ${PRIME_TOTALE} €, durée ${CSP.dureeMois} mois, émission le 01/09/N). Passer l'écriture d'inventaire.`,
      operationDate: "31/12/N",
      contextualData: [
        { label: "Prime totale", value: `${PRIME_TOTALE} €` },
        { label: "Durée de l'emprunt", value: `${CSP.dureeMois} mois` },
        { label: "Mois écoulés", value: `${CSP.moisEcoulesN}` }
      ],
      expectedLines: [
        {
          accountNumber: "6861",
          accountLabel: "Dotations aux amortissements des primes de remboursement des obligations",
          debit: AMORTISSEMENT_PRIME_N,
          credit: 0,
          lineExplanation: "Charge financière de l'exercice au titre de la prime."
        },
        {
          accountNumber: "169",
          accountLabel: "Primes de remboursement des obligations",
          debit: 0,
          credit: AMORTISSEMENT_PRIME_N,
          lineExplanation: "Diminution de la prime restant à amortir."
        }
      ],
      requiredAccounts: ["6861", "169"],
      allowedAlternativeAccounts: [],
      expectedTotalDebit: AMORTISSEMENT_PRIME_N,
      expectedTotalCredit: AMORTISSEMENT_PRIME_N,
      gradingRubric: [
        { label: "Compte 6861 utilisé", points: 5 },
        { label: "Montant du prorata exact", points: 5 },
        { label: "Équilibre de l'écriture", points: 3 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "ecritures-inventaire"],
      explanation:
        "La prime est une charge financière répartie : sa dotation emprunte le compte 6861 et vient directement en diminution du compte 169.",
      sourceReferences: [anchors.amortissementPrime],
      difficulty: 3
    });
  }

  return { exercises };
}

export function buildErrorDiagnosisFixture(envelope: SourceEnvelope): ErrorDiagnosisBatch | undefined {
  const anchors = resolveAnchors(envelope);

  if (!anchors.emissionAccounts) {
    return undefined;
  }

  const exercises: ErrorDiagnosisBatch["exercises"] = [
    {
      title: "Émission obligataire : écriture incomplète",
      scenario: `Un stagiaire enregistre la souscription de l'emprunt CSP (${CSP.nombreObligations} obligations, prix d'émission ${CSP.prixEmission} €, prix de remboursement ${CSP.prixRemboursement} €) par l'écriture ci-dessous. L'écriture s'équilibre. Identifier néanmoins la nature de l'erreur.`,
      proposedEntry: [
        {
          accountNumber: "4671",
          accountLabel: "Obligataires, obligations à placer",
          debit: MONTANT_EMISSION,
          credit: 0,
          lineExplanation: "Créance sur les obligataires."
        },
        {
          accountNumber: "163",
          accountLabel: "Autres emprunts obligataires",
          debit: 0,
          credit: MONTANT_EMISSION,
          lineExplanation: "Dette obligataire."
        }
      ],
      errorCategories: ["missing_line", "wrong_account", "wrong_debit_credit_direction", "no_error"],
      expectedErrorCategory: "missing_line",
      expectedCorrection: `Il manque la ligne de prime : le compte 163 doit être crédité du prix de remboursement, soit ${DETTE_TOTALE} €, et le compte 169 débité de ${PRIME_TOTALE} €. L'écriture proposée sous-évalue la dette de ${PRIME_TOTALE} €.`,
      explanation:
        "Une écriture équilibrée n'est pas pour autant exacte. Ici l'équilibre est obtenu en constatant la dette au prix d'émission, ce qui fait disparaître la prime de remboursement.",
      gradingRubric: [
        { label: "Catégorie d'erreur correctement identifiée", points: 6 },
        { label: "Correction proposée cohérente avec la règle", points: 4 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "diagnostic-ecriture"],
      sourceReferences: [anchors.emissionAccounts],
      difficulty: 3
    }
  ];

  if (anchors.amortissementPrime) {
    exercises.push({
      title: "Amortissement de la prime : compte de dotation",
      scenario: `Au 31/12/N, la dotation à l'amortissement de la prime de remboursement de l'emprunt CSP, soit ${AMORTISSEMENT_PRIME_N} €, est enregistrée comme ci-dessous. Identifier la nature de l'erreur.`,
      proposedEntry: [
        {
          accountNumber: "6272",
          accountLabel: "Commissions et frais sur émission d'emprunts",
          debit: AMORTISSEMENT_PRIME_N,
          credit: 0,
          lineExplanation: "Charge de l'exercice."
        },
        {
          accountNumber: "169",
          accountLabel: "Primes de remboursement des obligations",
          debit: 0,
          credit: AMORTISSEMENT_PRIME_N,
          lineExplanation: "Diminution de la prime."
        }
      ],
      errorCategories: ["wrong_account", "wrong_amount", "missing_line", "no_error"],
      expectedErrorCategory: "wrong_account",
      expectedCorrection:
        "La dotation doit être portée au débit du compte 6861 « Dotations aux amortissements des primes de remboursement des obligations ». Le compte 6272 est réservé aux commissions et frais d'émission.",
      explanation:
        "La prime de remboursement est une charge financière répartie ; sa dotation ne se confond pas avec les frais d'émission, qui suivent leur propre traitement.",
      gradingRubric: [
        { label: "Catégorie d'erreur correctement identifiée", points: 6 },
        { label: "Compte 6861 nommé dans la correction", points: 4 }
      ],
      competencyTags: ["cg-emprunts-obligataires", "diagnostic-compte"],
      sourceReferences: [anchors.amortissementPrime],
      difficulty: 3
    });
  }

  return { exercises };
}

export function buildProgressiveCaseFixture(envelope: SourceEnvelope): ProgressiveCase | undefined {
  const anchors = resolveAnchors(envelope);

  if (!anchors.emissionAccounts || !anchors.casData) {
    return undefined;
  }

  const steps: ProgressiveCase["steps"] = [
    {
      id: "prime-totale",
      order: 1,
      objective: "Mesurer l'écart entre ce qui est encaissé et ce qui sera remboursé.",
      statement: `La société CSP émet ${CSP.nombreObligations} obligations de ${CSP.valeurNominale} € de nominal, au prix d'émission de ${CSP.prixEmission} €, remboursables à ${CSP.prixRemboursement} €. Calculer la prime de remboursement totale.`,
      exerciseType: "calculation",
      answerSpecification: {
        kind: "calculation",
        expectedValue: PRIME_TOTALE,
        unit: "€",
        tolerance: 0.01,
        roundingRule: "cent"
      },
      hintLevels: [
        { level: 1, hint: "Commencez par la prime d'une seule obligation." },
        { level: 2, hint: "La prime unitaire est l'écart entre les deux prix." },
        { level: 3, hint: `(${CSP.prixRemboursement} − ${CSP.prixEmission}) × ${CSP.nombreObligations}.` }
      ],
      explanation: `La prime unitaire vaut ${CSP.prixRemboursement - CSP.prixEmission} €, soit ${PRIME_TOTALE} € pour l'ensemble de l'émission.`,
      gradingRubric: [{ label: "Prime totale exacte", points: 5 }],
      sourceReferences: [anchors.casData],
      prerequisiteStepIds: []
    },
    {
      id: "dette-passif",
      order: 2,
      objective: "Déterminer le montant de la dette obligataire.",
      statement: "Déterminer le montant à porter au crédit du compte 163 lors de la souscription.",
      exerciseType: "calculation",
      answerSpecification: {
        kind: "calculation",
        expectedValue: DETTE_TOTALE,
        unit: "€",
        tolerance: 0.01,
        roundingRule: "cent"
      },
      hintLevels: [
        { level: 1, hint: "La dette n'est pas le montant encaissé." },
        { level: 2, hint: "Le compte 163 est crédité du prix de remboursement." }
      ],
      explanation: `La dette est constatée pour ce qui devra être remboursé : ${CSP.prixRemboursement} × ${CSP.nombreObligations} = ${DETTE_TOTALE} €.`,
      gradingRubric: [{ label: "Base de valorisation correcte", points: 5 }],
      sourceReferences: [anchors.emissionAccounts],
      prerequisiteStepIds: ["prime-totale"]
    },
    {
      id: "ecriture-souscription",
      order: 3,
      objective: "Traduire l'opération au journal.",
      statement: "Passer l'écriture de souscription de l'emprunt au 01/09/N.",
      exerciseType: "journal_entry",
      answerSpecification: {
        kind: "journal_entry",
        expectedLines: [
          {
            accountNumber: "4671",
            accountLabel: "Obligataires, obligations à placer",
            debit: MONTANT_EMISSION,
            credit: 0,
            lineExplanation: "Créance au prix d'émission."
          },
          {
            accountNumber: "169",
            accountLabel: "Primes de remboursement des obligations",
            debit: PRIME_TOTALE,
            credit: 0,
            lineExplanation: "Prime de remboursement."
          },
          {
            accountNumber: "163",
            accountLabel: "Autres emprunts obligataires",
            debit: 0,
            credit: DETTE_TOTALE,
            lineExplanation: "Dette au prix de remboursement."
          }
        ]
      },
      hintLevels: [
        { level: 1, hint: "Trois comptes interviennent." },
        { level: 2, hint: "La prime comble l'écart entre le débit du 4671 et le crédit du 163." }
      ],
      explanation:
        "L'écriture s'équilibre parce que la prime comble exactement l'écart entre le montant encaissé et la dette constatée.",
      gradingRubric: [
        { label: "Trois comptes corrects", points: 6 },
        { label: "Écriture équilibrée", points: 4 }
      ],
      sourceReferences: [anchors.emissionAccounts],
      prerequisiteStepIds: ["prime-totale", "dette-passif"]
    }
  ];

  if (anchors.amortissementPrime) {
    steps.push({
      id: "amortissement-prime",
      order: 4,
      objective: "Rattacher à l'exercice la fraction de prime qui lui revient.",
      statement: `Au 31/12/N, calculer la dotation à l'amortissement de la prime, en linéaire sur les ${CSP.dureeMois} mois de l'emprunt émis le 01/09/N.`,
      exerciseType: "calculation",
      answerSpecification: {
        kind: "calculation",
        expectedValue: AMORTISSEMENT_PRIME_N,
        unit: "€",
        tolerance: 0.01,
        roundingRule: "cent"
      },
      hintLevels: [
        { level: 1, hint: "Combien de mois se sont écoulés depuis l'émission ?" },
        { level: 2, hint: `${CSP.moisEcoulesN} mois sur ${CSP.dureeMois}.` }
      ],
      explanation: `${PRIME_TOTALE} × ${CSP.moisEcoulesN} / ${CSP.dureeMois} = ${AMORTISSEMENT_PRIME_N} €, portés au débit du compte 6861.`,
      gradingRubric: [
        { label: "Prorata correct", points: 5 },
        { label: "Compte 6861 identifié", points: 3 }
      ],
      sourceReferences: [anchors.amortissementPrime],
      prerequisiteStepIds: ["prime-totale"]
    });
  }

  return {
    title: "Dossier CSP — émission et inventaire d'un emprunt obligataire",
    context: `La société CSP, qui clôture ses comptes au 31/12, a procédé le 01/09/N à l'émission d'un emprunt obligataire afin de refinancer une échéance à venir. Vous effectuez un stage à sa direction financière et devez traiter l'opération, de la souscription aux écritures d'inventaire.`,
    sharedData: [
      { label: "Nombre d'obligations", value: `${CSP.nombreObligations}` },
      { label: "Valeur nominale", value: `${CSP.valeurNominale} €` },
      { label: "Prix d'émission", value: `${CSP.prixEmission} €` },
      { label: "Prix de remboursement", value: `${CSP.prixRemboursement} €` },
      { label: "Date d'émission", value: "01/09/N" },
      { label: "Durée", value: `${CSP.dureeMois} mois` }
    ],
    steps,
    competencyTags: ["cg-emprunts-obligataires", "cycle-emission-inventaire"],
    finalSynthesis:
      "L'emprunt obligataire figure au passif pour son prix de remboursement. L'écart avec le montant encaissé, isolé au compte 169, est une charge financière répartie que l'entreprise amortit sur la durée de l'emprunt. Les frais d'émission suivent un traitement distinct, en charges ou étalés, selon l'option retenue et de façon permanente.",
    sourceReferences: [anchors.emissionAccounts, anchors.casData],
    difficulty: 3,
    estimatedMinutes: 45
  };
}
