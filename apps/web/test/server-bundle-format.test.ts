import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Le paquet de l'application ne déclare pas `"type": "module"`.
 *
 * CE N'EST PAS UNE PRÉFÉRENCE DE STYLE, C'EST CE QUI FAIT RÉPONDRE LA
 * PRODUCTION. Next construit ses pages serveur en CommonJS — `require(…)`,
 * `module.exports` — et le lanceur de la fonction Vercel
 * (`___next_launcher.cjs`) les charge avec `require()`. Déclarer le paquet
 * comme module ES fait lire tout `.js` de son périmètre comme un module ES : le
 * `require()` du lanceur échoue alors en `ERR_REQUIRE_ESM`, et **toutes** les
 * pages rendues à la demande répondent 500.
 *
 * La panne ne se voit ni au `build`, ni en développement, ni dans les tests :
 * `next dev` ne passe pas par ce lanceur. Elle n'apparaît qu'une fois déployée,
 * et seulement sur les routes rendues à la demande — ce qui l'a laissée deux
 * jours en production, sur toutes les pages, sans qu'aucun contrôle ne bronche.
 * D'où ce test : il vérifie la seule ligne qui la cause.
 *
 * Les paquets de `packages/` gardent `"type": "module"` à juste titre — ils
 * sont exécutés directement par `tsx` et sont réellement des modules ES. Seul
 * le périmètre dont Next remplit le dossier `.next/server` est concerné.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

/** `git ls-files` sur `apps/web`, sans faire échouer la suite hors dépôt Git. */
function versionedWebFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files", "apps/web"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

describe("format du paquet applicatif", () => {
  it("ne déclare pas le paquet web comme module ES", () => {
    const manifest = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      type?: string;
    };

    expect(
      manifest.type,
      'apps/web/package.json ne doit pas porter "type": "module" : le lanceur de fonction Vercel charge les pages Next par require(), et ERR_REQUIRE_ESM ferait répondre 500 à toutes les routes rendues à la demande'
    ).toBeUndefined();
  });

  it("ne versionne aucun fichier .js dans apps/web", () => {
    // Le corollaire de la règle précédente : sans `"type": "module"`, un `.js`
    // écrit ici serait lu comme du CommonJS. Il n'y en a aucun — tout est en
    // TypeScript — et ce test le maintient, pour qu'un `.js` en syntaxe ES ne
    // vienne pas rouvrir la question par l'autre bout.
    expect(versionedWebFiles().filter((file) => /\.(js|mjs)$/.test(file))).toEqual([]);
  });
});
