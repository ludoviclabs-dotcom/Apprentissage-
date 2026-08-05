import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("hygiène du dépôt — sources privées", () => {
  it("aucun PDF n'est suivi par Git", () => {
    const output = execFileSync("git", ["ls-files", "*.pdf", "*.PDF"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();

    expect(output).toBe("");
  });

  it(".gitignore couvre les sources privées et les artefacts extraits", () => {
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(gitignore).toContain("content-private/");
    expect(gitignore).toContain("*.pdf");
    expect(gitignore).toContain("data/extracted/*");
    expect(gitignore).toContain("data/generated/drafts/*");
  });

  it("assemble-compta.mjs ne dépend plus d'un chemin temporaire absolu", () => {
    const script = readFileSync(join(repoRoot, "packages", "domain", "assemble-compta.mjs"), "utf8");

    expect(script).not.toMatch(/AppData/i);
    expect(script).not.toMatch(/Temp[/\\]claude/i);
    // Aucune constante de chemin absolu Windows (`C:/...`) ou POSIX (`"/home/...`).
    expect(script).not.toMatch(/["'][A-Za-z]:[/\\]/);
    expect(script).not.toMatch(/["']\/(home|Users)\//);
  });

  it("le pipeline de contenu ne contient aucun chemin absolu codé en dur", () => {
    // --others --exclude-standard couvre aussi les fichiers pas encore commités.
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "packages/ingest/src"],
      { cwd: repoRoot, encoding: "utf8" }
    )
      .split("\n")
      .filter((file) => file.endsWith(".ts"));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      expect(source, `${file} contient un chemin absolu`).not.toMatch(/["'][A-Za-z]:[/\\]/);
      expect(source, `${file} contient un chemin absolu`).not.toMatch(/["']\/(home|Users)\//);
    }
  });
});
