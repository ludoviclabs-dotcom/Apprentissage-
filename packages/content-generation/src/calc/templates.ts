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
