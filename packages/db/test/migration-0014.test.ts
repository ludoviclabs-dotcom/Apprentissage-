import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrationFiles, tables, userOwnedTables } from "../src/schema";

/**
 * Audit structurel de la migration 0014.
 *
 * IL N'Y A PAS DE POSTGRESQL ICI, ET C'EST ASSUMÉ. Le dépôt fournit une base par
 * `docker-compose.yml`, mais Docker n'est pas disponible sur toutes les machines
 * de développement, et le cahier des charges interdit d'installer un second
 * moteur pour ce seul contrôle. Ce fichier vérifie donc les propriétés que le
 * *texte* de la migration doit porter — celles dont l'absence est une faute
 * quelle que soit l'instance : idempotence, absence de destruction, unicité de
 * la version active, cohérence avec `schema.ts`.
 *
 * Ce que cela ne prouve pas : que PostgreSQL l'accepte. `docs/compta-public-pre-pr-audit.md`
 * donne la procédure pour l'appliquer sur une base éphémère quand Docker est là.
 */

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION = "migrations/0014_content_publication.sql";
const sql = readFileSync(join(migrationsDir, "0014_content_publication.sql"), "utf8");

/** Le SQL sans ses commentaires : les motifs interdits ne doivent pas matcher une explication. */
const statements = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("migration 0014 — enregistrement", () => {
  it("est déclarée dans migrationFiles, en dernier", () => {
    expect(migrationFiles.at(-1)).toBe(MIGRATION);
  });

  it("déclare ses trois tables dans schema.ts", () => {
    for (const table of [
      "published_content_versions",
      "content_publication_audit",
      "chapter_activity_events"
    ]) {
      expect(tables, `${table} absente de tables`).toContain(table);
    }
  });

  it("ne place sous RLS que la table réellement personnelle", () => {
    // Le contenu publié est partagé et n'a pas de propriétaire à policer ; ce
    // qu'un apprenant a fait de ce contenu, si.
    expect(userOwnedTables).toContain("chapter_activity_events");
    expect(userOwnedTables).not.toContain("published_content_versions");
    expect(userOwnedTables).not.toContain("content_publication_audit");
  });
});

describe("migration 0014 — idempotence", () => {
  it("ne crée aucune table sans IF NOT EXISTS", () => {
    const creations = statements.match(/CREATE TABLE[^(]*/gi) ?? [];

    expect(creations.length).toBeGreaterThan(0);

    for (const creation of creations) {
      expect(creation, `« ${creation.trim()} » n'est pas idempotente`).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("ne crée aucun index sans IF NOT EXISTS", () => {
    const creations = statements.match(/CREATE (?:UNIQUE )?INDEX[^(]*/gi) ?? [];

    expect(creations.length).toBeGreaterThan(0);

    for (const creation of creations) {
      expect(creation, `« ${creation.trim()} » n'est pas idempotente`).toMatch(/IF NOT EXISTS/i);
    }
  });

  it("ajoute chaque contrainte derrière une garde pg_constraint", () => {
    const additions = (statements.match(/ADD CONSTRAINT\s+(\w+)/gi) ?? []).map((match) =>
      match.replace(/ADD CONSTRAINT\s+/i, "")
    );

    expect(additions.length).toBeGreaterThan(0);

    for (const name of additions) {
      // `CREATE TABLE IF NOT EXISTS` ignore tout son corps quand la table
      // existe : une contrainte écrite en ligne ne serait jamais appliquée à une
      // table créée par une révision antérieure du fichier. La garde nommée
      // converge, elle.
      expect(statements, `la contrainte ${name} n'est pas gardée`).toContain(
        `conname = '${name}'`
      );
    }
  });

  it("remplace ses politiques RLS plutôt que de les créer en double", () => {
    // PostgreSQL n'a pas de CREATE POLICY IF NOT EXISTS : la convention du dépôt
    // (0002, 0003, 0007) est DROP POLICY IF EXISTS avant chaque création.
    const creations = (statements.match(/CREATE POLICY/gi) ?? []).length;
    const drops = (statements.match(/DROP POLICY IF EXISTS/gi) ?? []).length;

    expect(creations).toBeGreaterThan(0);
    expect(drops).toBe(creations);
  });
});

describe("migration 0014 — non destructive", () => {
  it("ne supprime ni table, ni colonne, ni donnée", () => {
    // La migration est rejouée à chaque `pnpm db:migrate`, y compris sur une
    // base qui porte déjà des versions publiées. Une seule de ces instructions
    // détruirait du contenu servi.
    for (const forbidden of [
      /DROP TABLE/i,
      /DROP COLUMN/i,
      /DROP INDEX/i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /ALTER COLUMN[\s\S]*?TYPE/i
    ]) {
      expect(statements, `instruction destructive ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("ne touche à aucune table préexistante", () => {
    const altered = new Set(
      (statements.match(/ALTER TABLE\s+(\w+)/gi) ?? []).map((match) =>
        match.replace(/ALTER TABLE\s+/i, "").toLowerCase()
      )
    );

    for (const table of altered) {
      expect(
        ["published_content_versions", "content_publication_audit", "chapter_activity_events"],
        `0014 modifie ${table}, qui ne lui appartient pas`
      ).toContain(table);
    }
  });

  it("ne prévoit aucune suppression physique d'ancienne version", () => {
    // « Ne pas supprimer physiquement une ancienne version publiée » : le
    // statut `archived` est le seul retrait, et aucune contrainte ON DELETE ne
    // ferait disparaître une version avec autre chose.
    expect(statements).not.toMatch(/published_content_versions[\s\S]*?ON DELETE CASCADE/i);
  });
});

describe("migration 0014 — invariants du modèle", () => {
  it("garantit une seule version active par identité logique", () => {
    // Index unique *partiel* : l'invariant est dans la base, pas dans le code.
    // Une règle appliquée seulement en TypeScript est à une transaction oubliée
    // d'être fausse — et c'est cet index qui fait échouer une publication
    // concurrente au lieu de laisser deux versions actives.
    expect(statements).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS published_content_versions_active_idx[\s\S]*?\(artifact_type, chapter, slug\)[\s\S]*?WHERE status = 'published'/i
    );
  });

  it("interdit un état archivé sans date, et inversement", () => {
    expect(statements).toMatch(/status = 'archived' AND archived_at IS NOT NULL/i);
    expect(statements).toMatch(/status = 'published' AND archived_at IS NULL/i);
  });

  it("n'autorise que les deux statuts de publication", () => {
    expect(statements).toMatch(/CHECK \(status IN \('published', 'archived'\)\)/i);
  });

  it("n'autorise que les six types de contenu de la fabrique", () => {
    for (const type of [
      "smart_revision_sheet",
      "flashcard",
      "calculation_exercise",
      "journal_entry_exercise",
      "error_diagnosis_exercise",
      "progressive_case"
    ]) {
      expect(statements).toContain(`'${type}'`);
    }
  });

  it("n'autorise que les sept types d'activité de la progression", () => {
    for (const kind of [
      "sheet_viewed",
      "active_recall",
      "flashcard_reviewed",
      "calculation_attempt",
      "journal_entry_attempt",
      "diagnosis_attempt",
      "case_step_attempt"
    ]) {
      expect(statements).toContain(`'${kind}'`);
    }
  });

  it("borne la note d'une activité sur l'échelle du produit", () => {
    expect(statements).toMatch(/score IS NULL OR \(score >= 0 AND score <= 20\)/i);
  });

  it("horodate en timestamptz, jamais en timestamp nu", () => {
    const timestamps = statements.match(/\bTIMESTAMP\w*/gi) ?? [];

    expect(timestamps.length).toBeGreaterThan(0);

    for (const column of timestamps) {
      expect(column.toUpperCase()).toBe("TIMESTAMPTZ");
    }
  });

  it("stocke les instantanés en JSONB", () => {
    for (const column of [
      "content_snapshot",
      "source_references_snapshot",
      "generation_metadata_snapshot",
      "validation_metadata_snapshot",
      "review_metadata_snapshot"
    ]) {
      expect(statements).toMatch(new RegExp(`${column} JSONB`, "i"));
    }
  });

  it("ne rattache pas une version publiée au brouillon qui l'a produite", () => {
    // Pas de clé étrangère vers `content_drafts` : supprimer un brouillon ne
    // doit jamais supprimer du cours publié. `source_artifact_id` est de la
    // traçabilité, pas une dépendance.
    expect(statements).not.toMatch(/source_artifact_id[^,]*REFERENCES/i);
  });

  it("conserve la trace d'audit au-delà de la version qu'elle décrit", () => {
    // Contrairement au journal des brouillons, l'audit de publication ne
    // cascade pas : il enregistre qu'un contenu a été rendu public, ce qui reste
    // vrai après la disparition de la ligne de version.
    expect(statements).not.toMatch(/content_publication_audit[\s\S]*?ON DELETE CASCADE/i);
  });

  it("protège l'activité personnelle par une politique par opération", () => {
    for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(statements, `politique ${operation} absente`).toMatch(
        new RegExp(`FOR ${operation}`, "i")
      );
    }

    expect(statements).toMatch(/app_current_user_id\(\)/);
    expect(statements).toMatch(/FORCE ROW LEVEL SECURITY/i);
  });
});
