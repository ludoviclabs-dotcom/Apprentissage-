import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { scanContentSources } from "../src/content-pipeline";

async function makeSourceDir(suffix: string): Promise<string> {
  const root = join(tmpdir(), `content-scan-${suffix}-${Date.now()}`);
  await mkdir(join(root, "comptabilite"), { recursive: true });
  await writeFile(join(root, "comptabilite", "Les titres - Fiche de cours.md"), "# Les titres\n\nContenu du cours.");
  await writeFile(join(root, "comptabilite", "Les titres - Mise en situation.md"), "# Énoncé\n\nQuestion 1.");
  await writeFile(join(root, "comptabilite", "notes.txt"), "brouillon non supporté");
  return root;
}

const fixedNow = () => new Date("2026-08-05T10:00:00.000Z");

describe("content:scan", () => {
  it("ne produit que des chemins relatifs portables", async () => {
    const root = await makeSourceDir("paths");
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });

    expect(manifest.files).toHaveLength(2);
    for (const file of manifest.files) {
      expect(file.relativePath).not.toMatch(/^[a-zA-Z]:/);
      expect(file.relativePath).not.toContain("\\");
      expect(file.relativePath.startsWith("/")).toBe(false);
      expect(file.relativePath).not.toContain("..");
    }
    expect(manifest.files[0].relativePath).toBe("comptabilite/Les titres - Fiche de cours.md");
  });

  it("produit un checksum SHA-256 stable entre deux scans", async () => {
    const root = await makeSourceDir("checksum");
    const first = await scanContentSources(root, { packId: "test-pack", now: fixedNow });
    const second = await scanContentSources(root, { packId: "test-pack", now: fixedNow });

    expect(first).toEqual(second);
    for (const file of first.files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("refuse les fichiers non supportés en les listant avec une raison", async () => {
    const root = await makeSourceDir("skipped");
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });

    expect(manifest.counts.skipped).toBe(1);
    expect(manifest.skipped[0].relativePath).toBe("comptabilite/notes.txt");
    expect(manifest.skipped[0].reason).toContain("non supportée");
    expect(manifest.files.some((file) => file.relativePath.endsWith(".txt"))).toBe(false);
  });

  it("porte catégorie, chapitre et domaine sur chaque entrée", async () => {
    const root = await makeSourceDir("classify");
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });

    const course = manifest.files.find((file) => file.category === "course");
    const exercise = manifest.files.find((file) => file.category === "exercise");

    expect(course?.chapterSlug).toBe("les-titres");
    expect(exercise?.chapterSlug).toBe("les-titres");
    expect(course?.domainId).toBe("compta-generale");
    expect(course?.extraction.status).toBe("pending");
    expect(manifest.counts.byCategory).toEqual({ course: 1, exercise: 1 });
  });
});
