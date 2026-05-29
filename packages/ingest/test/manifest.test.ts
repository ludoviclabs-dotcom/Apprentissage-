import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  chunkMarkdown,
  createSourcePackManifest,
  extractDocument,
  inferDomainFromPath,
  isSupportedExtension
} from "../src";

describe("ingest manifest", () => {
  it("detects supported document extensions", () => {
    expect(isSupportedExtension(".pdf")).toBe(true);
    expect(isSupportedExtension(".txt")).toBe(false);
  });

  it("infers domains from source pack names", () => {
    expect(inferDomainFromPath("source-packs/ifrs-preparation-2027")).toBe("ifrs-ias");
    expect(inferDomainFromPath("source-packs/iso-notes")).toBe("iso");
  });

  it("creates a sorted manifest and skips unsupported files", async () => {
    const root = join(tmpdir(), `finance-hub-${Date.now()}`);
    await mkdir(join(root, "compta-generale"), { recursive: true });
    await writeFile(join(root, "compta-generale", "b.pdf"), "pdf");
    await writeFile(join(root, "compta-generale", "a.md"), "md");
    await writeFile(join(root, "compta-generale", "ignore.txt"), "txt");

    const manifest = await createSourcePackManifest(root);

    expect(manifest.files.map((file) => file.path.replaceAll("\\", "/"))).toEqual([
      "compta-generale/a.md",
      "compta-generale/b.pdf"
    ]);
    expect(manifest.files[0].checksum).toHaveLength(64);
    expect(manifest.skippedCount).toBe(1);
  });

  it("extracts and chunks markdown deterministically", async () => {
    const root = join(tmpdir(), `finance-hub-md-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "notes.md"), "# Provisions\n\nUne provision suppose une obligation.\n\n## Exemple\n\nLitige probable.");

    const manifest = await createSourcePackManifest(root);
    const extracted = await extractDocument(root, manifest.files[0]);
    const chunks = chunkMarkdown(extracted, 40);

    expect(extracted.status).toBe("extracted");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].sectionTitle).toBe("Provisions");
    expect(chunks[0].contentHash).toHaveLength(64);
  });
});
