import type { RoundingRule } from "../types/smart-revision-sheet";

/**
 * Registre fermé et versionné des calculs autorisés.
 *
 * C'est le garde-fou central des exercices numériques : le générateur ne peut
 * pas écrire une expression, il peut seulement désigner un identifiant de ce
 * registre et fournir des entrées nommées. La surface d'expression est donc
 * nulle — il n'y a ni `eval`, ni `Function`, ni parseur à sécuriser, parce
 * qu'il n'y a rien à parser.
 *
 * Ajouter un calcul est une modification de code, relue comme telle. Modifier
 * le comportement d'un template existant impose de publier une `v2` : les
 * brouillons déjà générés continuent de désigner la `v1` et gardent le sens
 * qu'ils avaient au moment de leur validation.
 */

export interface TemplateInput {
  name: string;
  meaning: string;
  unit: string;
  /** Refuse les entrées absurdes avant même le calcul (nombre d'obligations < 0…). */
  min?: number;
  max?: number;
}

export type ComputeResult = { ok: true; value: number } | { ok: false; error: string };

export interface CalculationTemplate {
  id: string;
  version: string;
  label: string;
  description: string;
  inputs: readonly TemplateInput[];
  unit: string;
  defaultRounding: RoundingRule;
  compute(inputs: Readonly<Record<string, number>>): ComputeResult;
}

function divide(numerator: number, denominator: number, label: string): ComputeResult {
  if (denominator === 0) {
    return { ok: false, error: `division par zéro : ${label}` };
  }
  return { ok: true, value: numerator / denominator };
}

const TEMPLATE_LIST: readonly CalculationTemplate[] = [
  {
    id: "coupon-annuel-unitaire",
    version: "v1",
    label: "Coupon annuel d'une obligation",
    description: "Intérêt annuel servi à une obligation : valeur nominale × taux d'intérêt.",
    inputs: [
      { name: "valeurNominale", meaning: "valeur nominale d'une obligation", unit: "€", min: 0 },
      { name: "tauxInteret", meaning: "taux d'intérêt annuel (0,045 pour 4,5 %)", unit: "ratio", min: 0, max: 1 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ valeurNominale, tauxInteret }) => ({ ok: true, value: valeurNominale * tauxInteret })
  },
  {
    id: "coupon-annuel-total",
    version: "v1",
    label: "Coupon annuel de l'emprunt",
    description: "Intérêt annuel de l'ensemble des obligations en circulation.",
    inputs: [
      { name: "couponUnitaire", meaning: "coupon annuel d'une obligation", unit: "€", min: 0 },
      { name: "nombreObligations", meaning: "nombre d'obligations en circulation", unit: "titres", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ couponUnitaire, nombreObligations }) => ({
      ok: true,
      value: couponUnitaire * nombreObligations
    })
  },
  {
    id: "prime-remboursement-unitaire",
    version: "v1",
    label: "Prime de remboursement d'une obligation",
    description: "Écart entre le prix de remboursement et le prix d'émission d'une obligation.",
    inputs: [
      { name: "prixRemboursement", meaning: "prix de remboursement d'une obligation", unit: "€", min: 0 },
      { name: "prixEmission", meaning: "prix d'émission d'une obligation", unit: "€", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ prixRemboursement, prixEmission }) => ({
      ok: true,
      value: prixRemboursement - prixEmission
    })
  },
  {
    id: "prime-remboursement-totale",
    version: "v1",
    label: "Prime de remboursement totale",
    description:
      "Prime de remboursement de l'emprunt entier : (prix de remboursement − prix d'émission) × nombre d'obligations.",
    inputs: [
      { name: "prixRemboursement", meaning: "prix de remboursement d'une obligation", unit: "€", min: 0 },
      { name: "prixEmission", meaning: "prix d'émission d'une obligation", unit: "€", min: 0 },
      { name: "nombreObligations", meaning: "nombre d'obligations émises", unit: "titres", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ prixRemboursement, prixEmission, nombreObligations }) => ({
      ok: true,
      value: (prixRemboursement - prixEmission) * nombreObligations
    })
  },
  {
    id: "montant-emission-total",
    version: "v1",
    label: "Montant total encaissé à l'émission",
    description: "Prix d'émission × nombre d'obligations, avant déduction des frais.",
    inputs: [
      { name: "prixEmission", meaning: "prix d'émission d'une obligation", unit: "€", min: 0 },
      { name: "nombreObligations", meaning: "nombre d'obligations émises", unit: "titres", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ prixEmission, nombreObligations }) => ({ ok: true, value: prixEmission * nombreObligations })
  },
  {
    id: "dette-remboursement-totale",
    version: "v1",
    label: "Dette inscrite au passif",
    description:
      "Prix de remboursement × nombre d'obligations : le montant porté au crédit du compte d'emprunt obligataire.",
    inputs: [
      { name: "prixRemboursement", meaning: "prix de remboursement d'une obligation", unit: "€", min: 0 },
      { name: "nombreObligations", meaning: "nombre d'obligations émises", unit: "titres", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ prixRemboursement, nombreObligations }) => ({
      ok: true,
      value: prixRemboursement * nombreObligations
    })
  },
  {
    id: "prorata-temporis-mois",
    version: "v1",
    label: "Prorata temporis en mois",
    description: "Fraction d'un montant annuel rattachée à un nombre de mois écoulés.",
    inputs: [
      { name: "montantAnnuel", meaning: "montant sur douze mois", unit: "€" },
      { name: "moisEcoules", meaning: "mois écoulés sur la période", unit: "mois", min: 0, max: 12 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantAnnuel, moisEcoules }) => ({ ok: true, value: (montantAnnuel * moisEcoules) / 12 })
  },
  {
    id: "interets-courus",
    version: "v1",
    label: "Intérêts courus à la clôture",
    description:
      "Intérêts rattachés à l'exercice entre la dernière échéance et la clôture, au prorata des mois écoulés.",
    inputs: [
      { name: "couponAnnuelTotal", meaning: "coupon annuel de l'emprunt", unit: "€", min: 0 },
      { name: "moisEcoules", meaning: "mois écoulés depuis la date de jouissance ou la dernière échéance", unit: "mois", min: 0, max: 12 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ couponAnnuelTotal, moisEcoules }) => ({
      ok: true,
      value: (couponAnnuelTotal * moisEcoules) / 12
    })
  },
  {
    id: "amortissement-lineaire-periode",
    version: "v1",
    label: "Amortissement linéaire sur la durée",
    description:
      "Fraction d'un montant étalé linéairement sur la durée de l'emprunt, au prorata des mois écoulés. Sert aux primes de remboursement comme aux frais d'émission.",
    inputs: [
      { name: "montantAEtaler", meaning: "montant total à étaler (prime ou frais)", unit: "€", min: 0 },
      { name: "dureeMois", meaning: "durée de l'emprunt en mois", unit: "mois", min: 1 },
      { name: "moisEcoules", meaning: "mois écoulés sur l'exercice", unit: "mois", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantAEtaler, dureeMois, moisEcoules }) => {
      if (moisEcoules > dureeMois) {
        return { ok: false, error: "moisEcoules dépasse la durée de l'emprunt" };
      }
      return divide(montantAEtaler * moisEcoules, dureeMois, "durée de l'emprunt nulle");
    }
  },
  {
    id: "amortissement-prorata-interets",
    version: "v1",
    label: "Amortissement au prorata des intérêts courus",
    description:
      "Fraction d'un montant étalé proportionnellement aux intérêts courus rapportés aux intérêts totaux de l'emprunt.",
    inputs: [
      { name: "montantAEtaler", meaning: "montant total à étaler (prime ou frais)", unit: "€", min: 0 },
      { name: "interetsCourus", meaning: "intérêts courus sur la période", unit: "€", min: 0 },
      { name: "interetsTotaux", meaning: "intérêts totaux sur la durée de l'emprunt", unit: "€", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantAEtaler, interetsCourus, interetsTotaux }) => {
      if (interetsCourus > interetsTotaux) {
        return { ok: false, error: "interetsCourus dépasse interetsTotaux" };
      }
      return divide(montantAEtaler * interetsCourus, interetsTotaux, "intérêts totaux nuls");
    }
  },
  {
    id: "frais-emission-nets-encaisses",
    version: "v1",
    label: "Fonds nets encaissés",
    description: "Montant d'émission diminué des frais retenus par la banque.",
    inputs: [
      { name: "montantEmission", meaning: "montant total d'émission", unit: "€", min: 0 },
      { name: "fraisEmission", meaning: "frais d'émission retenus", unit: "€", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantEmission, fraisEmission }) => ({ ok: true, value: montantEmission - fraisEmission })
  },

  // --- Calculs transverses ---------------------------------------------------
  //
  // CE QUI LES SÉPARE DES ONZE PRÉCÉDENTS. Les templates ci-dessus nomment leurs
  // entrées d'après le chapitre qui les a fait naître — `valeurNominale`,
  // `nombreObligations`, `couponAnnuelTotal`. Ce n'était pas un défaut tant qu'un
  // seul chapitre existait ; ça l'est devenu quand trois autres ont eu besoin des
  // mêmes formes de calcul sous d'autres noms. Le moteur confronte
  // `templateInputs` aux variables déclarées de l'énoncé : un pourcentage
  // d'avancement passé dans une entrée appelée `tauxInteret` produirait un
  // exercice juste dans son résultat et faux dans sa lecture.
  //
  // Ceux qui suivent nomment donc des rôles, pas des objets comptables : un
  // montant, une quantité, un taux, une valeur unitaire. Ils servent les contrats
  // à long terme, la constitution des sociétés et les variations du capital sans
  // qu'aucun de ces chapitres n'apparaisse dans leur identifiant.
  //
  // CE QU'ILS NE FONT PAS. Ils ne composent pas. Une prime d'émission totale est
  // un écart puis un produit, une perte à terminaison ventilée est une fraction
  // puis un écart : deux exercices, deux étapes vérifiables, plutôt qu'un
  // template de plus dont la formule serait invisible au relecteur.
  {
    id: "ecart-entre-deux-montants",
    version: "v1",
    label: "Écart entre deux montants",
    description:
      "Différence entre un montant et un autre. Sert au résultat à terminaison, au bénéfice partiel, au capital restant à appeler, à l'apport net du passif pris en charge et à la valeur théorique d'un droit de souscription ou d'attribution.",
    inputs: [
      { name: "montantInitial", meaning: "montant dont on retranche", unit: "€", min: 0 },
      { name: "montantSoustrait", meaning: "montant retranché", unit: "€", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    // LE RÉSULTAT PEUT ÊTRE NÉGATIF, ET C'EST LE POINT. Un contrat déficitaire
    // dégage un résultat à terminaison négatif ; le borner à zéro effacerait
    // précisément le cas que le chapitre enseigne.
    compute: ({ montantInitial, montantSoustrait }) => ({
      ok: true,
      value: montantInitial - montantSoustrait
    })
  },
  {
    id: "produit-montant-quantite",
    version: "v1",
    label: "Montant total d'une quantité",
    description:
      "Montant unitaire multiplié par une quantité. Sert au capital social souscrit, à la prime d'émission totale à partir de la prime unitaire, et à tout total obtenu par dénombrement.",
    inputs: [
      { name: "montantUnitaire", meaning: "montant rattaché à une unité", unit: "€", min: 0 },
      { name: "quantite", meaning: "nombre d'unités", unit: "unités", min: 0 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantUnitaire, quantite }) => ({ ok: true, value: montantUnitaire * quantite })
  },
  {
    id: "fraction-d-un-montant",
    version: "v1",
    label: "Fraction d'un montant",
    description:
      "Montant multiplié par un taux compris entre 0 et 1. Sert au chiffre d'affaires reconnu à l'avancement, à la dépréciation d'un stock au prorata de l'avancement et à la fraction légalement appelée d'un capital.",
    inputs: [
      { name: "montantBase", meaning: "montant auquel le taux s'applique", unit: "€", min: 0 },
      {
        name: "taux",
        meaning: "taux exprimé en ratio (0,375 pour 37,5 %)",
        unit: "ratio",
        min: 0,
        max: 1
      }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantBase, taux }) => ({ ok: true, value: montantBase * taux })
  },
  {
    id: "taux-de-realisation",
    version: "v1",
    label: "Taux de réalisation",
    description:
      "Part réalisée rapportée au total prévu. Sert au pourcentage d'avancement d'un contrat à long terme et à toute quotité mesurée par un rapport de montants.",
    inputs: [
      { name: "montantRealise", meaning: "part déjà réalisée et acceptée", unit: "€", min: 0 },
      { name: "montantTotalPrevu", meaning: "total prévu à terminaison", unit: "€", min: 0 }
    ],
    unit: "ratio",
    defaultRounding: "none",
    compute: ({ montantRealise, montantTotalPrevu }) => {
      const quotient = divide(montantRealise, montantTotalPrevu, "montant total prévu nul");

      if (!quotient.ok) {
        return quotient;
      }

      // UN TAUX DE RÉALISATION SUPÉRIEUR À 100 % EST UNE ERREUR DE DONNÉES,
      // REFUSÉE PLUTÔT QUE PLAFONNÉE. Plafonner rendrait l'exercice juste en
      // apparence sur des entrées fausses, ce qui est exactement la correction
      // silencieuse que ce registre interdit.
      if (quotient.value > 1) {
        return {
          ok: false,
          error: `le montant réalisé (${montantRealise}) dépasse le total prévu (${montantTotalPrevu}) : un taux de réalisation supérieur à 100 % n'est pas recevable`
        };
      }

      return quotient;
    }
  },
  {
    id: "montant-unitaire-par-repartition",
    version: "v1",
    label: "Montant unitaire après répartition",
    description:
      "Montant global réparti sur un nombre d'unités. Sert à la hausse de valeur nominale obtenue en incorporant des réserves sur les actions existantes.",
    inputs: [
      { name: "montantGlobal", meaning: "montant à répartir", unit: "€", min: 0 },
      { name: "nombreUnites", meaning: "nombre d'unités entre lesquelles répartir", unit: "unités", min: 1 }
    ],
    unit: "€",
    defaultRounding: "cent",
    compute: ({ montantGlobal, nombreUnites }) =>
      divide(montantGlobal, nombreUnites, "nombre d'unités nul")
  },
  {
    id: "nombre-de-titres",
    version: "v1",
    label: "Nombre de titres à créer",
    description:
      "Montant total rapporté à la valeur unitaire d'un titre. Sert au nombre d'actions à émettre à partir des apports et du prix d'émission, des réserves incorporées et de la valeur nominale, ou d'un apport en nature et de la valeur réelle du titre.",
    inputs: [
      { name: "montantTotal", meaning: "montant total à convertir en titres", unit: "€", min: 0 },
      { name: "valeurUnitaire", meaning: "valeur d'un titre", unit: "€", min: 0 }
    ],
    unit: "titres",
    defaultRounding: "unit",
    compute: ({ montantTotal, valeurUnitaire }) => {
      const quotient = divide(montantTotal, valeurUnitaire, "valeur unitaire nulle");

      if (!quotient.ok) {
        return quotient;
      }

      // UN NOMBRE DE TITRES FRACTIONNAIRE EST REFUSÉ, PAS ARRONDI. L'arrondi à
      // l'unité est la règle de présentation du résultat ; l'employer pour
      // rattraper des données qui ne tombent pas juste masquerait une erreur
      // d'énoncé derrière un entier plausible.
      if (!Number.isInteger(quotient.value)) {
        return {
          ok: false,
          error: `le rapport ${montantTotal} / ${valeurUnitaire} ne donne pas un nombre entier de titres (${quotient.value})`
        };
      }

      return quotient;
    }
  }
] as const;

export const CALCULATION_TEMPLATES: ReadonlyMap<string, CalculationTemplate> = new Map(
  TEMPLATE_LIST.map((template) => [`${template.id}.${template.version}`, template])
);

export const CALCULATION_TEMPLATE_IDS: readonly string[] = [...CALCULATION_TEMPLATES.keys()].sort();

export function getTemplate(templateId: string): CalculationTemplate | undefined {
  return CALCULATION_TEMPLATES.get(templateId);
}

export function isKnownTemplate(templateId: string): boolean {
  return CALCULATION_TEMPLATES.has(templateId);
}

export function applyRounding(value: number, rule: RoundingRule): number {
  switch (rule) {
    case "none":
      return value;
    case "unit":
      return Math.round(value);
    case "cent":
    case "two-decimals":
      // Passage par l'entier avant division : évite qu'un flottant comme
      // 1.005 s'arrondisse vers le bas par accident de représentation.
      return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

export interface TemplateRunResult {
  ok: boolean;
  value?: number;
  rounded?: number;
  error?: string;
}

/**
 * Exécute un template avec ses entrées : présence, finitude et bornes vérifiées
 * avant l'appel, résultat arrondi selon la règle demandée. Une entrée non
 * déclarée est un échec, pas un paramètre ignoré silencieusement.
 */
export function runTemplate(
  templateId: string,
  inputs: Readonly<Record<string, number>>,
  rounding?: RoundingRule
): TemplateRunResult {
  const template = getTemplate(templateId);

  if (!template) {
    return {
      ok: false,
      error: `template de calcul inconnu : « ${templateId} » (autorisés : ${CALCULATION_TEMPLATE_IDS.join(", ")})`
    };
  }

  const declared = new Set(template.inputs.map((input) => input.name));

  for (const provided of Object.keys(inputs)) {
    if (!declared.has(provided)) {
      return { ok: false, error: `entrée « ${provided} » non déclarée par le template « ${templateId} »` };
    }
  }

  for (const input of template.inputs) {
    const value = inputs[input.name];

    if (value === undefined) {
      return { ok: false, error: `entrée « ${input.name} » manquante pour « ${templateId} »` };
    }

    if (!Number.isFinite(value)) {
      return { ok: false, error: `entrée « ${input.name} » non numérique ou infinie` };
    }

    if (input.min !== undefined && value < input.min) {
      return { ok: false, error: `entrée « ${input.name} » (${value}) inférieure au minimum ${input.min}` };
    }

    if (input.max !== undefined && value > input.max) {
      return { ok: false, error: `entrée « ${input.name} » (${value}) supérieure au maximum ${input.max}` };
    }
  }

  const result = template.compute(inputs);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!Number.isFinite(result.value)) {
    return { ok: false, error: `le calcul « ${templateId} » ne produit pas un nombre fini` };
  }

  return {
    ok: true,
    value: result.value,
    rounded: applyRounding(result.value, rounding ?? template.defaultRounding)
  };
}
