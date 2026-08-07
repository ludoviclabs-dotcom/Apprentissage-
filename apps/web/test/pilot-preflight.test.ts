import { describe, expect, it } from "vitest";
import {
  checkDatabase,
  countByStatus,
  describeGenerationMode,
  documentsForChapter,
  maskPath,
  parseArgs,
  renderReport,
  trackedPrivateFiles,
  UsageError,
  workingTreeChanges,
  type PreflightCheck
} from "../../../scripts/pilot-preflight";
import { describeDatabaseTarget } from "../../../packages/db/src/preflight";

/**
 * Le prévol du pilote.
 *
 * Ce qui est vérifié ici est ce qui doit rester vrai quoi qu'il arrive : un
 * rapport n'imprime jamais un chemin privé complet, le shell l'emporte sur le
 * fichier `.env`, le mock n'est jamais présenté comme un mode de génération
 * disponible, et un blocage produit bien un verdict NO-GO. Les fixtures sont
 * fictives : aucun chemin, aucun nom de document et aucune base réelle n'entre
 * dans ce fichier.
 */

const CHECKS: PreflightCheck[] = [
  { id: "a", label: "racine des sources", status: "ok", detail: "…/dossier accessible" },
  { id: "b", label: "base de données", status: "blocked", detail: "injoignable", hint: "démarrer PostgreSQL" },
  { id: "c", label: "mode de génération", status: "warn", detail: "repli manual-assisted" }
];

describe("masquage des chemins", () => {
  it("réduit un chemin absolu à son dernier segment", () => {
    expect(maskPath("C:\\Users\\quelquun\\Cloud\\Matière\\Dossier")).not.toContain("quelquun");
    expect(maskPath("C:\\Users\\quelquun\\Cloud\\Matière\\Dossier")).toContain("Dossier");
    expect(maskPath("/home/quelquun/cloud/dossier")).not.toContain("quelquun");
  });

  it("laisse un chemin relatif au dépôt tel quel", () => {
    expect(maskPath("content-private")).toBe("content-private");
    expect(maskPath("data/extracted")).toBe("data/extracted");
  });
});

describe("mode de génération", () => {
  it("retient un provider live complètement configuré", () => {
    expect(
      describeGenerationMode({
        CONTENT_AI_ENABLED: "true",
        CONTENT_AI_PROVIDER: "openai",
        OPENAI_API_KEY: "valeur-de-test"
      }).mode
    ).toBe("live");
  });

  it("ne présente jamais le mock comme un mode disponible", () => {
    for (const env of [
      {},
      { CONTENT_AI_ENABLED: "true", CONTENT_AI_PROVIDER: "mock" },
      { CONTENT_AI_ENABLED: "true", CONTENT_AI_PROVIDER: "none" },
      { CONTENT_AI_ENABLED: "false", CONTENT_AI_PROVIDER: "openai", OPENAI_API_KEY: "valeur-de-test" }
    ]) {
      const verdict = describeGenerationMode(env);

      expect(verdict.mode).toBe("manual-assisted");
      expect(verdict.mode).not.toBe("mock");
    }
  });

  it("refuse le live quand la clé manque", () => {
    expect(
      describeGenerationMode({ CONTENT_AI_ENABLED: "true", CONTENT_AI_PROVIDER: "openai" }).mode
    ).toBe("manual-assisted");
  });
});

describe("cible de base de données", () => {
  it("préfère DATABASE_ADMIN_URL et ne retient ni utilisateur ni mot de passe", () => {
    const target = describeDatabaseTarget({
      DATABASE_ADMIN_URL: "postgresql://proprio:motdepasse@localhost:5432/base_test",
      DATABASE_URL: "postgresql://app:autre@localhost:5432/base_test"
    });

    expect(target?.variable).toBe("DATABASE_ADMIN_URL");
    expect(JSON.stringify(target)).not.toContain("motdepasse");
    expect(JSON.stringify(target)).not.toContain("proprio");
    expect(target?.label).toBe("localhost:5432/base_test");
  });

  it("demande une confirmation dès que la cible n'est pas une boucle locale", () => {
    expect(
      describeDatabaseTarget({ DATABASE_URL: "postgresql://u:p@localhost:5432/b" })?.requiresConfirmation
    ).toBe(false);
    expect(
      describeDatabaseTarget({ DATABASE_URL: "postgresql://u:p@db.exemple.test:5432/b" })
        ?.requiresConfirmation
    ).toBe(true);
  });

  it("rend null sans configuration lisible", () => {
    expect(describeDatabaseTarget({})).toBeNull();
    expect(describeDatabaseTarget({ DATABASE_URL: "pas-une-url" })).toBeNull();
  });
});

describe("contrôles de base", () => {
  it("bloque la base et les migrations quand rien n'est configuré", () => {
    const checks = checkDatabase({ status: "unconfigured", reason: "rien" });

    expect(checks.every((check) => check.status === "blocked")).toBe(true);
    expect(checks.map((check) => check.id)).toEqual(["database", "migrations"]);
  });

  it("bloque les migrations quand une table attendue manque", () => {
    const checks = checkDatabase({
      status: "reachable",
      target: {
        variable: "DATABASE_URL",
        host: "localhost",
        port: 5432,
        database: "b",
        label: "localhost:5432/b",
        loopback: true,
        requiresConfirmation: false
      },
      serverVersion: "PostgreSQL 16",
      presentTables: ["content_drafts"],
      missingTables: ["published_content_versions"]
    });

    expect(checks.find((check) => check.id === "migrations")?.status).toBe("blocked");
    expect(checks.find((check) => check.id === "migrations")?.detail).toContain(
      "published_content_versions"
    );
  });

  it("avertit sur une cible distante sans la bloquer", () => {
    const checks = checkDatabase({
      status: "reachable",
      target: {
        variable: "DATABASE_URL",
        host: "db.exemple.test",
        port: 5432,
        database: "b",
        label: "db.exemple.test:5432/b",
        loopback: false,
        requiresConfirmation: true
      },
      serverVersion: "PostgreSQL 16",
      presentTables: ["content_drafts", "published_content_versions"],
      missingTables: []
    });

    expect(checks.find((check) => check.id === "database-target")?.status).toBe("warn");
    expect(countByStatus(checks, "blocked")).toBe(0);
  });
});

describe("documents du chapitre", () => {
  const files = [
    { originalName: "Les emprunts obligataires - Fiche de cours.pdf", category: "course", chapterSlug: "les-emprunts-obligataires" },
    { originalName: "Les emprunts obligataires - Mise en situation.pdf", category: "exercise", chapterSlug: "les-emprunts-obligataires" },
    { originalName: "Les titres - Fiche de cours.pdf", category: "course", chapterSlug: "les-titres" }
  ];

  it("retient le chapitre demandé, avec ou sans article", () => {
    expect(documentsForChapter(files, "Emprunts obligataires")).toHaveLength(2);
    expect(documentsForChapter(files, "Les emprunts obligataires")).toHaveLength(2);
  });

  it("ne retient rien pour un chapitre absent", () => {
    expect(documentsForChapter(files, "Amortissements dérogatoires")).toHaveLength(0);
  });
});

describe("hygiène Git", () => {
  it("ignore les .gitkeep des dossiers git-ignorés", () => {
    const git = () => ["data/extracted/.gitkeep", "data/generated/drafts/.gitkeep", ""].join("\n");

    expect(trackedPrivateFiles(git)).toEqual([]);
  });

  it("signale un fichier privé réellement suivi", () => {
    const git = () => "data/extracted/pack/manifest.json\n";

    expect(trackedPrivateFiles(git)).toEqual(["data/extracted/pack/manifest.json"]);
  });

  it("compte les changements non commités", () => {
    expect(workingTreeChanges(() => " M scripts/pilot-preflight.ts\n?? note.txt\n")).toHaveLength(2);
    expect(workingTreeChanges(() => "")).toHaveLength(0);
  });
});

describe("rendu du rapport", () => {
  it("conclut NO-GO dès qu'un contrôle bloque, et détaille le remède", () => {
    const rendered = renderReport({ chapter: "Emprunts obligataires", pack: "pack-test", checks: CHECKS });

    expect(rendered).toContain("Verdict : NO-GO — 1 blocage(s).");
    expect(rendered).toContain("démarrer PostgreSQL");
    expect(rendered).toContain("Avertissements (1)");
  });

  it("conclut GO quand rien ne bloque", () => {
    const rendered = renderReport({
      chapter: "Emprunts obligataires",
      pack: "pack-test",
      checks: CHECKS.filter((check) => check.status !== "blocked")
    });

    expect(rendered).toContain("Verdict : GO (1 avertissement(s)).");
  });
});

describe("analyse des arguments", () => {
  it("exige --chapter et accepte le séparateur de pnpm", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(parseArgs(["--", "--chapter", "Emprunts obligataires"])).toEqual({
      chapter: "Emprunts obligataires",
      pack: "compta-approfondie"
    });
  });

  it("refuse une option inconnue plutôt que de l'ignorer", () => {
    expect(() => parseArgs(["--chapter", "X", "--mode", "live"])).toThrow(/option inconnue/);
  });
});
