import { z } from "zod";
import { sourceReferenceSchema } from "./source-reference";

/**
 * Flashcard générée.
 *
 * Le type reprend les champs de `Flashcard` du domaine (front, back,
 * explanation, type, sourceReferences) et ajoute ce qu'un brouillon doit porter
 * et qu'une carte publiée n'a pas : l'objectif visé et le constat d'atomicité.
 * Les champs d'ordonnancement (`status`, `dueAt`, `intervalDays`) sont
 * délibérément absents : une carte non publiée n'a pas de place dans une file de
 * révision.
 */

export const generatedFlashcardTypes = [
  "concept",
  "formula",
  "account",
  "distinction",
  "common_error",
  "diagnostic"
] as const;

export type GeneratedFlashcardType = (typeof generatedFlashcardTypes)[number];

export const generatedFlashcardTypeSchema = z.enum(generatedFlashcardTypes);

export const FLASHCARD_FRONT_MIN = 20;
export const FLASHCARD_FRONT_MAX = 300;
export const FLASHCARD_BACK_MIN = 1;
export const FLASHCARD_BACK_MAX = 800;
export const FLASHCARD_EXPLANATION_MAX = 1500;

/**
 * Constat d'atomicité rendu par le générateur, puis re-vérifié par le code.
 * On demande à l'IA de se prononcer *et* on recompte : une carte annoncée
 * atomique mais qui pose trois questions est signalée par le moteur, pas crue
 * sur parole.
 */
export const atomicityCheckSchema = z.object({
  /** Nombre de connaissances distinctes que la carte teste, selon le générateur. */
  testedFactCount: z.number().int().min(1),
  singleFocus: z.boolean(),
  justification: z.string().min(5).max(500)
});

export type AtomicityCheck = z.infer<typeof atomicityCheckSchema>;

export const generatedFlashcardSchema = z.object({
  type: generatedFlashcardTypeSchema,
  front: z.string().min(FLASHCARD_FRONT_MIN).max(FLASHCARD_FRONT_MAX),
  back: z.string().min(FLASHCARD_BACK_MIN).max(FLASHCARD_BACK_MAX),
  explanation: z.string().min(10).max(FLASHCARD_EXPLANATION_MAX),
  learningObjective: z.string().min(10).max(400),
  sourceReferences: z.array(sourceReferenceSchema).min(1, "une carte sans source est inexploitable"),
  difficulty: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1).max(60)).default([]),
  relatedConceptIds: z.array(z.string().min(1)).default([]),
  atomicityCheck: atomicityCheckSchema
});

export type GeneratedFlashcard = z.infer<typeof generatedFlashcardSchema>;

export const flashcardBatchSchema = z.object({
  cards: z.array(generatedFlashcardSchema).min(1)
});

export type FlashcardBatch = z.infer<typeof flashcardBatchSchema>;
