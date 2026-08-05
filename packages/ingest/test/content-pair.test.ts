import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { pairManifest, scanContentSources } from "../src/content-pipeline";

const fixedNow = () => new Date("2026-08-05T10:00:00.000Z");

async function makeCorpus(): Promise<string> {
  const root = join(tmpdir(), `content-pair-${Date.now()}`);
  await mkdir(root, { recursive: true });

  const files = [
    "La methode ABC - Fiche de cours.md",
    "La methode ABC - Application 1.md",
    "La methode ABC - Application 1 - Corrige.md",
    "La methode ABC - Application 2.md",
    "Les titres - Fiche de cours.md",
    "Les titres - Mise en situation.md",
    "Les titres - Corrige.md",
    "Les tableaux de bord - Corrige.md"
  ];

  for (const name of files) {
    await writeFile(join(root, name), `# ${name}\n\nContenu.`);
  }

  return root;
}

describe("content:pair", () => {
  it("groupe par chapitre et rapproche énoncés et corrigés sans IA", async () => {
    const root = await makeCorpus();
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });
    const report = pairManifest(manifest, fixedNow);

    expect(report.counts.groups).toBe(3);

    const abc = report.groups.find((group) => group.chapterSlug === "la-methode-abc");
    expect(abc).toBeDefined();
    expect(abc?.documents.course).toHaveLength(1);
    expect(abc?.documents.exercise).toHaveLength(2);
    expect(abc?.documents.correction).toHaveLength(1);
    // « Application 1 » ↔ « Application 1 - Corrigé » par clé de variante.
    expect(abc?.pairs).toEqual([
      {
        exercise: "La methode ABC - Application 1.md",
        correction: "La methode ABC - Application 1 - Corrige.md",
        variantKey: "application-1"
      }
    ]);
    // « Application 2 » reste sans corrigé et le groupe le signale.
    expect(abc?.issues.some((issue) => issue.code === "exercice-sans-corrige")).toBe(true);
  });

  it("apparie un énoncé et un corrigé uniques même sans clé de variante commune", async () => {
    const root = await makeCorpus();
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });
    const report = pairManifest(manifest, fixedNow);

    const titres = report.groups.find((group) => group.chapterSlug === "les-titres");
    expect(titres?.pairs).toHaveLength(1);
    expect(titres?.pairs[0].exercise).toBe("Les titres - Mise en situation.md");
    expect(titres?.pairs[0].correction).toBe("Les titres - Corrige.md");
    expect(titres?.issues.filter((issue) => issue.code === "exercice-sans-corrige")).toHaveLength(0);
  });

  it("signale un corrigé isolé et un chapitre sans cours", async () => {
    const root = await makeCorpus();
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });
    const report = pairManifest(manifest, fixedNow);

    const tableaux = report.groups.find((group) => group.chapterSlug === "les-tableaux-de-bord");
    expect(tableaux?.issues.some((issue) => issue.code === "corrige-sans-exercice")).toBe(true);
    expect(tableaux?.issues.some((issue) => issue.code === "chapitre-sans-cours")).toBe(true);
    expect(report.counts.correctionsWithoutExercise).toBe(1);
  });

  it("est déterministe : deux exécutions produisent le même rapport", async () => {
    const root = await makeCorpus();
    const manifest = await scanContentSources(root, { packId: "test-pack", now: fixedNow });

    expect(pairManifest(manifest, fixedNow)).toEqual(pairManifest(manifest, fixedNow));
  });
});
