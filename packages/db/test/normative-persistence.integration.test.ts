import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationFiles } from "../src/schema";

/**
 * Le contexte normatif contre un vrai PostgreSQL.
 *
 * L'audit structurel de `migration-0015.test.ts` prouve ce que le texte de la
 * migration doit porter ; l'aller-retour de
 * `apps/web/test/publication-normative-persistence.test.ts` prouve la
 * correspondance ligne ↔ version. Ni l'un ni l'autre ne prouve que PostgreSQL
 * accepte la migration, ni que les contraintes refusent ce qu'elles doivent
 * refuser. C'est ce que fait ce fichier, et il ne peut le faire qu'avec un
 * moteur.
 *
 * Il se saute bruyamment sans base, et la CI échoue sur l'avertissement : une
 * persistance non vérifiée ne doit jamais se lire comme une persistance
 * vérifiée.
 */

const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL ?? process.env.DATABASE_ADMIN_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = ADMIN_DATABASE_URL ? describe : describe.skip;

if (!ADMIN_DATABASE_URL) {
  console.warn(
    "[normative-persistence.integration] RLS_TEST_ADMIN_DATABASE_URL (ou DATABASE_ADMIN_URL) est requis — la persistance du contexte normatif n'est PAS vérifiée dans cette exécution."
  );
}

/** Une version minimale mais complète, telle que la table l'attend. */
function versionRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    source_artifact_id: `draft-${id}`,
    artifact_type: "flashcard",
    title: `Carte ${id}`,
    slug: `carte-${id}`,
    domain: "comptabilite",
    module: "comptabilite-approfondie",
    chapter: "les-emprunts-obligataires",
    chapter_label: "Les emprunts obligataires",
    content_snapshot: { contentType: "flashcard", content: {} },
    source_references_snapshot: [],
    publication_version: 1,
    published_by: "relecteur@example.test",
    generation_metadata_snapshot: {},
    validation_metadata_snapshot: {},
    review_metadata_snapshot: {},
    content_hash: "a".repeat(64),
    status: "published",
    previous_published_version_id: null,
    archived_at: null,
    ...overrides
  };
}

const LEGACY_CONTEXT = {
  profile: "course-original",
  status: "legacy",
  scoringPolicy: "comparison-only",
  sourceVersionIds: ["reference-core-anc-2026-002bbc6a5eca"],
  supersededByProfile: "anc-2026-current",
  customAccountDisclosures: [
    { accountNumber: "4816", parentAccount: "481", source: "course", label: "Frais d'émission" }
  ],
  versionConflictNotes: [
    { code: "compte-remplace", severity: "warning", message: "Remplacé au 1er janvier 2026.", sourceIds: [] }
  ]
};

describeWithDb("persistance du contexte normatif — PostgreSQL réel", () => {
  let sql: Sql;
  const written: string[] = [];

  beforeAll(async () => {
    sql = postgres(ADMIN_DATABASE_URL as string, { max: 1 });

    // TOUTES LES MIGRATIONS, DEPUIS ZÉRO, DEUX FOIS. La seconde passe prouve
    // l'idempotence sur le moteur plutôt que sur le texte : c'est ce que fait
    // `pnpm db:migrate` à chaque déploiement.
    for (const pass of [1, 2]) {
      for (const file of migrationFiles) {
        const statements = await readFile(resolve(packageRoot, file), "utf8");
        await sql.unsafe(statements);
      }

      expect(pass).toBeLessThanOrEqual(2);
    }
  }, 120_000);

  afterAll(async () => {
    if (!sql) return;

    // Les données techniques créées ici sont retirées : ce fichier ne laisse pas
    // de contenu derrière lui.
    if (written.length > 0) {
      await sql`DELETE FROM content_publication_audit WHERE version_id = ANY(${written})`;
      await sql`DELETE FROM published_content_versions WHERE id = ANY(${written})`;
    }

    await sql.end();
  });

  it("applique la migration 0015 et crée les trois colonnes", async () => {
    const columns = await sql<{ column_name: string; is_nullable: string; data_type: string }[]>`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'published_content_versions'
        AND column_name IN ('normative_context_snapshot', 'normative_profile', 'scoring_policy')
    `;

    expect(columns).toHaveLength(3);
    // Nullables : une ligne antérieure n'a jamais porté de référentiel.
    expect(columns.every((column) => column.is_nullable === "YES")).toBe(true);
    expect(columns.find((column) => column.column_name === "normative_context_snapshot")?.data_type).toBe(
      "jsonb"
    );
  });

  it("rend le contexte normatif intact après écriture puis lecture", async () => {
    const id = "pub-test-normative-roundtrip";
    written.push(id);

    await sql`
      INSERT INTO published_content_versions ${sql(
        versionRow(id, {
          normative_context_snapshot: LEGACY_CONTEXT,
          normative_profile: "course-original",
          scoring_policy: "comparison-only"
        })
      )}
    `;

    const [row] = await sql<
      { normative_context_snapshot: typeof LEGACY_CONTEXT; normative_profile: string; scoring_policy: string }[]
    >`
      SELECT normative_context_snapshot, normative_profile, scoring_policy
      FROM published_content_versions WHERE id = ${id}
    `;

    expect(row.normative_context_snapshot).toEqual(LEGACY_CONTEXT);
    expect(row.normative_profile).toBe("course-original");
    expect(row.scoring_policy).toBe("comparison-only");
  });

  it("accepte une ligne sans contexte, comme avant la migration", async () => {
    const id = "pub-test-normative-legacy-row";
    written.push(id);

    await sql`INSERT INTO published_content_versions ${sql(versionRow(id))}`;

    const [row] = await sql<{ normative_profile: string | null }[]>`
      SELECT normative_profile FROM published_content_versions WHERE id = ${id}
    `;

    expect(row.normative_profile).toBeNull();
  });

  it("refuse un profil inconnu", async () => {
    await expect(
      sql`
        INSERT INTO published_content_versions ${sql(
          versionRow("pub-test-normative-bad-profile", {
            normative_context_snapshot: LEGACY_CONTEXT,
            normative_profile: "anc-2019",
            scoring_policy: "comparison-only"
          })
        )}
      `
    ).rejects.toThrow();
  });

  it("refuse une politique de notation inconnue", async () => {
    await expect(
      sql`
        INSERT INTO published_content_versions ${sql(
          versionRow("pub-test-normative-bad-policy", {
            normative_context_snapshot: LEGACY_CONTEXT,
            normative_profile: "course-original",
            scoring_policy: "scored"
          })
        )}
      `
    ).rejects.toThrow();
  });

  it("refuse un profil sans instantané, et l'inverse", async () => {
    await expect(
      sql`
        INSERT INTO published_content_versions ${sql(
          versionRow("pub-test-normative-half-a", { normative_profile: "course-original" })
        )}
      `
    ).rejects.toThrow();

    await expect(
      sql`
        INSERT INTO published_content_versions ${sql(
          versionRow("pub-test-normative-half-b", { normative_context_snapshot: LEGACY_CONTEXT })
        )}
      `
    ).rejects.toThrow();
  });

  it("annule tout quand la transaction échoue", async () => {
    const id = "pub-test-normative-rollback";

    await expect(
      sql.begin(async (tx) => {
        await tx`INSERT INTO published_content_versions ${tx(
          versionRow(id, {
            normative_context_snapshot: LEGACY_CONTEXT,
            normative_profile: "course-original",
            scoring_policy: "comparison-only"
          })
        )}`;

        // Le second ordre viole la contrainte de profil : la publication entière
        // doit disparaître, sans quoi une version resterait active sans son acte
        // d'audit.
        await tx`INSERT INTO published_content_versions ${tx(
          versionRow(`${id}-bis`, {
            normative_context_snapshot: LEGACY_CONTEXT,
            normative_profile: "profil-inexistant",
            scoring_policy: "comparison-only"
          })
        )}`;
      })
    ).rejects.toThrow();

    const rows = await sql`SELECT id FROM published_content_versions WHERE id = ${id}`;

    expect(rows).toHaveLength(0);
  });

  it("conserve le contexte après archivage", async () => {
    const id = "pub-test-normative-archived";
    written.push(id);

    await sql`
      INSERT INTO published_content_versions ${sql(
        versionRow(id, {
          normative_context_snapshot: LEGACY_CONTEXT,
          normative_profile: "course-original",
          scoring_policy: "comparison-only"
        })
      )}
    `;

    await sql`
      UPDATE published_content_versions
      SET status = 'archived', archived_at = now()
      WHERE id = ${id}
    `;

    const [row] = await sql<{ normative_profile: string }[]>`
      SELECT normative_profile FROM published_content_versions WHERE id = ${id}
    `;

    expect(row.normative_profile).toBe("course-original");
  });
});
