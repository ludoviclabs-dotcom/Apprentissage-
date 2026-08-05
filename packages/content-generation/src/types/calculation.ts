import { z } from "zod";
import { CALCULATION_TEMPLATE_IDS, isKnownTemplate } from "../calc/templates";
import { roundingRuleSchema } from "./smart-revision-sheet";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Exercice de calcul.
 *
 * `formulaTemplateId` désigne une entrée du registre fermé
 * (`src/calc/templates.ts`) : le générateur choisit un calcul, il n'en écrit
 * jamais un. `expectedAnswer` est ensuite **recalculé par le code** et comparé —
 * une divergence bascule le contenu en `validation_failed` sans correction
 * silencieuse.
 */

export const calculationVariableSchema = z.object({
  name: z.string().min(1).max(60),
  label: z.string().min(2).max(200),
  value: z.number().finite(),
  unit: z.string().max(40),
  /** Où la donnée figure dans l'énoncé source, pour que le relecteur la retrouve. */
  providedInStatement: z.boolean().default(true)
});

export type CalculationVariable = z.infer<typeof calculationVariableSchema>;

export const calculationStepSchema = z.object({
  order: z.number().int().min(1),
  description: z.string().min(5).max(600),
  /** Expression lisible affichée à l'apprenant ; jamais évaluée. */
  expression: z.string().max(400).optional(),
  intermediateResult: z.number().finite().optional()
});

export const rubricItemSchema = z.object({
  label: z.string().min(3).max(300),
  points: z.number().min(0).max(100)
});

export const calculationExerciseSchema = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(20).max(4000),
  variables: z.array(calculationVariableSchema).min(1),
  expectedAnswer: z.number().finite(),
  unit: z.string().min(1).max(40),
  /** Écart absolu toléré. Zéro exigerait une égalité flottante exacte. */
  tolerance: z.number().min(0).max(1000),
  roundingRule: roundingRuleSchema,
  formulaTemplateId: z
    .string()
    .min(1)
    .refine(isKnownTemplate, {
      message: `template de calcul inconnu — autorisés : ${CALCULATION_TEMPLATE_IDS.join(", ")}`
    }),
  /**
   * Entrées passées au template, par nom. Le moteur vérifie qu'elles
   * correspondent aux variables de l'énoncé et aux entrées déclarées.
   */
  templateInputs: z.record(z.string(), z.number().finite()),
  calculationSteps: z.array(calculationStepSchema).min(1),
  explanation: z.string().min(20).max(2000),
  gradingRubric: z.array(rubricItemSchema).min(1),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  difficulty: z.number().int().min(1).max(5)
});

export type CalculationExercise = z.infer<typeof calculationExerciseSchema>;

export const calculationBatchSchema = z.object({
  exercises: z.array(calculationExerciseSchema).min(1)
});

export type CalculationBatch = z.infer<typeof calculationBatchSchema>;
