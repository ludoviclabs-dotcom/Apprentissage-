import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Aucun import de source pack déclenché depuis le navigateur.
 *
 * La page des source packs affichait un formulaire qui envoyait un chemin local
 * au serveur ; celui-ci répondait invariablement une erreur, parce qu'un
 * serveur web n'a pas accès au disque de l'utilisateur et qu'une instance
 * déployée n'y aurait de toute façon aucun accès. Le formulaire promettait donc
 * une action qui ne pouvait pas aboutir.
 *
 * Ces tests empêchent la promesse de revenir : ni composant qui poste vers la
 * route, ni exécution de commande depuis l'application.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Le code de l'application, à l'exclusion des tests.
 *
 * Les tests ne partent jamais au navigateur et vivent, eux, du droit de nommer
 * ce qu'ils interdisent : celui-ci liste les fichiers via `child_process` et
 * cite `CONTENT_SOURCE_ROOT` dans ses propres assertions. Les inclure ferait
 * échouer les règles sur leur propre énoncé.
 */
function webSources(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "apps/web"],
    { cwd: repoRoot, encoding: "utf8" }
  )
    .split("\n")
    .map((file) => file.trim())
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .filter((file) => !file.includes("/.next/"))
    .filter((file) => !file.startsWith("apps/web/test/"));
}

describe("aucun import déclenché depuis le navigateur", () => {
  it("aucun composant ne poste vers /api/source-packs", () => {
    const offenders: string[] = [];

    for (const file of webSources()) {
      // La route elle-même cite l'URL légitimement.
      if (file.endsWith("app/api/source-packs/route.ts")) {
        continue;
      }

      const source = readFileSync(join(repoRoot, file), "utf8");

      if (/postJson\s*[<(][^)]*api\/source-packs/.test(source) || /fetch\([^)]*api\/source-packs/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("l'ancien formulaire d'import n'existe plus", () => {
    expect(webSources()).not.toContain("apps/web/components/forms/source-pack-import-form.tsx");
  });

  it("l'assistant ne contient aucun appel réseau d'import", () => {
    const guide = readFileSync(
      join(repoRoot, "apps/web/components/forms/source-pack-import-guide.tsx"),
      "utf8"
    );

    expect(guide).not.toContain("postJson");
    expect(guide).not.toMatch(/fetch\(/);
    expect(guide).not.toContain("api/source-packs");
    // Le seul aller-retour serveur admis est la relecture de la page.
    expect(guide).toContain("router.refresh()");
  });

  it("l'application n'exécute aucune commande shell", () => {
    for (const file of webSources()) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} importe child_process`).not.toMatch(
        /from\s+["']node:child_process["']|require\(["']child_process["']\)/
      );
      expect(source, `${file} appelle exec/spawn`).not.toMatch(/\b(execSync|spawnSync|execFile|spawn)\s*\(/);
    }
  });

  it("la route expose GET et refuse POST en 405 avec un en-tête Allow", () => {
    const route = readFileSync(join(repoRoot, "apps/web/app/api/source-packs/route.ts"), "utf8");

    expect(route).toContain("export async function GET");
    expect(route).toContain("status: 405");
    expect(route).toContain('Allow: "GET"');
    expect(route).toContain("METHOD_NOT_ALLOWED");
    // 403 disait « interdit à vous » là où la méthode n'existe simplement pas.
    expect(route).not.toContain("status: 403");
  });

  it("ne lit aucun chemin local et n'expose pas la racine des sources au navigateur", () => {
    for (const file of webSources()) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      expect(source, `${file} expose CONTENT_SOURCE_ROOT`).not.toContain("CONTENT_SOURCE_ROOT");
    }
  });
});
