import { z } from "zod";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Fiche de révision « 2.0 ».
 *
 * Chaque règle essentielle et chaque formule portent leurs propres références :
 * une fiche dont seule l'en-tête serait sourcée laisserait passer une règle
 * inventée au milieu d'un texte par ailleurs correct.
 */

export const essentialRuleSchema = z.object({
  statement: z.string().min(10).max(600),
  /** Pourquoi la règle est ainsi, quand les sources l'expliquent. */
  rationale: z.string().max(800).optional(),
  sourceReferences: z.array(sourceReferenceSchema).min(1, "chaque règle doit citer sa source")
});

export type EssentialRule = z.infer<typeof essentialRuleSchema>;

export const accountEntrySchema = z.object({
  /** Numéro PCG tel qu'il figure dans la source, sans reformatage. */
  accountNumber: z.string().regex(/^\d{2,8}$/, "numéro de compte PCG attendu (2 à 8 chiffres)"),
  label: z.string().min(2).max(200),
  usage: z.string().min(5).max(500),
  side: z.enum(["debit", "credit", "both"]),
  sourceReferences: z.array(sourceReferenceSchema).min(1)
});

export type AccountEntry = z.infer<typeof accountEntrySchema>;

export const variableDefinitionSchema = z.object({
  symbol: z.string().min(1).max(40),
  meaning: z.string().min(3).max(300),
  unit: z.string().max(40).optional()
});

export const roundingRules = ["none", "cent", "unit", "two-decimals"] as const;
export type RoundingRule = (typeof roundingRules)[number];
export const roundingRuleSchema = z.enum(roundingRules);

export const formulaSchema = z.object({
  name: z.string().min(3).max(200),
  /** Expression lisible par un humain — jamais évaluée par le code. */
  expression: z.string().min(3).max(400),
  variableDefinitions: z.array(variableDefinitionSchema).min(1),
  unit: z.string().max(40),
  roundingRule: roundingRuleSchema,
  sourceReferences: z.array(sourceReferenceSchema).min(1, "chaque formule doit citer sa source")
});

export type Formula = z.infer<typeof formulaSchema>;

export const timelineStepSchema = z.object({
  order: z.number().int().min(1),
  moment: z.string().min(3).max(200),
  action: z.string().min(5).max(600),
  accountsInvolved: z.array(z.string().regex(/^\d{2,8}$/)).default([]),
  sourceReferences: z.array(sourceReferenceSchema).min(1)
});

export type TimelineStep = z.infer<typeof timelineStepSchema>;

/** Les sept temps d'un exemple résolu, dans l'ordre où on les enseigne. */
export const workedExampleStepKinds = [
  "understand",
  "data",
  "rule",
  "calculation",
  "entry",
  "result",
  "justification"
] as const;

export const workedExampleStepSchema = z.object({
  kind: z.enum(workedExampleStepKinds),
  title: z.string().min(3).max(200),
  content: z.string().min(5).max(2000)
});

export const workedExampleSchema = z.object({
  title: z.string().min(3).max(200),
  steps: z.array(workedExampleStepSchema).min(3),
  sourceReferences: z.array(sourceReferenceSchema).min(1)
});

export type WorkedExample = z.infer<typeof workedExampleSchema>;

export const commonMistakeSchema = z.object({
  mistake: z.string().min(5).max(500),
  correction: z.string().min(5).max(600),
  sourceReferences: z.array(sourceReferenceSchema).min(1)
});

export const activeRecallQuestionSchema = z.object({
  question: z.string().min(10).max(400),
  answer: z.string().min(1).max(600),
  sourceReferences: z.array(sourceReferenceSchema).min(1)
});

export const smartRevisionSheetSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug en minuscules, chiffres et tirets"),
  chapter: z.string().min(3).max(200),
  learningObjective: z.string().min(10).max(600),
  prerequisites: z.array(z.string().min(3).max(200)).default([]),
  essentialRules: z.array(essentialRuleSchema).min(1, "une fiche sans règle essentielle n'enseigne rien"),
  /**
   * Ces trois listes peuvent être vides *uniquement* si les sources ne
   * permettent pas de les renseigner. Le moteur de validation émet alors un
   * avertissement, jamais une erreur : mieux vaut une fiche honnêtement
   * incomplète qu'une fiche complétée de mémoire.
   */
  accountMap: z.array(accountEntrySchema).default([]),
  formulas: z.array(formulaSchema).default([]),
  timelineSteps: z.array(timelineStepSchema).default([]),
  workedExample: workedExampleSchema,
  commonMistakes: z.array(commonMistakeSchema).default([]),
  activeRecallQuestions: z.array(activeRecallQuestionSchema).min(1),
  summary: z.string().min(20).max(2000),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  difficulty: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().min(1).max(240)
});

export type SmartRevisionSheet = z.infer<typeof smartRevisionSheetSchema>;
