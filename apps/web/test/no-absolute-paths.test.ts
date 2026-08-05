import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Aucun chemin absolu dans le code de l'application web.
 *
 * La règle vaut d'abord pour les Client Components : leur code part chez chaque
 * visiteur, et une valeur par défaut codée en dur y expédie l'arborescence du
 * poste de développement — nom d'utilisateur compris. C'est exactement ce qui
 * était arrivé au formulaire d'import de packs, dont le champ était pré-rempli
 * avec `C:\Users\<nom>\...` et servi à quiconque ouvrait `/source-packs`.
 *
 * Elle est étendue au code serveur du même dossier : un chemin machine y est
 * tout aussi peu portable, et rien ne garantit qu'il ne finira pas dans un
 * message d'erreur renvoyé au navigateur.
 *
 * Les exemples destinés à l'affichage passent par un `placeholder` relatif,
 * jamais par une lettre de lecteur — sinon ils déclencheraient ce test.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Lettre de lecteur (`"C:\…"`) ou racine POSIX personnelle (`"/home/…"`). */
const WINDOWS_ABSOLUTE = /["'`][A-Za-z]:[/\\]/;
const POSIX_HOME_ABSOLUTE = /["'`]\/(home|Users)\//;

function trackedSources(directory: string): string[] {
  // `--others --exclude-standard` couvre aussi ce qui n'est pas encore commité,
  // pour que la règle morde avant la revue plutôt qu'après.
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", directory],
    { cwd: repoRoot, encoding: "utf8" }
  )
    .split("\n")
    .map((file) => file.trim())
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("aucun chemin absolu dans apps/web", () => {
  for (const directory of [
    "apps/web/components",
    "apps/web/app",
    "apps/web/lib"
  ]) {
    it(`${directory} ne contient aucun chemin de poste codé en dur`, () => {
      const files = trackedSources(directory);

      expect(files.length, `aucun fichier trouvé sous ${directory}`).toBeGreaterThan(0);

      for (const file of files) {
        const source = readFileSync(join(repoRoot, file), "utf8");

        expect(source, `${file} comporte un chemin Windows absolu`).not.toMatch(WINDOWS_ABSOLUTE);
        expect(source, `${file} comporte un chemin personnel absolu`).not.toMatch(POSIX_HOME_ABSOLUTE);
      }
    });
  }

  it("l'assistant d'import ne pré-remplit aucun chemin", () => {
    // Le formulaire d'import a été remplacé par un assistant : il ne poste plus
    // rien, mais il garde un champ, donc la règle du champ vide reste la même.
    const source = readFileSync(
      join(repoRoot, "apps/web/components/forms/source-pack-import-guide.tsx"),
      "utf8"
    );

    // La valeur initiale est vide : l'exemple vit dans le placeholder.
    expect(source).toMatch(/useState\(""\)/);
    expect(source).toContain("placeholder=");
  });

  it("l'exemple proposé à l'utilisateur est relatif", () => {
    const source = readFileSync(join(repoRoot, "apps/web/lib/source-packs/import-command.ts"), "utf8");

    expect(source).toContain('PATH_PLACEHOLDER = "source-packs/mon-pack"');
  });
});
