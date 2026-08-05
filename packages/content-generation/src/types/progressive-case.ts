import { z } from "zod";
import { rubricItemSchema } from "./calculation";
import { errorCategorySchema } from "./error-diagnosis";
import { journalLineSchema } from "./journal-entry";
import { roundingRuleSchema } from "./smart-revision-sheet";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Mini-cas progressif : une situation unique, traitée en étapes qui
 * s'enchaînent. Les dépendances entre étapes sont déclarées (`prerequisiteStepIds`)
 * et le moteur vérifie qu'elles forment bien un ordre — pas de cycle, pas de
 * renvoi à une étape ultérieure.
 */

export const caseStepTypes = ["calculation", "journal_entry", "error_diagnosis", "short_answer"] as const;
export type CaseStepType = (typeof caseStepTypes)[number];

/**
 * Spécification de réponse, discriminée par le type d'étape : une étape de
 * calcul ne peut pas décrire sa réponse comme une écriture comptable.
 */
export const answerSpecificationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("calculation"),
    expectedValue: z.number().finite(),
    unit: z.string().min(1).max(40),
    tolerance: z.number().min(0).max(1000),
    roundingRule: roundingRuleSchema
  }),
  z.object({
    kind: z.literal("journal_entry"),
    expectedLines: z.array(journalLineSchema).min(2)
  }),
  z.object({
    kind: z.literal("error_diagnosis"),
    expectedErrorCategory: errorCategorySchema,
    expectedCorrection: z.string().min(5).max(1500)
  }),
  z.object({
    kind: z.literal("short_answer"),
    expectedPoints: z.array(z.string().min(3).max(400)).min(1)
  })
]);

export type AnswerSpecification = z.infer<typeof answerSpecificationSchema>;

export const hintLevelSchema = z.object({
  level: z.number().int().min(1).max(3),
  hint: z.string().min(5).max(600)
});

export const progressiveCaseStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "identifiant d'étape en minuscules, chiffres et tirets"),
  order: z.number().int().min(1),
  objective: z.string().min(10).max(400),
  statement: z.string().min(20).max(3000),
  exerciseType: z.enum(caseStepTypes),
  answerSpecification: answerSpecificationSchema,
  /** Indices de plus en plus explicites, du niveau 1 au niveau 3. */
  hintLevels: z.array(hintLevelSchema).default([]),
  explanation: z.string().min(10).max(2000),
  gradingRubric: z.array(rubricItemSchema).min(1),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  prerequisiteStepIds: z.array(z.string()).default([])
});

export type ProgressiveCaseStep = z.infer<typeof progressiveCaseStepSchema>;

export const progressiveCaseSchema = z.object({
  title: z.string().min(3).max(200),
  context: z.string().min(20).max(4000),
  /** Données communes à toutes les étapes, énoncées une seule fois. */
  sharedData: z.array(
    z.object({
      label: z.string().min(2).max(200),
      value: z.string().min(1).max(200)
    })
  ).default([]),
  steps: z.array(progressiveCaseStepSchema).min(2, "un mini-cas comporte au moins deux étapes"),
  finalSynthesis: z.string().min(20).max(2000),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  difficulty: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().min(1).max(240)
});

export type ProgressiveCase = z.infer<typeof progressiveCaseSchema>;
