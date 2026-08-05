import { z } from "zod";
import { journalLineSchema } from "./journal-entry";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Diagnostic d'erreur : on montre à l'apprenant une réponse ou une écriture
 * fausse, il doit nommer la nature de l'erreur.
 *
 * La notation automatique porte uniquement sur la catégorie choisie ; la
 * correction rédigée par l'apprenant n'est pas notée par le code dans cette
 * version, et le schéma le dit explicitement plutôt que de laisser croire à une
 * évaluation qui n'existe pas.
 */

export const errorCategories = [
  "wrong_account",
  "wrong_debit_credit_direction",
  "wrong_amount",
  "wrong_formula",
  "missing_line",
  "wrong_date",
  "wrong_valuation_basis",
  "double_counting",
  "no_error"
] as const;

export type DiagnosisErrorCategory = (typeof errorCategories)[number];

export const errorCategorySchema = z.enum(errorCategories);

export const errorDiagnosisExerciseSchema = z
  .object({
    title: z.string().min(3).max(200),
    scenario: z.string().min(20).max(3000),
    /** Réponse fautive proposée : soit un texte, soit une écriture, jamais les deux. */
    proposedAnswer: z.string().min(1).max(2000).optional(),
    proposedEntry: z.array(journalLineSchema).min(1).optional(),
    /** Choix offerts à l'apprenant ; doit contenir la bonne réponse. */
    errorCategories: z.array(errorCategorySchema).min(2),
    expectedErrorCategory: errorCategorySchema,
    expectedCorrection: z.string().min(10).max(2000),
    explanation: z.string().min(20).max(2000),
    sourceReferences: z.array(sourceReferenceSchema).min(1),
    difficulty: z.number().int().min(1).max(5)
  })
  .refine((exercise) => exercise.proposedAnswer !== undefined || exercise.proposedEntry !== undefined, {
    message: "un diagnostic doit proposer soit une réponse, soit une écriture à examiner"
  })
  .refine((exercise) => exercise.errorCategories.includes(exercise.expectedErrorCategory), {
    message: "la catégorie attendue doit figurer parmi les choix proposés",
    path: ["expectedErrorCategory"]
  })
  .refine((exercise) => new Set(exercise.errorCategories).size === exercise.errorCategories.length, {
    message: "les catégories proposées ne peuvent pas contenir de doublon",
    path: ["errorCategories"]
  });

export type ErrorDiagnosisExercise = z.infer<typeof errorDiagnosisExerciseSchema>;

export const errorDiagnosisBatchSchema = z.object({
  exercises: z.array(errorDiagnosisExerciseSchema).min(1)
});

export type ErrorDiagnosisBatch = z.infer<typeof errorDiagnosisBatchSchema>;
