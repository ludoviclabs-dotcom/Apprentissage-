import { readdir, stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, relative } from "node:path";
import type { DomainId } from "@finance/domain";
import { z } from "zod";
import { extractDocx, extractPdf, type ExtractedPageContent } from "./extractors";

export type { ExtractedPageContent } from "./extractors";
export * from "./supported-extensions";
export * from "./content-pipeline";
export * from "./local-config";

import { isSupportedExtension, supportedExtensions, type SupportedExtension } from "./supported-extensions";

export interface IngestFile {
  path: string;
  extension: SupportedExtension;
  sizeBytes: number;
  checksum: string;
}

export interface SourcePackManifest {
  rootPath: string;
  domainId: DomainId | "unknown";
  files: IngestFile[];
  skippedCount: number;
}

export interface ExtractedDocument {
  path: string;
  extension: SupportedExtension;
  rawText: string;
  markdownText: string;
  pages: number;
  /**
   * Contenu page par page avec les numéros réels du document source. Vide
   * uniquement pour les formats non couverts (.pptx / .xlsx) ; un Markdown est
   * une unique page logique 1.
   */
  pageContents: ExtractedPageContent[];
  status: "extracted" | "needs-docling";
  reason?: string;
}

export interface TextChunk {
  id: string;
  sourcePath: string;
  sectionTitle: string;
  content: string;
  contentHash: string;
  pageStart: number;
  pageEnd: number;
}

export const sourcePackManifestSchema = z.object({
  rootPath: z.string().min(1),
  domainId: z.string().min(1),
  files: z.array(
    z.object({
      path: z.string().min(1),
      extension: z.enum(supportedExtensions),
      sizeBytes: z.number().nonnegative(),
      checksum: z.string().min(16)
    })
  ),
  skippedCount: z.number().nonnegative()
});

export function inferDomainFromPath(path: string): DomainId | "unknown" {
  const normalized = path.toLowerCase();

  // Méthodes de coûts / pilotage de la performance → analytique (avant le filet "compta").
  if (
    /(analytique|m[eé]thode abc|\babc\b|co[uû]t cible|target costing|yield|management des capacit|pilotage et performance|tableaux? de bord|seuil de rentabilit|co[uû]t variable|[eé]carts? sur)/.test(
      normalized
    )
  ) {
    return "compta-analytique";
  }

  if (normalized.includes("compta-generale") || normalized.includes("pcg")) {
    return "compta-generale";
  }

  if (normalized.includes("ifrs") || normalized.includes("ias")) {
    return "ifrs-ias";
  }

  if (normalized.includes("iso")) {
    return "iso";
  }

  if (normalized.includes("fiscal")) {
    return "fiscalite";
  }

  if (
    normalized.includes("controle") ||
    normalized.includes("contrôle") ||
    normalized.includes("controledegestion")
  ) {
    return "controle-gestion";
  }

  // Comptabilité générale & approfondie (large filet après les cas spécifiques).
  if (
    /(comptabilit|\bcompta\b|comptes sociaux|comptes consolid|immobilisation|amortissement|provision|emprunts obligataires|\btitres\b|op[eé]rations courantes|constitution des|variations du capital|contrats? [aà] long terme|cl[oô]ture|\btva\b)/.test(
      normalized
    )
  ) {
    return "compta-generale";
  }

  if (normalized.includes("finance")) {
    return "finance";
  }

  return "unknown";
}

export async function createSourcePackManifest(rootPath: string): Promise<SourcePackManifest> {
  const files: IngestFile[] = [];
  let skippedCount = 0;

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      const extension = extname(entry.name).toLowerCase();

      if (!isSupportedExtension(extension)) {
        skippedCount += 1;
        continue;
      }

      const info = await stat(fullPath);
      const checksum = createHash("sha256").update(await readFile(fullPath)).digest("hex");

      files.push({
        path: relative(rootPath, fullPath),
        extension,
        sizeBytes: info.size,
        checksum
      });
    }
  }

  await visit(rootPath);

  return {
    rootPath,
    domainId: inferDomainFromPath(rootPath),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    skippedCount
  };
}

export async function extractDocument(rootPath: string, file: IngestFile): Promise<ExtractedDocument> {
  const absolutePath = join(rootPath, file.path);

  if (file.extension === ".md") {
    const markdownText = await readFile(absolutePath, "utf8");
    const rawText = markdownText.replaceAll(/[#*_`>-]/g, " ");

    return {
      path: file.path,
      extension: file.extension,
      rawText,
      markdownText,
      pages: 1,
      // Un fichier Markdown est une page logique unique : le numéro 1 est réel,
      // pas un défaut arbitraire.
      pageContents: [{ pageNumber: 1, rawText, markdownText }],
      status: "extracted"
    };
  }

  if (file.extension === ".pdf" || file.extension === ".docx") {
    const extracted = file.extension === ".pdf" ? await extractPdf(absolutePath) : await extractDocx(absolutePath);

    return {
      path: file.path,
      extension: file.extension,
      rawText: extracted.rawText,
      markdownText: extracted.markdownText,
      pages: extracted.pages,
      pageContents: extracted.pageContents,
      status: extracted.status,
      reason: extracted.reason
    };
  }

  // .pptx / .xlsx ne sont pas couverts par l'extracteur Node léger de la V1.
  return {
    path: file.path,
    extension: file.extension,
    rawText: "",
    markdownText: "",
    pages: 0,
    pageContents: [],
    status: "needs-docling",
    reason: "format non couvert par l'extracteur Node V1 (.pptx / .xlsx)"
  };
}

export function chunkMarkdown(document: ExtractedDocument, maxChars = 1200): TextChunk[] {
  // Les chunks sont découpés page par page : chaque chunk porte le numéro réel
  // de sa page source, jamais un `1` arbitraire. Le repli sur une page unique ne
  // sert qu'aux documents sans pagination connue et non vides.
  const pages: ExtractedPageContent[] =
    document.pageContents.length > 0
      ? document.pageContents
      : document.markdownText.trim()
        ? [{ pageNumber: 1, rawText: document.rawText, markdownText: document.markdownText }]
        : [];

  const chunks: TextChunk[] = [];
  let carriedTitle = "Sans titre";

  for (const page of pages) {
    if (!page.markdownText.trim()) {
      continue;
    }

    const sections = page.markdownText
      .split(/\n(?=#{1,3}\s)/g)
      .map((section) => section.trim())
      .filter(Boolean);

    for (const section of sections.length > 0 ? sections : [page.markdownText]) {
      const heading = section.match(/^#{1,3}\s+(.+)$/m)?.[1];

      if (heading) {
        // Un titre vu sur une page couvre les pages suivantes jusqu'au prochain.
        carriedTitle = heading;
      }

      const sectionTitle = heading ?? carriedTitle;

      for (let index = 0; index < section.length; index += maxChars) {
        const content = section.slice(index, index + maxChars).trim();

        if (!content) {
          continue;
        }

        const contentHash = createHash("sha256")
          .update(`${document.path}:${page.pageNumber}:${content}`)
          .digest("hex");
        chunks.push({
          id: `chunk-${contentHash.slice(0, 16)}`,
          sourcePath: document.path,
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
