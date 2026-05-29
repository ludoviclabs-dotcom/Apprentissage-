import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { DomainId } from "@finance/domain";

export const supportedExtensions = [".pdf", ".docx", ".pptx", ".xlsx", ".md"] as const;

export type SupportedExtension = (typeof supportedExtensions)[number];

export interface IngestFile {
  path: string;
  extension: SupportedExtension;
  sizeBytes: number;
}

export interface SourcePackManifest {
  rootPath: string;
  domainId: DomainId | "unknown";
  files: IngestFile[];
  skippedCount: number;
}

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

      files.push({
        path: relative(rootPath, fullPath),
        extension,
        sizeBytes: info.size
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
