import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { DomainId } from "@finance/domain";
import { isSupportedExtension } from "@finance/ingest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maxUploadBytes = 25 * 1024 * 1024;
const domainIds = new Set<string>([
  "compta-generale",
  "compta-analytique",
  "controle-gestion",
  "ifrs-ias",
  "iso",
  "fiscalite",
  "finance"
]);

function sanitizeFilename(filename: string) {
  return basename(filename)
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "_")
    .replaceAll(/\s+/g, "-")
    .slice(0, 160);
}

function parseDomainId(value: FormDataEntryValue | null): DomainId {
  const domainId = typeof value === "string" ? value : "finance";
  return domainIds.has(domainId) ? (domainId as DomainId) : "finance";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
  }

  if (file.size > maxUploadBytes) {
    return NextResponse.json({ error: "Le fichier depasse 25 Mo pour le MVP." }, { status: 413 });
  }

  const extension = extname(file.name).toLowerCase();

  if (!isSupportedExtension(extension)) {
    return NextResponse.json(
      { error: "Format non supporte.", supported: [".pdf", ".docx", ".pptx", ".xlsx", ".md"] },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const domainId = parseDomainId(formData.get("domainId"));
  const uploadDate = new Date().toISOString().slice(0, 10);
  const uploadRoot = join(process.cwd(), "..", "..", "data", "uploads", `manual-${uploadDate}`, domainId);
  const storedFilename = `${checksum.slice(0, 12)}-${sanitizeFilename(file.name)}`;
  const targetPath = join(uploadRoot, storedFilename);

  await mkdir(uploadRoot, { recursive: true });
  await writeFile(targetPath, buffer);

  return NextResponse.json({
    file: {
      filename: file.name,
      storedFilename,
      extension,
      sizeBytes: file.size,
      checksum,
      domainId,
      path: targetPath,
      status: extension === ".md" ? "ready-for-chunking" : "needs-docling"
    }
  });
}
