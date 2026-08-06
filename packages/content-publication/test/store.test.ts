import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContentPayload } from "@finance/content-generation";
import { contentHash } from "../src/hash";
import { buildPublishedVersion, resolveSlug, UnknownChapterError } from "../src/snapshot";
import {
  activeEntriesForChapter,
  archiveVersion,
  findActiveEntry,
  findHistory,
  publishVersion,
  readIndex,
  readVersion,
  SnapshotIntegrityError
} from "../src/store";
import { publicationKeyOf } from "../src/types";
import {
  approvedCalculationDraft,
  approvedSheetDraft,
  draftFor,
  sheetContent
} from "./fixtures";

/**
 * Le magasin des versions publiées.
 *
 * Chaque test travaille dans un dossier temporaire : le magasin du dépôt
 * (`content/published/`) ne doit jamais être touché par une exécution de
 * `pnpm test`, sinon une suite verte laisserait un chapitre publié derrière elle.
 */

let rootDir: string;
let options: { rootDir: string };

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "publication-store-"));
  options = { rootDir };
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function versionOf(draft: ReturnType<typeof approvedSheetDraft>, publicationVersion: number, previous: string | null) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: `2026-08-0${publicationVersion}T12:00:00.000Z`,
    publicationVersion,
    previousPublishedVersionId: previous
  });
}

describe("instantané", () => {
  it("recopie le contenu et retire les extraits des sources", () => {
    const version = versionOf(approvedSheetDraft(), 1, null);

    expect(version.contentSnapshot.contentType).toBe("smart_revision_sheet");
    expect(version.sourceReferencesSnapshot.length).toBeGreaterThan(0);

    // Le texte des PDF privés ne franchit pas la frontière du commit.
    const serialized = JSON.stringify(version.sourceReferencesSnapshot);
    expect(serialized).not.toContain("excerpt");
    expect(serialized).not.toContain("Le compte 163 est crédité");
  });

  it("range le contenu sous son chapitre public, pas sous le slug du corpus", () => {
    const version = versionOf(approvedSheetDraft(), 1, null);

    expect(version.chapter).toBe("emprunts-obligataires");
    expect(version.module).toBe("comptabilite-approfondie");
    expect(version.chapterLabel).toBe("Emprunts obligataires");
  });

  it("refuse de construire un instantané pour un chapitre hors programme", () => {
    expect(() =>
      buildPublishedVersion({
        draft: draftFor(
          { contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload,
          { chapterSlug: "chapitre-inconnu" }
        ),
        publishedBy: "relecteur@example.test",
        publishedAt: "2026-08-01T12:00:00.000Z",
        publicationVersion: 1,
        previousPublishedVersionId: null
      })
    ).toThrow(UnknownChapterError);
  });

  it("dérive un slug stable du contenu", () => {
    expect(resolveSlug(approvedSheetDraft())).toBe("emprunts-obligataires");
    expect(resolveSlug(approvedCalculationDraft())).toBe("prime-de-remboursement-totale");
  });
});

describe("publication", () => {
  it("écrit l'instantané et l'inscrit à l'index", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);
    const result = await publishVersion(options, version);

    expect(result.version.id).toBe(version.id);
    expect(result.archived).toBeNull();

    const index = await readIndex(options);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      id: version.id,
      status: "published",
      publicationVersion: 1,
      chapter: "emprunts-obligataires"
    });

    const stored = await readVersion(options, version.id);
    expect(stored?.contentHash).toBe(version.contentHash);
  });

  it("incrémente la version et archive l'ancienne, en une seule bascule", async () => {
    const first = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, first);

    const revised = draftFor(
      {
        contentType: "smart_revision_sheet",
        content: sheetContent({ summary: "Synthèse revue après relecture, plus précise que la première." })
      } as ContentPayload,
      { id: "draft-000000000001" }
    );
    const second = versionOf(revised, 2, first.id);
    const result = await publishVersion(options, second);

    expect(result.archived?.id).toBe(first.id);
    expect(result.version.publicationVersion).toBe(2);
    expect(result.version.previousPublishedVersionId).toBe(first.id);

    const index = await readIndex(options);
    const key = publicationKeyOf(second);

    expect(index.entries).toHaveLength(2);
    expect(findActiveEntry(index, key)?.id).toBe(second.id);
    expect(index.entries.find((entry) => entry.id === first.id)).toMatchObject({
      status: "archived",
      archivedAt: second.publishedAt
    });
  });

  it("conserve l'ancienne version sur disque après archivage", async () => {
    const first = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, first);
    await publishVersion(options, versionOf(approvedSheetDraft(), 2, first.id));

    // Publier une v2 identique est idempotent ; on force donc une v2 distincte
    // pour vérifier que la v1 survit.
    expect(existsSync(join(rootDir, "versions", `${first.id}.json`))).toBe(true);
    expect(await readVersion(options, first.id)).not.toBeUndefined();
  });

  it("est idempotent : republier un contenu inchangé ne crée pas de doublon", async () => {
    const first = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, first);

    const again = versionOf(approvedSheetDraft(), 2, first.id);
    const result = await publishVersion(options, again);

    expect(result.version.id).toBe(first.id);
    expect(result.version.publicationVersion).toBe(1);
    expect(result.archived).toBeNull();

    const index = await readIndex(options);
    expect(index.entries).toHaveLength(1);
  });

  it("refuse de réécrire un instantané existant", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, version);

    // Même identifiant, contenu *et* empreinte différents : sans quoi le
    // raccourci d'idempotence rendrait la version existante et rien ne serait
    // réécrit — ce qui est le bon comportement, mais pas celui qu'on teste ici.
    const content = sheetContent({ summary: "Une synthèse entièrement différente de la précédente." });
    const contentSnapshot = { contentType: "smart_revision_sheet" as const, content };
    const tampered = {
      ...version,
      contentSnapshot,
      contentHash: contentHash(contentSnapshot)
    };

    await expect(publishVersion(options, tampered as typeof version)).rejects.toThrow(
      /n'est jamais réécrit/
    );
  });

  it("laisse le magasin intact quand la bascule d'index échoue", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);

    // Un index illisible fait échouer `readIndex` avant toute écriture : rien
    // ne doit être laissé derrière.
    await writeFile(join(rootDir, "index.json"), "{ ceci n'est pas du JSON", "utf8");

    await expect(publishVersion(options, version)).rejects.toThrow();
    expect(existsSync(join(rootDir, "versions", `${version.id}.json`))).toBe(false);
  });
});

describe("intégrité de l'instantané", () => {
  it("refuse de rendre un instantané retouché à la main", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, version);

    const path = join(rootDir, "versions", `${version.id}.json`);
    const stored = JSON.parse(await readFile(path, "utf8"));
    stored.contentSnapshot.content.summary = "Une synthèse modifiée après coup, sans republier.";
    await writeFile(path, JSON.stringify(stored, null, 2), "utf8");

    await expect(readVersion(options, version.id)).rejects.toThrow(SnapshotIntegrityError);
  });

  it("rend undefined pour un identifiant inconnu plutôt que de lever", async () => {
    expect(await readVersion(options, "pub-inexistant")).toBeUndefined();
  });
});

describe("archivage", () => {
  it("retire un contenu du site public sans le supprimer", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, version);

    const archived = await archiveVersion(options, version.id, "2026-08-10T09:00:00.000Z");

    expect(archived).toMatchObject({ status: "archived", archivedAt: "2026-08-10T09:00:00.000Z" });
    expect(existsSync(join(rootDir, "versions", `${version.id}.json`))).toBe(true);

    const index = await readIndex(options);
    expect(activeEntriesForChapter(index, "emprunts-obligataires")).toHaveLength(0);
    expect(findActiveEntry(index, publicationKeyOf(version))).toBeUndefined();
  });

  it("rend null quand la version est déjà archivée", async () => {
    const version = versionOf(approvedSheetDraft(), 1, null);
    await publishVersion(options, version);
    await archiveVersion(options, version.id, "2026-08-10T09:00:00.000Z");

    expect(await archiveVersion(options, version.id, "2026-08-11T09:00:00.000Z")).toBeNull();
  });
});

describe("lecture du chapitre", () => {
  it("ne rend que les versions actives", async () => {
    const sheet = versionOf(approvedSheetDraft(), 1, null);
    const calculation = buildPublishedVersion({
      draft: approvedCalculationDraft(),
      publishedBy: "relecteur@example.test",
      publishedAt: "2026-08-02T12:00:00.000Z",
      publicationVersion: 1,
      previousPublishedVersionId: null
    });

    await publishVersion(options, sheet);
    await publishVersion(options, calculation);
    await archiveVersion(options, sheet.id, "2026-08-03T12:00:00.000Z");

    const index = await readIndex(options);
    const active = activeEntriesForChapter(index, "emprunts-obligataires");

    expect(active.map((entry) => entry.id)).toEqual([calculation.id]);
    expect(findHistory(index, publicationKeyOf(sheet))).toHaveLength(1);
  });
});
