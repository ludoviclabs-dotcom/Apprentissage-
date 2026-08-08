import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationFiles } from "../src/schema";

/**
 * Audit structurel de la migration 0015.
 *
 * IL N'Y A PAS DE POSTGRESQL ICI, COMME POUR 0014. Ce fichier vérifie ce que le
 * *texte* de la migration doit porter — idempotence, absence de destruction,
 * nullabilité des colonnes ajoutées, valeurs admises — c'est-à-dire les
 * propriétés dont l'absence est une faute quelle que soit l'instance. Ce qu'il
 * ne prouve pas : que PostgreSQL l'accepte. C'est le rôle de
 * `normative-persistence.integration.test.ts`, qui s'exécute quand une base est
 * fournie et se saute bruyamment sinon.
 */

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION = "migrations/0015_published_normative_context.sql";
const sql = readFileSync(join(migrationsDir, "0015_published_normative_context.sql"), "utf8");

/** Le SQL sans ses commentaires : un motif interdit ne doit pas matcher une explication. */
const statements = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("migration 0015 — enregistrement", () => {
  it("est déclarée dans migrationFiles, en dernier", () => {
    expect(migrationFiles.at(-1)).toBe(MIGRATION);
  });

  it("suit 0014 sans trou de numérotation", () => {
    const numbers = migrationFiles.map((file) => Number.parseInt(file.slice("migrations/".length), 10));

    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });
});

describe("migration 0015 — idempotence", () => {
  // Le lanceur rejoue *toutes* les migrations à chaque `pnpm db:migrate` : une
  // instruction non idempotente casse la deuxième exécution, donc chaque
  // déploiement après le premier.
  it("ajoute ses colonnes sous IF NOT EXISTS", () => {
    for (const column of ["normative_context_snapshot", "normative_profile", "scoring_policy"]) {
      expect(statements, `${column} doit être ajoutée sous IF NOT EXISTS`).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${column}`)
      );
    }
  });

  it("garde chaque contrainte derrière pg_constraint", () => {
    const constraints = [...statements.matchAll(/ADD CONSTRAINT (\w+)/g)].map((match) => match[1]);

    expect(constraints.length).toBeGreaterThan(0);

    for (const name of constraints) {
      expect(statements, `${name} doit être gardée par pg_constraint`).toContain(
        `SELECT 1 FROM pg_constraint WHERE conname = '${name}'`
      );
    }
  });

  it("crée son index sous IF NOT EXISTS", () => {
    expect(statements).toMatch(/CREATE INDEX IF NOT EXISTS published_content_versions_scoring_idx/);
  });
});

describe("migration 0015 — non destructive", () => {
  it("ne supprime ni colonne, ni table, ni contrainte existante", () => {
    expect(statements).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
  });

  it("ne réécrit aucun instantané existant", () => {
    // Un back-fill affirmerait un référentiel que personne n'a relu, et le ferait
    // en silence — exactement ce que le modèle normatif interdit.
    expect(statements).not.toMatch(/\bUPDATE\s+published_content_versions/i);
  });

  it("n'impose pas NOT NULL aux colonnes ajoutées", () => {
    // Les lignes antérieures n'ont jamais porté de référentiel. NOT NULL ferait
    // échouer la migration sur une installation qui en contient.
    expect(statements).not.toMatch(/normative_context_snapshot\s+JSONB\s+NOT NULL/i);
    expect(statements).not.toMatch(/SET NOT NULL/i);
  });
});

describe("migration 0015 — valeurs admises", () => {
  it("borne le profil aux trois profils du modèle", () => {
    for (const profile of ["anc-2026-current", "course-original", "entity-specific"]) {
      expect(statements).toContain(`'${profile}'`);
    }
  });

  it("borne la politique de notation aux trois politiques du modèle", () => {
    for (const policy of ["graded", "comparison-only", "not-gradable"]) {
      expect(statements).toContain(`'${policy}'`);
    }
  });

  it("admet le nul, qui est l'état d'une ligne antérieure", () => {
    expect(statements).toMatch(/normative_profile IS NULL/);
    expect(statements).toMatch(/scoring_policy IS NULL/);
  });

  it("exige que les trois colonnes s'accordent sur ce qui est connu", () => {
    // Un profil sans instantané ne serait pas auditable ; un instantané sans
    // profil laisserait les requêtes de résumé lire « non classé » pour un
    // contenu qui l'est.
    expect(statements).toContain("published_content_versions_normative_pair_check");
  });
});
