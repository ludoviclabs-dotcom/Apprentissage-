import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createSourcePackManifest, inferDomainFromPath, isSupportedExtension } from "../src";

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
    expect(manifest.skippedCount).toBe(1);
  });
});
