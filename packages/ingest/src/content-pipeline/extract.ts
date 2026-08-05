import { createHash } from "node:crypto";
import { join } from "node:path";
import { extractDocument, type IngestFile } from "../index";
import { assessQuality } from "../extractors";
import {
  extractedDocumentArtifactSchema,
  type ContentIssue,
  type ContentManifestEntry,
  type ExtractedDocumentArtifact,
  type ExtractedPage,
  type ExtractionStatus,
  type PageAwareChunk
} from "./types";

const CHUNK_MAX_CHARS = 1200;

/**
 * Heuristique de détection de mise en tableau : une page dont beaucoup de
 * lignes sont des colonnes alignées (espaces multiples, tabulations) ou des
 * suites de nombres perd probablement sa structure à l'extraction texte.
 * Ces pages passent en `needs-review` plutôt que d'être publiées dégradées.
 */
export function looksLikeFlattenedTable(pageText: string): boolean {
  const lines = pageText.split("\n").map((line) => line.trim()).filter(Boolean);

  if (lines.length < 4) {
    return false;
  }

  let columnLike = 0;

  for (const line of lines) {
    const numberTokens = (line.match(/\d+(?:[.,]\d+)?/g) ?? []).length;
    const wordTokens = (line.match(/\p{L}{2,}/gu) ?? []).length;
    const hasColumnGaps = /\t| {3,}/.test(line);

    if (hasColumnGaps || (numberTokens >= 3 && numberTokens > wordTokens)) {
      columnLike += 1;
    }
  }

  return columnLike / lines.length >= 0.4;
}

function assessPage(pageNumber: number, rawText: string): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const trimmed = rawText.trim();

  if (trimmed.length === 0) {
    issues.push({
      code: "empty-page",
      message: "page sans texte extrait — probable scan ou page d'illustration",
      page: pageNumber
    });
    return issues;
  }

  const quality = assessQuality(trimmed);

  if (!quality.ok) {
    issues.push({
      code: "degraded-extraction",
      message: quality.reason ?? "qualité d'extraction insuffisante",
      page: pageNumber
    });
  }

  if (looksLikeFlattenedTable(trimmed)) {
    issues.push({
      code: "table-suspected",
      message: "tableau probable aplati par l'extraction texte — vérifier la mise en forme",
      page: pageNumber
    });
  }

  return issues;
}

/**
 * Découpe page par page : un chunk ne franchit jamais une page, son intervalle
 * [pageStart, pageEnd] est donc toujours le numéro réel de sa page source.
 */
export function chunkExtractedPages(
  documentKey: string,
  pages: ExtractedPage[],
  maxChars = CHUNK_MAX_CHARS
): PageAwareChunk[] {
  const chunks: PageAwareChunk[] = [];
  let carriedTitle = "Sans titre";

  for (const page of pages) {
    const text = page.markdownText.trim();

    if (!text) {
      continue;
    }

    const sections = text
      .split(/\n(?=#{1,3}\s)/g)
      .map((section) => section.trim())
      .filter(Boolean);

    for (const section of sections.length > 0 ? sections : [text]) {
      const heading = section.match(/^#{1,3}\s+(.+)$/m)?.[1];

      if (heading) {
        carriedTitle = heading;
      }

      const sectionTitle = heading ?? carriedTitle;

      for (let index = 0; index < section.length; index += maxChars) {
        const content = section.slice(index, index + maxChars).trim();

        if (!content) {
          continue;
        }

        const contentHash = createHash("sha256")
          .update(`${documentKey}:${page.pageNumber}:${content}`)
          .digest("hex");
        chunks.push({
          id: `chunk-${contentHash.slice(0, 16)}`,
          sectionTitle,
          content,
          contentHash,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber
        });
      }
    }
  }

  return chunks;
}

/**
 * Extrait un document du manifeste en préservant la pagination réelle, évalue
 * la qualité page par page et produit l'artefact validé par Zod qui alimentera
 * `document_pages` et `chunks` au lot suivant.
 */
export async function extractManifestEntry(
  rootPath: string,
  entry: ContentManifestEntry
): Promise<ExtractedDocumentArtifact> {
  const ingestFile: IngestFile = {
    path: entry.relativePath,
    extension: entry.extension,
    sizeBytes: entry.sizeBytes,
    checksum: entry.sha256
  };

  const extracted = await extractDocument(rootPath, ingestFile);
  const documentIssues: ContentIssue[] = [];

  const pages: ExtractedPage[] = extracted.pageContents.map((page) => ({
    pageNumber: page.pageNumber,
    rawText: page.rawText,
    markdownText: page.markdownText,
    issues: entry.extension === ".md" ? [] : assessPage(page.pageNumber, page.rawText)
  }));

  if (entry.extension === ".docx") {
    documentIssues.push({
      code: "pagination-unavailable",
      message: "le format DOCX ne matérialise pas de pagination : document traité comme une page logique unique"
    });
  }

  if (extracted.status === "needs-docling") {
    documentIssues.push({
      code: "needs-docling",
      message: extracted.reason ?? "extraction Node insuffisante — passage par le worker Docling requis"
    });
  }

  const pageIssueCount = pages.reduce((total, page) => total + page.issues.length, 0);
  let status: ExtractionStatus;

  if (extracted.status === "needs-docling") {
    status = "needs-docling";
  } else if (pageIssueCount > 0) {
    status = "needs-review";
  } else {
    status = "extracted";
  }

  const chunks =
    status === "needs-docling" ? [] : chunkExtractedPages(`${entry.sha256}:${entry.relativePath}`, pages);

  return extractedDocumentArtifactSchema.parse({
    sha256: entry.sha256,
    relativePath: entry.relativePath,
    extension: entry.extension,
    domainId: entry.domainId,
    category: entry.category,
    status,
    pageCount: pages.length,
    pages,
    chunks,
    issues: documentIssues
  });
}

export function artifactFileName(entry: ContentManifestEntry): string {
  return `${entry.sha256.slice(0, 12)}.json`;
}

export function artifactPath(outputDir: string, entry: ContentManifestEntry): string {
  return join(outputDir, "pages", artifactFileName(entry));
}
