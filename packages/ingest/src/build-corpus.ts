import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DomainId, SourceType } from "@finance/domain";
import { chunkMarkdown, createSourcePackManifest, extractDocument, inferDomainFromPath } from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

const sourceRoot = process.argv[2] ?? "C:/Users/Ludo/Dropbox/Comptabilité Générale _ Approfondie";
const packId = process.argv[3] ?? "compta-master";
const fallbackDomain: DomainId = (process.argv[4] as DomainId) ?? "compta-generale";
const outDir = join(repoRoot, "data", "processed", "corpus", packId);

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function inferSourceType(name: string): SourceType {
  const n = name.toLowerCase();
  if (n.includes("corrig")) return "exercise";
  if (n.includes("application") || n.includes("mise en situation") || n.includes("exercice") || n.includes("etudiant") || n.includes("étudiant")) {
    return "exercise";
  }
  return "course";
}

interface CorpusDoc {
  documentId: string;
  filename: string;
  relPath: string;
  domain: DomainId;
  sourceType: SourceType;
  title: string;
  pages: number;
  chunks: number;
  status: string;
  reason?: string;
  mdFile?: string;
}

const manifest = await createSourcePackManifest(sourceRoot);
await mkdir(outDir, { recursive: true });

const docs: CorpusDoc[] = [];
let totalChunks = 0;
const byStatus: Record<string, number> = {};
const byDomain: Record<string, number> = {};

for (const file of manifest.files) {
  const extracted = await extractDocument(sourceRoot, file);
  const inferred = inferDomainFromPath(file.path);
  const domain: DomainId = inferred === "unknown" ? fallbackDomain : inferred;
  const sourceType = inferSourceType(basename(file.path));
  const title = basename(file.path).replace(/\.[^.]+$/, "");
  const documentId = `${packId}-${file.checksum.slice(0, 12)}`;

  byStatus[extracted.status] = (byStatus[extracted.status] ?? 0) + 1;

  let chunks = 0;
  let mdFile: string | undefined;

  if (extracted.status === "extracted") {
    const textChunks = chunkMarkdown(extracted);
    chunks = textChunks.length;
    totalChunks += chunks;
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
    mdFile = `${documentId}-${slugify(title)}.md`;
    const header = `<!-- document: ${title} | domain: ${domain} | sourceType: ${sourceType} | pages: ${extracted.pages} | relPath: ${file.path.replaceAll("\\", "/")} -->`;
    await writeFile(join(outDir, mdFile), `${header}\n\n${extracted.markdownText}\n`, "utf8");
  }

  docs.push({
    documentId,
    filename: basename(file.path),
    relPath: file.path.replaceAll("\\", "/"),
    domain,
    sourceType,
    title,
    pages: extracted.pages,
    chunks,
    status: extracted.status,
    reason: extracted.reason,
    mdFile
  });
}

await writeFile(
  join(outDir, "index.json"),
  JSON.stringify(
    { packId, sourceRoot, detectedFiles: manifest.files.length, skipped: manifest.skippedCount, totalChunks, byStatus, byDomain, documents: docs },
    null,
    2
  ),
  "utf8"
);

console.log(`Pack            : ${packId}`);
console.log(`Source          : ${sourceRoot}`);
console.log(`Fichiers détectés: ${manifest.files.length} (non supportés ignorés: ${manifest.skippedCount})`);
console.log(`Statuts         :`, byStatus);
console.log(`Domaines (extraits):`, byDomain);
console.log(`Chunks totaux   : ${totalChunks}`);
console.log(`Sortie          : ${outDir}`);

const flagged = docs.filter((doc) => doc.status !== "extracted");
if (flagged.length > 0) {
  console.log(`\nÀ revoir (needs-docling) — ${flagged.length} :`);
  for (const doc of flagged) {
    console.log(`  - ${doc.relPath} (${doc.reason ?? "?"})`);
  }
}
