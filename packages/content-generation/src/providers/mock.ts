import type { GenerationMode } from "../types/metadata";
import {
  buildCalculationFixture,
  buildErrorDiagnosisFixture,
  buildFlashcardFixture,
  buildJournalEntryFixture,
  buildProgressiveCaseFixture,
  buildSheetFixture
} from "./pilot-fixtures";
import type { ContentGenerationProvider, GenerationRequest, GenerationResult } from "./types";

/**
 * Provider mock — le mode par défaut.
 *
 * Il ne joint aucun service : il applique une fixture ancrée sur l'enveloppe
 * réelle, puis la fait passer par le même schéma Zod que le mode live. Une
 * fixture invalide échoue donc exactement comme échouerait une sortie de modèle,
 * ce qui rend le chemin de validation testable sans clé d'API.
 */
export class MockContentProvider implements ContentGenerationProvider {
  readonly name = "mock";
  readonly model = "fixture-comptabilite-approfondie.v1";
  readonly mode: GenerationMode = "mock";

  async generateStructuredContent<T>(request: GenerationRequest<T>): Promise<GenerationResult<T>> {
    const fixture = this.buildFixture(request);

    if (fixture === undefined) {
      return {
        ok: false,
        error:
          `aucune fixture disponible pour « ${request.prompt.id} » sur le chapitre « ${request.envelope.chapterSlug} » : ` +
          "les sources ne couvrent pas ce type de contenu, ou le chapitre n'a pas de fixture pilote",
        model: this.model,
        mode: this.mode,
        repairAttempts: 0
      };
    }

    const parsed = request.schema.safeParse(fixture);

    if (!parsed.success) {
      return {
        ok: false,
        error: `la fixture ne respecte pas son schéma : ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
          .join(" ; ")}`,
        model: this.model,
        mode: this.mode,
        repairAttempts: 0
      };
    }

    return { ok: true, data: parsed.data, model: this.model, mode: this.mode, repairAttempts: 0 };
  }

  private buildFixture(request: GenerationRequest<unknown>): unknown {
    switch (request.prompt.id) {
      case "smart-revision-sheet":
        return buildSheetFixture(request.envelope);
      case "flashcard-atomic":
        return buildFlashcardFixture(request.envelope);
      case "calculation-exercise":
        return buildCalculationFixture(request.envelope);
      case "journal-entry":
        return buildJournalEntryFixture(request.envelope);
      case "error-diagnosis":
        return buildErrorDiagnosisFixture(request.envelope);
      case "progressive-case":
        return buildProgressiveCaseFixture(request.envelope);
      default:
        return undefined;
    }
  }
}
