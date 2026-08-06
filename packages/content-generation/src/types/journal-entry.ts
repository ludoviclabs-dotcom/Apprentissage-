import { z } from "zod";
import { competencyTagsSchema, rubricItemSchema } from "./calculation";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Exercice d'écriture comptable.
 *
 * L'équilibre et la cohérence des lignes ne sont pas demandés au générateur :
 * ils sont recalculés par le moteur de validation. Une écriture déséquilibrée
 * n'atteint jamais la file de revue.
 */

export const journalLineSchema = z
  .object({
    accountNumber: z.string().regex(/^\d{2,8}$/, "numéro de compte PCG attendu (2 à 8 chiffres)"),
    accountLabel: z.string().min(2).max(200),
    debit: z.number().min(0).finite(),
    credit: z.number().min(0).finite(),
    lineExplanation: z.string().min(3).max(600)
  })
  .refine((line) => !(line.debit > 0 && line.credit > 0), {
    message: "une ligne ne peut pas être simultanément au débit et au crédit"
  })
  .refine((line) => line.debit > 0 || line.credit > 0, {
    message: "une ligne doit porter un montant au débit ou au crédit"
  });

export type JournalLine = z.infer<typeof journalLineSchema>;

export const journalEntryExerciseSchema = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(20).max(4000),
  /** Date de l'opération telle qu'elle figure dans l'énoncé (ISO ou notation « 01/09/N »). */
  operationDate: z.string().min(1).max(40),
  contextualData: z.array(
    z.object({
      label: z.string().min(2).max(200),
      value: z.string().min(1).max(200)
    })
  ).default([]),
  expectedLines: z.array(journalLineSchema).min(2, "une écriture comporte au moins deux lignes"),
  requiredAccounts: z.array(z.string().regex(/^\d{2,8}$/)).min(1),
  /** Comptes acceptés en variante (plans de comptes d'entreprise différents). */
  allowedAlternativeAccounts: z.array(z.string().regex(/^\d{2,8}$/)).default([]),
  expectedTotalDebit: z.number().min(0).finite(),
  expectedTotalCredit: z.number().min(0).finite(),
  gradingRubric: z.array(rubricItemSchema).min(1),
  competencyTags: competencyTagsSchema,
  explanation: z.string().min(20).max(2000),
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  difficulty: z.number().int().min(1).max(5)
});

export type JournalEntryExercise = z.infer<typeof journalEntryExerciseSchema>;

export const journalEntryBatchSchema = z.object({
  exercises: z.array(journalEntryExerciseSchema).min(1)
});

export type JournalEntryBatch = z.infer<typeof journalEntryBatchSchema>;
