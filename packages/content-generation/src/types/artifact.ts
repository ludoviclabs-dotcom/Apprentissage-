import { z } from "zod";
import { calculationExerciseSchema } from "./calculation";
import { errorDiagnosisExerciseSchema } from "./error-diagnosis";
import { generatedFlashcardSchema } from "./flashcard";
import { journalEntryExerciseSchema } from "./journal-entry";
import { contentDraftEnvelopeSchema } from "./metadata";
import { progressiveCaseSchema } from "./progressive-case";
import { smartRevisionSheetSchema } from "./smart-revision-sheet";

/**
 * Le contenu d'un brouillon, discriminé par son type.
 *
 * Un brouillon porte exactement un contenu : une fiche, *une* carte, *un*
 * exercice. Les lots produits par la génération sont éclatés en brouillons
 * unitaires, parce que la revue se fait carte par carte — approuver quinze
 * cartes d'un bloc reviendrait à n'en relire aucune.
 */

export const contentTypes = [
  "smart_revision_sheet",
  "flashcard",
  "calculation_exercise",
  "journal_entry_exercise",
  "error_diagnosis_exercise",
  "progressive_case"
] as const;

export type ContentType = (typeof contentTypes)[number];

export const contentTypeSchema = z.enum(contentTypes);

export const contentPayloadSchema = z.discriminatedUnion("contentType", [
  z.object({ contentType: z.literal("smart_revision_sheet"), content: smartRevisionSheetSchema }),
  z.object({ contentType: z.literal("flashcard"), content: generatedFlashcardSchema }),
  z.object({ contentType: z.literal("calculation_exercise"), content: calculationExerciseSchema }),
  z.object({ contentType: z.literal("journal_entry_exercise"), content: journalEntryExerciseSchema }),
  z.object({ contentType: z.literal("error_diagnosis_exercise"), content: errorDiagnosisExerciseSchema }),
  z.object({ contentType: z.literal("progressive_case"), content: progressiveCaseSchema })
]);

export type ContentPayload = z.infer<typeof contentPayloadSchema>;

export const contentDraftSchema = z.intersection(contentDraftEnvelopeSchema, contentPayloadSchema);

export type ContentDraft = z.infer<typeof contentDraftSchema>;

/** Libellés destinés à l'interface de revue — jamais les valeurs brutes à l'écran. */
export const contentTypeLabels: Record<ContentType, string> = {
  smart_revision_sheet: "Fiche de révision",
  flashcard: "Flashcard",
  calculation_exercise: "Exercice de calcul",
  journal_entry_exercise: "Écriture comptable",
  error_diagnosis_exercise: "Diagnostic d'erreur",
  progressive_case: "Mini-cas progressif"
};

/**
 * Toutes les références d'un contenu, quel que soit son type — les schémas les
 * répartissent différemment (au niveau de chaque règle, de chaque étape…), et
 * le moteur de validation doit toutes les vérifier.
 */
export function collectSourceReferences(payload: ContentPayload): Array<{ path: string; reference: unknown }> {
  const found: Array<{ path: string; reference: unknown }> = [];

  function walk(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (value === null || typeof value !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "sourceReferences" && Array.isArray(child)) {
        child.forEach((reference, index) => {
          found.push({ path: `${path}.sourceReferences[${index}]`, reference });
        });
        continue;
      }

      walk(child, path ? `${path}.${key}` : key);
    }
  }

  walk(payload.content, "content");
  return found;
}
