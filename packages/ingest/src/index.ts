import { readdir, stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, relative } from "node:path";
import type { DomainId } from "@finance/domain";
import { z } from "zod";

export const supportedExtensions = [".pdf", ".docx", ".pptx", ".xlsx", ".md"] as const;

export type SupportedExtension = (typeof supportedExtensions)[number];

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
  status: "extracted" | "needs-docling";
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

export function isSupportedExtension(extension: string): extension is SupportedExtension {
  return supportedExtensions.includes(extension.toLowerCase() as SupportedExtension);
}

export function inferDomainFromPath(path: string): DomainId | "unknown" {
  const normalized = path.toLowerCase();

  if (normalized.includes("compta-generale") || normalized.includes("pcg")) {
    return "compta-generale";
  }

  if (normalized.includes("analytique")) {
    return "compta-analytique";
  }

  if (normalized.includes("controle") || normalized.includes("contrôle")) {
    return "controle-gestion";
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

  if (file.extension !== ".md") {
    return {
      path: file.path,
      extension: file.extension,
      rawText: "",
      markdownText: "",
      status: "needs-docling"
    };
  }

  const markdownText = await readFile(absolutePath, "utf8");

  return {
    path: file.path,
    extension: file.extension,
    rawText: markdownText.replaceAll(/[#*_`>-]/g, " "),
    markdownText,
    status: "extracted"
  };
}

export function chunkMarkdown(document: ExtractedDocument, maxChars = 1200): TextChunk[] {
  if (!document.markdownText.trim()) {
    return [];
  }

  const sections = document.markdownText
    .split(/\n(?=#{1,3}\s)/g)
    .map((section) => section.trim())
    .filter(Boolean);
  const chunks: TextChunk[] = [];

  for (const section of sections.length > 0 ? sections : [document.markdownText]) {
    const sectionTitle = section.match(/^#{1,3}\s+(.+)$/m)?.[1] ?? "Sans titre";

    for (let index = 0; index < section.length; index += maxChars) {
      const content = section.slice(index, index + maxChars).trim();

      if (!content) {
        continue;
      }

      const contentHash = createHash("sha256").update(`${document.path}:${content}`).digest("hex");
      chunks.push({
        id: `chunk-${contentHash.slice(0, 16)}`,
        sourcePath: document.path,
        sectionTitle,
        content,
        contentHash,
        pageStart: 1,
        pageEnd: 1
      });
    }
  }

  return chunks;
}
