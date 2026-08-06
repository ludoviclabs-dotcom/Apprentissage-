import { createHash } from "node:crypto";
import type { z } from "zod";
import type { SourceEnvelope } from "../envelope/build";
import { CURRENT_PROMPT_VERSIONS, getPrompt } from "../prompts/registry";
import { computeInputHash, type ContentGenerationProvider, type GenerationRequest } from "../providers";
import { calculationBatchSchema } from "../types/calculation";
import { errorDiagnosisBatchSchema } from "../types/error-diagnosis";
import { flashcardBatchSchema } from "../types/flashcard";
import { journalEntryBatchSchema } from "../types/journal-entry";
import { progressiveCaseSchema } from "../types/progressive-case";
import { smartRevisionSheetSchema } from "../types/smart-revision-sheet";
import { contentTypeSchema, type ContentPayload, type ContentType } from "../types/artifact";
import type { ContentDraft } from "../types/artifact";
import type { GenerationMetadata } from "../types/metadata";
import type { CorpusIndex } from "../types/source-reference";
import { toValidationMetadata, validateContent } from "../validation/engine";

/**
 * Orchestration d'une génération.
 *
 * Un appel au générateur produit souvent un lot (quinze cartes, trois
 * exercices) ; l'orchestrateur l'éclate en brouillons unitaires, valide chacun
 * séparément, et n'attribue `needs_review` qu'aux contenus dont tous les
 * contrôles bloquants passent. Les autres naissent `validation_failed` : ils
 * existent, ils sont consultables, mais ils ne peuvent pas être approuvés.
 */

/** Les familles générables, dans l'ordre où la CLI les traite. */
export const generationKinds = [
  "sheet",
  "flashcards",
  "calculations",
  "journal_entries",
  "error_diagnoses",
  "case"
] as const;

export type GenerationKind = (typeof generationKinds)[number];

interface KindDefinition {
  promptId: string;
  contentType: ContentType;
  instruction: string;
  /** Éclate la sortie du générateur en contenus unitaires. */
  explode(data: unknown): unknown[];
}

const KIND_DEFINITIONS: Record<GenerationKind, KindDefinition> = {
  sheet: {
    promptId: "smart-revision-sheet",
    contentType: "smart_revision_sheet",
    instruction:
      "Produis une fiche de révision structurée pour ce chapitre, en t'appuyant exclusivement sur les sources fournies.",
    explode: (data) => [data]
  },
  flashcards: {
    promptId: "flashcard-atomic",
    contentType: "flashcard",
    instruction:
      "Produis entre 8 et 15 flashcards atomiques couvrant les notions du chapitre, dont 3 à 4 cartes de distinction.",
    explode: (data) => (data as { cards: unknown[] }).cards
  },
  calculations: {
    promptId: "calculation-exercise",
    contentType: "calculation_exercise",
    instruction:
      "Produis 3 à 5 exercices de calcul fondés sur les données chiffrées des énoncés sources, en utilisant uniquement les templates autorisés.",
    explode: (data) => (data as { exercises: unknown[] }).exercises
  },
  journal_entries: {
    promptId: "journal-entry",
    contentType: "journal_entry_exercise",
    instruction: "Produis 2 exercices d'écriture comptable équilibrés, fondés sur les opérations décrites par les sources.",
    explode: (data) => (data as { exercises: unknown[] }).exercises
  },
  error_diagnoses: {
    promptId: "error-diagnosis",
    contentType: "error_diagnosis_exercise",
    instruction: "Produis 2 diagnostics d'erreur portant sur des fautes plausibles et observables.",
    explode: (data) => (data as { exercises: unknown[] }).exercises
  },
  case: {
    promptId: "progressive-case",
    contentType: "progressive_case",
    instruction: "Produis un mini-cas progressif en 3 à 5 étapes cohérentes, fondé sur la situation décrite par les sources.",
    explode: (data) => [data]
  }
};

const SCHEMAS = {
  sheet: smartRevisionSheetSchema,
  flashcards: flashcardBatchSchema,
  calculations: calculationBatchSchema,
  journal_entries: journalEntryBatchSchema,
  error_diagnoses: errorDiagnosisBatchSchema,
  case: progressiveCaseSchema
} as const;

export function kindLabel(kind: GenerationKind): string {
  return KIND_DEFINITIONS[kind].contentType;
}

/**
 * Restriction du domaine ISO.
 *
 * `AGENTS.md` : « ISO content must be handled as notes/checklists unless
 * licensed text is explicitly allowed. » Transformer une norme en exercices,
 * flashcards et corrigés en redistribue la substance ; une fiche de synthèse
 * reste de la note de lecture. On n'autorise donc que la fiche, sauf déclaration
 * explicite de licence — laquelle est un fait contractuel, jamais une option de
 * confort, d'où une variable d'environnement nommée sans ambiguïté.
 */
export const ISO_ALLOWED_KINDS: readonly GenerationKind[] = ["sheet"];

export function isoLicensedTextAllowed(env: { ISO_LICENSED_TEXT_ALLOWED?: string }): boolean {
  return env.ISO_LICENSED_TEXT_ALLOWED === "true";
}

export interface KindRestriction {
  allowed: GenerationKind[];
  refused: GenerationKind[];
  reason?: string;
}

export function restrictKindsForDomain(
  kinds: readonly GenerationKind[],
  domainId: string,
  env: { ISO_LICENSED_TEXT_ALLOWED?: string } = {}
): KindRestriction {
  if (domainId !== "iso" || isoLicensedTextAllowed(env)) {
    return { allowed: [...kinds], refused: [] };
  }

  const allowed = kinds.filter((kind) => ISO_ALLOWED_KINDS.includes(kind));
  const refused = kinds.filter((kind) => !ISO_ALLOWED_KINDS.includes(kind));

  return {
    allowed,
    refused,
    reason:
      "domaine ISO : seules les fiches de synthèse sont produites. Exercices, flashcards, écritures, " +
      "diagnostics et mini-cas redistribueraient le texte normatif. Poser ISO_LICENSED_TEXT_ALLOWED=true " +
      "uniquement si une licence l'autorise explicitement."
  };
}

export interface GenerateOptions {
  kinds: readonly GenerationKind[];
  envelope: SourceEnvelope;
  corpus: CorpusIndex;
  provider: ContentGenerationProvider;
  now: () => Date;
  /** Contenus déjà présents, pour la détection de doublons entre exécutions. */
  existing?: readonly ContentPayload[];
}

export interface KindOutcome {
  kind: GenerationKind;
  produced: number;
  failed: number;
  /** Renseigné quand le générateur n'a rien pu produire du tout. */
  skippedReason?: string;
}

export interface GenerateOutcome {
  drafts: ContentDraft[];
  outcomes: KindOutcome[];
}

function titleFor(contentType: ContentType, content: Record<string, unknown>, index: number): string {
  if (contentType === "flashcard") {
    return String(content.front ?? `Carte ${index + 1}`).slice(0, 200);
  }

  return String(content.title ?? `${contentType} ${index + 1}`).slice(0, 200);
}

function difficultyFor(content: Record<string, unknown>): number {
  const raw = content.difficulty;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : 3;
}

/** Identifiant stable : même contenu, mêmes sources ⇒ même id. */
export function draftId(chapterSlug: string, contentType: ContentType, content: unknown): string {
  const digest = createHash("sha256")
    .update(`${chapterSlug}:${contentType}:${JSON.stringify(content)}`)
    .digest("hex");
  return `draft-${digest.slice(0, 20)}`;
}

export async function generateDrafts(options: GenerateOptions): Promise<GenerateOutcome> {
  const drafts: ContentDraft[] = [];
  const outcomes: KindOutcome[] = [];
  const siblings: ContentPayload[] = [...(options.existing ?? [])];

  for (const kind of options.kinds) {
    const definition = KIND_DEFINITIONS[kind];
    const promptVersion = CURRENT_PROMPT_VERSIONS[definition.promptId];
    const prompt = getPrompt(definition.promptId, promptVersion);

    if (!prompt) {
      outcomes.push({ kind, produced: 0, failed: 0, skippedReason: `prompt « ${definition.promptId} » introuvable` });
      continue;
    }

    // Le schéma exact varie selon la famille ; l'orchestrateur n'a pas besoin
    // du type précis puisqu'il éclate ensuite la sortie en contenus unitaires,
    // chacun revalidé par le moteur. La validation Zod, elle, reste bien celle
    // du schéma de la famille.
    const request: GenerationRequest<unknown> = {
      schema: SCHEMAS[kind] as z.ZodType<unknown>,
      prompt,
      instruction: definition.instruction,
      envelope: options.envelope,
      label: `${options.envelope.chapterSlug}:${kind}`
    };

    const result = await options.provider.generateStructuredContent(request);

    if (!result.ok) {
      outcomes.push({ kind, produced: 0, failed: 0, skippedReason: result.error });
      continue;
    }

    const inputHash = computeInputHash(request);
    const items = definition.explode(result.data);
    let produced = 0;
    let failed = 0;

    for (const [index, item] of items.entries()) {
      const content = item as Record<string, unknown>;
      const payload = { contentType: definition.contentType, content } as ContentPayload;
      const validation = validateContent({ payload, corpus: options.corpus, siblings });
      const timestamp = options.now().toISOString();

      const generationMetadata: GenerationMetadata = {
        provider: options.provider.name,
        model: result.model,
        promptId: prompt.id,
        promptVersion: prompt.version,
        generatedAt: timestamp,
        inputHash,
        sourcePackId: options.envelope.sourcePackId,
        documentIds: options.envelope.documents.map((document) => document.documentId),
        chunkIds: options.envelope.documents.flatMap((document) =>
          document.chunks.map((chunk) => chunk.chunkId)
        ),
        mode: result.mode,
        repairAttempts: result.repairAttempts
      };

      const status = validation.passed ? "needs_review" : "validation_failed";

      drafts.push({
        id: draftId(options.envelope.chapterSlug, definition.contentType, content),
        status,
        chapterSlug: options.envelope.chapterSlug,
        chapterLabel: options.envelope.chapterLabel,
        domainId: options.envelope.domainId,
        title: titleFor(definition.contentType, content, index),
        difficulty: difficultyFor(content),
        generationMetadata,
        validationMetadata: toValidationMetadata(validation, timestamp),
        reviewMetadata: { revision: 1 },
        history: [
          { fromStatus: null, toStatus: "draft", occurredAt: timestamp, actor: "cli:generate" },
          {
            fromStatus: "draft",
            toStatus: status,
            occurredAt: timestamp,
            actor: "validator",
            comment: validation.passed
              ? undefined
              : validation.blockingReasons.slice(0, 3).join(" | ").slice(0, 2000)
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
        ...payload
      } as ContentDraft);

      if (validation.passed) {
        produced += 1;
        // Seuls les contenus retenus alimentent la détection de doublons :
        // un contenu déjà en échec ne doit pas faire échouer son voisin.
        siblings.push(payload);
      } else {
        failed += 1;
      }
    }

    outcomes.push({ kind, produced, failed });
  }

  return { drafts, outcomes };
}

export function parseKinds(raw: string | undefined): GenerationKind[] {
  if (!raw) {
    return [...generationKinds];
  }

  const aliases: Record<string, GenerationKind> = {
    sheet: "sheet",
    fiche: "sheet",
    flashcards: "flashcards",
    cards: "flashcards",
    calculations: "calculations",
    calculs: "calculations",
    journal_entries: "journal_entries",
    entries: "journal_entries",
    ecritures: "journal_entries",
    error_diagnoses: "error_diagnoses",
    diagnostics: "error_diagnoses",
    case: "case",
    cas: "case"
  };

  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const resolved: GenerationKind[] = [];

  for (const value of requested) {
    const kind = aliases[value];

    if (!kind) {
      throw new Error(
        `type de contenu inconnu « ${value} » — valeurs acceptées : ${Object.keys(aliases).join(", ")}`
      );
    }

    if (!resolved.includes(kind)) {
      resolved.push(kind);
    }
  }

  return resolved;
}

export { contentTypeSchema };
