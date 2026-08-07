import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyEnvFile, loadLocalEnv, parseEnvFile } from "../src/local-config";

/**
 * Le chargeur de `.env` des commandes en ligne.
 *
 * Deux propriétés comptent, et une seule est évidente : lire les paires, et ne
 * jamais écraser le shell. La seconde est ce qui permet d'essayer une autre
 * racine de sources le temps d'une commande sans éditer un fichier — et ce qui
 * fait qu'un `.env` oublié ne détourne pas silencieusement une commande qu'un
 * opérateur croit paramétrer à la main.
 */

describe("analyse d'un .env", () => {
  it("lit les paires et ignore le reste", () => {
    expect(
      parseEnvFile(
        [
          "# un commentaire",
          "",
          "SIMPLE=valeur",
          'GUILLEMETS="entre guillemets"',
          "APOSTROPHES='entre apostrophes'",
          "ESPACES = autour ",
          "SANS_SEPARATEUR",
          "=sans-cle",
          "1_INVALIDE=x"
        ].join("\n")
      )
    ).toEqual({
      SIMPLE: "valeur",
      GUILLEMETS: "entre guillemets",
      APOSTROPHES: "entre apostrophes",
      ESPACES: "autour"
    });
  });

  it("conserve un chemin Windows accentué tel quel", () => {
    expect(parseEnvFile("CONTENT_SOURCE_ROOT=C:\\Dossier\\Comptabilité Approfondie")).toEqual({
      CONTENT_SOURCE_ROOT: "C:\\Dossier\\Comptabilité Approfondie"
    });
  });

  it("conserve un « = » présent dans la valeur", () => {
    expect(parseEnvFile("URL=postgresql://h/b?a=1&b=2")).toEqual({ URL: "postgresql://h/b?a=1&b=2" });
  });
});

describe("application à l'environnement", () => {
  it("n'écrase jamais une valeur venue du shell", () => {
    const env: NodeJS.ProcessEnv = { DEJA_LA: "shell" };
    const result = applyEnvFile({ DEJA_LA: "fichier", NOUVELLE: "fichier" }, env);

    expect(env.DEJA_LA).toBe("shell");
    expect(env.NOUVELLE).toBe("fichier");
    expect(result).toEqual({ applied: ["NOUVELLE"], overridden: ["DEJA_LA"] });
  });

  it("traite une variable vide comme définie, pas comme absente", () => {
    const env: NodeJS.ProcessEnv = { VIDE: "" };
    applyEnvFile({ VIDE: "fichier" }, env);

    expect(env.VIDE).toBe("");
  });
});

describe("chargement depuis la racine", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "local-config-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("signale l'absence de fichier sans échouer", () => {
    expect(loadLocalEnv(root, {})).toEqual({ found: false, applied: [], overridden: [] });
  });

  it("applique le fichier présent", async () => {
    await writeFile(join(root, ".env"), "CONTENT_SOURCE_ROOT=quelque-part\n", "utf8");
    const env: NodeJS.ProcessEnv = {};

    expect(loadLocalEnv(root, env).found).toBe(true);
    expect(env.CONTENT_SOURCE_ROOT).toBe("quelque-part");
  });
});
