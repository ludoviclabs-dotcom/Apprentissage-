import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { inferDomainFromPath, isSupportedExtension } from "../index";
import { classifyDocumentCategory, detectChapter, variantKey } from "./classify";
import { contentManifestSchema, type ContentManifest, type ContentManifestEntry, type SkippedFile } from "./types";

/** Fichiers d'infrastructure ignorés silencieusement (ni comptés, ni signalés). */
const SILENT_FILES = new Set([".gitkeep", ".ds_store", "desktop.ini", "thumbs.db"]);

export function toPortablePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export interface ScanOptions {
  packId: string;
  now?: () => Date;
}

/**
 * Scanne la racine des sources privées et produit le manifeste enrichi :
 * chemin relatif portable, checksum SHA-256, domaine, catégorie documentaire,
 * chapitre probable. Le statut d'extraction reste `pending` jusqu'à
 * `content:extract`. Déterministe : mêmes octets → même manifeste.
 */
export async function scanContentSources(rootPath: string, options: ScanOptions): Promise<ContentManifest> {
  const files: ContentManifestEntry[] = [];
  const skipped: SkippedFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (SILENT_FILES.has(entry.name.toLowerCase())) {
        continue;
      }

      const relativePath = toPortablePath(relative(rootPath, fullPath));
      const extension = extname(entry.name).toLowerCase();

      if (!isSupportedExtension(extension)) {
        skipped.push({
          relativePath,
          reason: `extension non supportée (${extension || "aucune"}) — formats acceptés : .pdf, .docx, .pptx, .xlsx, .md`
        });
        continue;
      }

      const info = await stat(fullPath);
      const sha256 = createHash("sha256").update(await readFile(fullPath)).digest("hex");
      const originalName = basename(entry.name);
      const { chapterLabel, chapterSlug } = detectChapter(originalName);

      files.push({
        relativePath,
        originalName,
        extension,
        sizeBytes: info.size,
        sha256,
        domainId: inferDomainFromPath(relativePath),
        category: classifyDocumentCategory(originalName),
        chapterLabel,
        chapterSlug,
        variantKey: variantKey(originalName),
        extraction: { status: "pending", issues: [] }
      });
    }
  }

  await visit(rootPath);

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  skipped.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const byCategory: Record<string, number> = {};
  const byDomain: Record<string, number> = {};

  for (const file of files) {
    byCategory[file.category] = (byCategory[file.category] ?? 0) + 1;
    byDomain[file.domainId] = (byDomain[file.domainId] ?? 0) + 1;
  }

  const manifest: ContentManifest = {
    packId: options.packId,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    files,
    skipped,
    counts: {
      files: files.length,
      skipped: skipped.length,
      byCategory,
      byDomain
    }
  };

  return contentManifestSchema.parse(manifest);
}
