import { z } from "zod";
import { supportedExtensions } from "../supported-extensions";

/**
 * Schémas et types du pipeline de contenu (scan → extract → pair → validate).
 * Tout artefact persisté sous data/extracted/ passe par ces schémas : pas de
 * JSON non typé, pas de chemin absolu, pas de page inventée.
 */

export const documentCategories = [
  "course",
  "exercise",
  "correction",
  "synthesis",
  "exam",
  "reference"
] as const;

export type DocumentCategory = (typeof documentCategories)[number];

export const documentCategorySchema = z.enum(documentCategories);

export const extractionStatuses = ["pending", "extracted", "needs-review", "needs-docling"] as const;

export type ExtractionStatus = (typeof extractionStatuses)[number];

export const extractionStatusSchema = z.enum(extractionStatuses);

/**
 * Le workflow éditorial vivait ici à titre préparatoire. Il a été remplacé par
 * la machine à états de `@finance/content-generation`
 * (`draft → validation_failed | needs_review → approved | rejected`), qui ajoute
 * les deux états que celui-ci ignorait — l'échec des contrôles et le refus
 * humain — et retire `published`, hors périmètre. Voir
 * `docs/content-factory-preflight.md` §2.1.
 */

/** Un chemin persisté est toujours relatif, en séparateurs `/`, sans remontée. */
export function isPortableRelativePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.includes("\\")) return false;
  if (value.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.split("/").some((segment) => segment === ".." || segment === "")) return false;
  return true;
}

const portableRelativePathSchema = z
  .string()
  .min(1)
  .refine(isPortableRelativePath, { message: "chemin non portable : attendu relatif, séparateurs `/`, sans `..`" });

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "checksum SHA-256 hexadécimal attendu");

/**
 * Gravité d'un constat.
 *
 * `blocking` : le constat dit qu'une partie du document manque à l'extraction —
 * la page ne peut pas étayer un contenu approuvé, encore moins publié.
 * `informational` : le constat est exact mais ne retire rien au texte extrait —
 * il est conservé pour être lu, pas pour bloquer.
 *
 * Le champ est facultatif et son absence vaut `blocking` (voir
 * {@link isBlockingIssue}). Deux propriétés en découlent, toutes deux voulues :
 * un artefact écrit avant l'introduction de la gravité garde l'interprétation
 * prudente qui était la sienne, et un code ajouté demain bloque par défaut
 * plutôt que de passer inaperçu.
 */
export const issueSeverities = ["blocking", "informational"] as const;

export type IssueSeverity = (typeof issueSeverities)[number];

export const issueSeveritySchema = z.enum(issueSeverities);

export const contentIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  page: z.number().int().positive().optional(),
  severity: issueSeveritySchema.optional()
});

export type ContentIssue = z.infer<typeof contentIssueSchema>;

/** `true` sauf pour un constat explicitement déclaré `informational`. */
export function isBlockingIssue(issue: Pick<ContentIssue, "severity">): boolean {
  return issue.severity !== "informational";
}

export const contentManifestEntrySchema = z.object({
  relativePath: portableRelativePathSchema,
  originalName: z.string().min(1),
  extension: z.enum(supportedExtensions),
  sizeBytes: z.number().int().nonnegative(),
  sha256: sha256Schema,
  domainId: z.string().min(1),
  category: documentCategorySchema,
  chapterLabel: z.string().min(1),
  chapterSlug: z.string().min(1),
  variantKey: z.string(),
  extraction: z.object({
    status: extractionStatusSchema,
    pageCount: z.number().int().nonnegative().optional(),
    issues: z.array(contentIssueSchema)
  })
});

export type ContentManifestEntry = z.infer<typeof contentManifestEntrySchema>;

export const skippedFileSchema = z.object({
  relativePath: portableRelativePathSchema,
  reason: z.string().min(1)
});

export type SkippedFile = z.infer<typeof skippedFileSchema>;

export const contentManifestSchema = z.object({
  packId: z.string().min(1),
  generatedAt: z.string().min(1),
  files: z.array(contentManifestEntrySchema),
  skipped: z.array(skippedFileSchema),
  counts: z.object({
    files: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    byCategory: z.record(z.string(), z.number().int().nonnegative()),
    byDomain: z.record(z.string(), z.number().int().nonnegative())
  })
});

export type ContentManifest = z.infer<typeof contentManifestSchema>;

export const extractedPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  rawText: z.string(),
  markdownText: z.string(),
  issues: z.array(contentIssueSchema)
});

export type ExtractedPage = z.infer<typeof extractedPageSchema>;

export const pageAwareChunkSchema = z
  .object({
    id: z.string().min(1),
    sectionTitle: z.string(),
    content: z.string().min(1),
    contentHash: sha256Schema,
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive()
  })
  .refine((chunk) => chunk.pageStart <= chunk.pageEnd, {
    message: "pageStart doit être inférieur ou égal à pageEnd"
  });

export type PageAwareChunk = z.infer<typeof pageAwareChunkSchema>;

export const extractedDocumentArtifactSchema = z.object({
  sha256: sha256Schema,
  relativePath: portableRelativePathSchema,
  extension: z.enum(supportedExtensions),
  domainId: z.string().min(1),
  category: documentCategorySchema,
  status: extractionStatusSchema,
  pageCount: z.number().int().nonnegative(),
  pages: z.array(extractedPageSchema),
  chunks: z.array(pageAwareChunkSchema),
  issues: z.array(contentIssueSchema)
});

export type ExtractedDocumentArtifact = z.infer<typeof extractedDocumentArtifactSchema>;

export const chapterGroupSchema = z.object({
  chapterSlug: z.string().min(1),
  chapterLabel: z.string().min(1),
  domainId: z.string().min(1),
  documents: z.record(documentCategorySchema, z.array(portableRelativePathSchema)),
  pairs: z.array(
    z.object({
      exercise: portableRelativePathSchema,
      correction: portableRelativePathSchema,
      variantKey: z.string()
    })
  ),
  issues: z.array(contentIssueSchema)
});

export type ChapterGroup = z.infer<typeof chapterGroupSchema>;

export const pairingReportSchema = z.object({
  packId: z.string().min(1),
  generatedAt: z.string().min(1),
  groups: z.array(chapterGroupSchema),
  counts: z.object({
    groups: z.number().int().nonnegative(),
    pairs: z.number().int().nonnegative(),
    exercisesWithoutCorrection: z.number().int().nonnegative(),
    correctionsWithoutExercise: z.number().int().nonnegative()
  })
});

export type PairingReport = z.infer<typeof pairingReportSchema>;
