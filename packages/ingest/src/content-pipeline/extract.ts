import { createHash } from "node:crypto";
import { join } from "node:path";
import { extractDocument, type IngestFile } from "../index";
import { assessQuality, readImageProbe, type PageImageProbe } from "../extractors";
import {
  extractedDocumentArtifactSchema,
  isBlockingIssue,
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

/**
 * Pourquoi une page peu dense n'est pas forcément une page mal extraite.
 *
 * `assessQuality` ne sait qu'une chose : cette page porte peu de texte. Elle ne
 * sait pas *pourquoi*, et les deux raisons possibles appellent des conclusions
 * opposées. Constaté sur le pack `compta-approfondie` :
 *
 * - « Les emprunts obligataires - Mise en situation.pdf » page 5 porte 72
 *   caractères — une consigne complète — au-dessus d'un formulaire de journal
 *   vierge tracé en vectoriel. L'extraction est fidèle : tout le texte de la
 *   page est là, la page est peu dense par construction.
 * - « Les titres - Fiche de cours.pdf » page 2 porte 1 caractère et une image de
 *   1319 × 1022 : un arbre de décision entier — « Possession durable ? »,
 *   « Titres de participation », « TIAP » — dont rien n'est atteignable en
 *   texte. L'extraction a échoué.
 *
 * Le texte seul ne départage pas ces deux pages ; la présence d'une image
 * significative, si. C'est ce que sonde `probePageImages` et ce dont ce
 * classement se sert — sans jamais rien corriger en silence : chaque cas garde
 * un code distinct, et la page peu dense porte le constat de son propre
 * reclassement, motivé, plutôt que de sortir indemne de l'extraction.
 *
 * Le sondage n'est consulté que pour le défaut `text-too-short`. Un ratio
 * alphanumérique faible constate un texte déjà abîmé : aucune absence d'image
 * ne le rend fidèle.
 */
function assessPage(
  pageNumber: number,
  rawText: string,
  imageProbe: PageImageProbe | undefined
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const trimmed = rawText.trim();
  const quality = assessQuality(trimmed);

  if (!quality.ok && quality.defect === "text-too-short") {
    issues.push(assessSparseness(pageNumber, trimmed.length, readImageProbe(imageProbe, pageNumber)));
  } else if (!quality.ok) {
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

/** Le constat d'une page peu dense, et la preuve sur laquelle il repose. */
function assessSparseness(
  pageNumber: number,
  length: number,
  verdict: ReturnType<typeof readImageProbe>
): ContentIssue {
  if (verdict === "no-image") {
    return length === 0
      ? {
          code: "blank-page",
          message: "page sans texte ni image : page réellement vierge, rien n'a été perdu à l'extraction",
          page: pageNumber,
          severity: "informational"
        }
      : {
          code: "sparse-page",
          message:
            `page peu dense (${length} caractères) mais sans image : le texte extrait est complet ` +
            "— probable formulaire à remplir ou page de séparation",
          page: pageNumber,
          severity: "informational"
        };
  }

  const evidence =
    verdict === "image-present"
      ? "une image significative y a été détectée : le contenu est présent mais hors d'atteinte du texte"
      : "le sondage d'images n'a pas abouti sur cette page — classement prudent, faute de pouvoir conclure";

  return length === 0
    ? {
        code: "empty-page",
        message: `page sans texte extrait — ${evidence}`,
        page: pageNumber
      }
    : {
        code: "degraded-extraction",
        message: `texte trop court (${length} caractères) — ${evidence}`,
        page: pageNumber
      };
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
    issues:
      entry.extension === ".md"
        ? []
        : assessPage(page.pageNumber, page.rawText, extracted.imageProbe)
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

  if (extracted.imageProbe?.probeFailure) {
    documentIssues.push({
      code: "image-probe-failed",
      message:
        `le sondage d'images a échoué (${extracted.imageProbe.probeFailure}) : les pages peu denses ` +
        "restent classées comme dégradées, faute de pouvoir établir qu'elles ne le sont pas"
    });
  }

  // Seul un constat bloquant met le document en revue. Une page peu dense mais
  // fidèlement extraite est signalée — son constat reste dans l'artefact — sans
  // retenir le document entier.
  const blockingPageIssues = pages.reduce(
    (total, page) => total + page.issues.filter(isBlockingIssue).length,
    0
  );
  let status: ExtractionStatus;

  if (extracted.status === "needs-docling") {
    status = "needs-docling";
  } else if (blockingPageIssues > 0) {
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
