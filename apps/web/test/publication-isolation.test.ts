import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertSeedAllowed,
  SEEDED_STORE_ROOT,
  SeedRefusedError,
  seedTestStore,
  TEST_STORE_PARENT
} from "../../../scripts/seed-published-content";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Le code d'un fichier, commentaires retirés.
 *
 * Les assertions ci-dessous portent sur ce que le code *fait*, pas sur ce qu'il
 * explique. Sans ce retrait, un commentaire disant « ce script ne lit jamais
 * data/extracted » ferait échouer le test qui vérifie qu'il ne le lit pas — et
 * la seule façon de le faire passer serait de supprimer l'explication.
 */
function codeWithoutComments(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
}

/** Fichiers suivis *et* non suivis, comme `no-absolute-paths.test.ts` les liste. */
function trackedFiles(...paths: string[]): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...paths], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Isolation des contenus de test.
 *
 * Le risque que ce fichier couvre n'est pas « le seed a un bug » mais « le seed
 * s'exécute là où il ne devrait pas ». Ce sont deux choses différentes, et la
 * seconde ne se voit pas en lisant le code : elle se voit en essayant de la
 * provoquer.
 */

describe("le seed refuse de s'exécuter hors du contexte de test", () => {
  it("refuse NODE_ENV=production, drapeau ou pas", () => {
    expect(() =>
      assertSeedAllowed(
        { NODE_ENV: "production", ALLOW_TEST_CONTENT_SEED: "true" },
        SEEDED_STORE_ROOT
      )
    ).toThrow(SeedRefusedError);

    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", ALLOW_TEST_CONTENT_SEED: "true" }, SEEDED_STORE_ROOT)
    ).toThrow(/NODE_ENV=production/);
  });

  it("refuse quand ALLOW_TEST_CONTENT_SEED est absent", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "test" }, SEEDED_STORE_ROOT)).toThrow(
      /ALLOW_TEST_CONTENT_SEED/
    );
  });

  it("refuse toute valeur autre que « true »", () => {
    // Une variable posée à « 1 », « yes » ou « false » ne doit pas activer les
    // fixtures : l'activation est explicite ou n'est pas.
    for (const value of ["1", "yes", "TRUE", "false", ""]) {
      expect(() =>
        assertSeedAllowed({ NODE_ENV: "test", ALLOW_TEST_CONTENT_SEED: value }, SEEDED_STORE_ROOT)
      ).toThrow(SeedRefusedError);
    }
  });

  it("accepte uniquement l'activation explicite hors production", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "test", ALLOW_TEST_CONTENT_SEED: "true" }, SEEDED_STORE_ROOT)
    ).not.toThrow();
  });

  it("refuse d'écrire ailleurs que sous test-results/", () => {
    const env = { NODE_ENV: "test", ALLOW_TEST_CONTENT_SEED: "true" };

    for (const target of [
      join(repoRoot, "content", "published"),
      join(repoRoot, "data", "generated"),
      repoRoot,
      TEST_STORE_PARENT
    ]) {
      expect(() => assertSeedAllowed(env, target), `${target} accepté à tort`).toThrow(
        SeedRefusedError
      );
    }
  });
});

describe("le seed est confiné et idempotent", () => {
  let target: string;
  const previous = process.env.ALLOW_TEST_CONTENT_SEED;

  beforeEach(async () => {
    process.env.ALLOW_TEST_CONTENT_SEED = "true";
    target = join(TEST_STORE_PARENT, `unit-${await mkdtemp(join(tmpdir(), "seed-")).then((path) => path.slice(-6))}`);
  });

  afterEach(async () => {
    process.env.ALLOW_TEST_CONTENT_SEED = previous;
    await rm(target, { recursive: true, force: true });
  });

  it("écrit six contenus, deux fois de suite, sans conflit", async () => {
    expect(await seedTestStore(target)).toBe(6);
    // Deuxième exécution : le magasin est remis à zéro plutôt que de buter sur
    // « un instantané publié n'est jamais réécrit ».
    expect(await seedTestStore(target)).toBe(6);

    expect(existsSync(join(target, "index.json"))).toBe(true);
  });

  it("n'écrit rien dans le magasin du dépôt", async () => {
    const before = readFileSync(join(repoRoot, "content", "published", "index.json"), "utf8");
    await seedTestStore(target);
    const after = readFileSync(join(repoRoot, "content", "published", "index.json"), "utf8");

    expect(after).toBe(before);
    expect(JSON.parse(after).entries).toEqual([]);
  });

  it("préfixe ses identifiants pour qu'aucun ne passe pour du contenu réel", async () => {
    await seedTestStore(target);
    const index = JSON.parse(readFileSync(join(target, "index.json"), "utf8"));

    expect(index.entries.length).toBe(6);

    for (const entry of index.entries) {
      expect(entry.sourceArtifactId, `${entry.id} n'est pas préfixé`).toMatch(/^e2e-/);
    }
  });

  it("ne lit aucun PDF ni aucun corpus privé", () => {
    const source = codeWithoutComments("scripts/seed-published-content.ts");

    expect(source).not.toMatch(/data\/extracted/);
    expect(source).not.toMatch(/content-private/);
    expect(source).not.toMatch(/\.pdf/i);
  });

  it("ne produit aucun artefact suivi par Git", () => {
    // `test-results/` est git-ignoré : le magasin amorcé ne peut pas se
    // retrouver dans un commit par distraction.
    const ignored = execFileSync("git", ["check-ignore", "test-results/published-content"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(ignored.trim()).not.toHaveLength(0);
  });
});

describe("le magasin de fichiers n'est jamais sélectionné par défaut en production", () => {
  const source = codeWithoutComments("apps/web/lib/publication/store.ts");

  it("exige un aveu explicite quand NODE_ENV vaut production", () => {
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('process.env.ALLOW_FILE_PUBLICATION_STORE === "true"');
  });

  it("donne la priorité à la base quand elle est configurée", () => {
    // `canUseDatabase()` est testé *avant* le magasin de fichiers : une
    // installation qui a les deux sert la base.
    const driver = source.slice(source.indexOf("function resolveDriver"));

    expect(driver.indexOf("canUseDatabase()")).toBeLessThan(driver.indexOf("fileStoreAllowed()"));
  });

  it("ne se rabat sur aucune fixture quand aucun magasin n'est disponible", () => {
    // Le troisième cas est un échec bruyant, pas un chapitre vide : une
    // production mal configurée doit se voir.
    expect(source).toContain("PublicationStoreUnavailableError");
    expect(source).not.toMatch(/fixtures?/i);
  });
});

describe("le build ne déclenche ni amorçage ni appel de modèle", () => {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

  it("la commande de build ne lance pas le seed", () => {
    expect(packageJson.scripts.build).not.toMatch(/seed/i);
  });

  it("aucun script de cycle de vie npm ne lance le seed", () => {
    for (const [name, command] of Object.entries(packageJson.scripts as Record<string, string>)) {
      if (/^(pre|post)?(install|build|start|prepare|prepublish)/.test(name)) {
        expect(command, `${name} amorce des contenus de test`).not.toMatch(/seed-published/);
      }
    }
  });

  it("un seul chemin d'exécution mène au seed : celui de Playwright", () => {
    // Ce qui compte n'est pas de *mentionner* le script — un commentaire le
    // fait légitimement — mais de l'*exécuter*. Toute autre invocation serait
    // une manière de plus d'amorcer des fixtures sans le vouloir.
    // Aucun chemin passé : tous les fichiers suivis du dépôt sont examinés.
    const invoking = trackedFiles()
      .filter((file) => /\.(ts|tsx|json|ya?ml|mjs)$/.test(file))
      .filter((file) => /tsx\s+scripts\/seed-published-content/.test(readFileSync(join(repoRoot, file), "utf8")));

    expect(invoking).toEqual(["playwright.config.ts"]);
  });

  it("aucune page publique n'atteint un fournisseur d'IA", () => {
    const files = execFileSync(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "apps/web/app/modules/comptabilite-approfondie",
        "apps/web/components/compta-approfondie",
        "apps/web/lib/publication"
      ],
      { cwd: repoRoot, encoding: "utf8" }
    )
      .split("\n")
      .map((line) => line.trim())
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const content = readFileSync(join(repoRoot, file), "utf8");

      expect(content, `${file} atteint @finance/ai`).not.toMatch(/@finance\/ai/);
      expect(content, `${file} appelle un fournisseur`).not.toMatch(/openai|ollama|anthropic/i);
    }
  });
});
