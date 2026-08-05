import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALCULATION_TEMPLATE_IDS, contentDraftStatuses } from "../src";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function sourceFiles(directory: string): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", directory], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split("\n")
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("hygiène de la fabrique de contenu", () => {
  it("n'exécute jamais de code dynamique : ni eval, ni Function, ni require différé", () => {
    const files = [...sourceFiles("packages/content-generation/src"), ...sourceFiles("apps/web/lib/content-review")];

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} contient eval`).not.toMatch(/\beval\s*\(/);
      expect(source, `${file} contient new Function`).not.toMatch(/new\s+Function\s*\(/);
      expect(source, `${file} contient setTimeout avec une chaîne`).not.toMatch(/setTimeout\s*\(\s*["'`]/);
    }
  });

  it("ne contient aucun chemin absolu codé en dur", () => {
    for (const file of [
      ...sourceFiles("packages/content-generation/src"),
      ...sourceFiles("packages/content-generation/test"),
      ...sourceFiles("apps/web/lib/content-review"),
      ...sourceFiles("apps/web/app/admin"),
      ...sourceFiles("apps/web/components/content-review")
    ]) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      // Les tests de validation citent volontairement un chemin absolu comme
      // *donnée* à rejeter : ils sont exclus de ce contrôle par leur nom.
      if (file.endsWith("validation.test.ts") || file.endsWith("hygiene.test.ts")) {
        continue;
      }

      expect(source, `${file} contient un chemin absolu`).not.toMatch(/["'][A-Za-z]:[\\/]/);
      expect(source, `${file} contient un chemin absolu`).not.toMatch(/["']\/(home|Users)\//);
    }
  });

  it("n'écrit aucune clé d'API en dur", () => {
    for (const file of sourceFiles("packages/content-generation/src")) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      expect(source, `${file} contient une clé`).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    }
  });

  it("ne journalise jamais la clé du fournisseur", () => {
    const live = readFileSync(join(repoRoot, "packages/content-generation/src/providers/live.ts"), "utf8");

    expect(live).not.toMatch(/console\.[a-z]+\([^)]*apiKey/i);
    expect(live).not.toMatch(/console\.[a-z]+\([^)]*OPENAI_API_KEY/);
  });

  it("aucun PDF n'est suivi par Git", () => {
    const tracked = execFileSync("git", ["ls-files", "*.pdf", "*.PDF"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();

    expect(tracked).toBe("");
  });

  it("les brouillons générés restent hors de Git", () => {
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain("data/generated/drafts/*");

    const tracked = execFileSync("git", ["ls-files", "data/generated/drafts"], {
      cwd: repoRoot,
      encoding: "utf8"
    })
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.endsWith(".gitkeep"));

    expect(tracked).toEqual([]);
  });

  it("le mot « published » n'apparaît dans aucun statut ni aucune migration de brouillon", () => {
    expect(contentDraftStatuses).not.toContain("published");

    const migration = readFileSync(
      join(repoRoot, "packages/db/migrations/0013_content_drafts.sql"),
      "utf8"
    );
    const statusCheck = migration.match(/status[^;]*IN \(([^)]*)\)/i)?.[1] ?? "";

    expect(statusCheck).not.toContain("published");
  });

  it("expose un registre de calculs fermé et non vide", () => {
    expect(CALCULATION_TEMPLATE_IDS.length).toBeGreaterThan(0);

    for (const id of CALCULATION_TEMPLATE_IDS) {
      expect(id, "chaque template porte une version").toMatch(/\.v\d+$/);
    }
  });

  it("n'installe aucun SDK d'IA supplémentaire", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages/content-generation/package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };

    const dependencies = Object.keys(manifest.dependencies ?? {});

    expect(dependencies).toEqual(
      expect.arrayContaining(["@finance/ai", "@finance/domain", "@finance/ingest", "zod"])
    );
    // Le provider live s'appuie sur packages/ai : aucun client HTTP nouveau.
    expect(dependencies.some((name) => /openai|anthropic|langchain|@ai-sdk/.test(name))).toBe(false);
  });
});
