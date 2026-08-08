import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertTransition,
  generationModes,
  isPublishableGenerationMode,
  type ContentDraft,
  type ContentPayload,
  type NormativeContext
} from "@finance/content-generation";
import { inspectForPublication } from "../src/guard";
import { buildPublishedVersion } from "../src/snapshot";
import {
  publishVersion,
  readIndex,
  readVersion,
  UnpublishableSnapshotError
} from "../src/store";
import { publishedContentVersionSchema, publishedGenerationMetadataSchema } from "../src/types";
import { draftFor, flashcardContent, sheetContent, testCorpus } from "./fixtures";

/**
 * Le contrat des modes publiables, de bout en bout.
 *
 * CE QUI ÉTAIT CASSÉ. `publishedGenerationMetadataSchema` énumérait
 * `["mock", "live"]` de son côté, alors que le garde, le magasin et la lecture
 * publique interrogeaient tous `isPublishableGenerationMode`, qui admet
 * `manual-assisted`. Un contenu assisté approuvé franchissait donc le garde, se
 * laissait construire en instantané, puis échouait à la relecture Zod de ce même
 * instantané : une exception là où il n'y avait aucune règle à faire respecter.
 * Le pilote « Emprunts obligataires » est entièrement en `manual-assisted` — la
 * divergence rendait la publication du chapitre impossible.
 *
 * CE QUE CES TESTS FIXENT. Que les trois modes connus se désérialisent, que
 * seuls `live` et `manual-assisted` se publient, et que le mode traverse la
 * chaîne sans être remplacé, converti ni perdu. Toutes les fixtures sont
 * jetables : aucun des contenus réels du pilote n'est lu, et le magasin du dépôt
 * (`content/published/`) n'est jamais la cible d'une écriture.
 */

let rootDir: string;
let options: { rootDir: string };

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "publishable-modes-"));
  options = { rootDir };
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function snapshotOf(draft: ContentDraft, publicationVersion = 1) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-08T12:00:00.000Z",
    publicationVersion,
    previousPublishedVersionId: null
  });
}

function assistedSheetDraft(overrides: Parameters<typeof draftFor>[1] = {}): ContentDraft {
  return draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
    status: "approved",
    mode: "manual-assisted",
    ...overrides
  });
}

// --- 1. Le schéma de sérialisation ------------------------------------------

describe("schéma d'un instantané publié", () => {
  it("désérialise les trois modes connus", () => {
    // Le schéma décrit ce qui est structurellement valide. `mock` en fait partie
    // — c'est ce qui permet à un audit de relire une version et de constater
    // d'où elle vient ; ce qu'il ne franchit pas est la liste blanche, pas Zod.
    for (const mode of generationModes) {
      expect(
        publishedGenerationMetadataSchema.safeParse({
          provider: "manuel",
          model: "manual-assisted:auteur:0123456789ab",
          promptId: "revision-sheet",
          promptVersion: "v1",
          generatedAt: "2026-08-08T12:00:00.000Z",
          inputHash: "b".repeat(64),
          sourcePackId: "pack-test",
          documentIds: ["doc-1"],
          mode
        }).success
      ).toBe(true);
    }
  });

  it("refuse un mode inconnu", () => {
    expect(
      publishedGenerationMetadataSchema.safeParse({
        provider: "manuel",
        model: "m",
        promptId: "p",
        promptVersion: "v1",
        generatedAt: "2026-08-08T12:00:00.000Z",
        inputHash: "b".repeat(64),
        sourcePackId: "pack-test",
        documentIds: ["doc-1"],
        mode: "mode-futur"
      }).success
    ).toBe(false);
  });
});

// --- 2. Le garde -------------------------------------------------------------

describe("garde de publication", () => {
  function inspect(draft: ContentDraft) {
    return inspectForPublication({ draft, corpus: testCorpus, currentVersion: 0 });
  }

  it("accepte un contenu manual-assisted approuvé", () => {
    const report = inspect(assistedSheetDraft());

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("accepte un contenu live approuvé", () => {
    expect(inspect(assistedSheetDraft({ mode: "live" })).passed).toBe(true);
  });

  it("refuse un contenu mock, même approuvé", () => {
    const report = inspect(assistedSheetDraft({ mode: "mock" }));

    expect(report.passed).toBe(false);
    expect(report.errors.map((problem) => problem.code)).toContain("mode-non-publiable");
  });
});

// --- 3. Le constructeur d'instantané ----------------------------------------

describe("constructeur d'instantané", () => {
  it("conserve manual-assisted sans le remplacer par live", () => {
    const version = snapshotOf(assistedSheetDraft());

    expect(version.generationMetadataSnapshot.mode).toBe("manual-assisted");
  });

  it("ne perd ni ne remplace le mode d'aucun contenu publiable", () => {
    for (const mode of ["live", "manual-assisted"] as const) {
      expect(snapshotOf(assistedSheetDraft({ mode })).generationMetadataSnapshot.mode).toBe(mode);
    }
  });

  it("produit un instantané que PublishedContentVersion relit sans erreur", () => {
    // C'est l'assertion qui aurait échoué avant le correctif : le constructeur
    // reparse son propre résultat, et c'est là que l'exception naissait.
    const version = snapshotOf(assistedSheetDraft());
    const reparsed = publishedContentVersionSchema.parse(JSON.parse(JSON.stringify(version)));

    expect(reparsed.generationMetadataSnapshot.mode).toBe("manual-assisted");
  });

  it("conserve le référentiel du brouillon, champ par champ", () => {
    const draft = assistedSheetDraft();
    const version = snapshotOf(draft);

    expect(version.normativeContextSnapshot).toEqual(draft.normativeContext);
  });
});

// --- 4. Le magasin de fichiers ----------------------------------------------

describe("magasin de fichiers", () => {
  it("écrit, relit et rend un manual-assisted inchangé", async () => {
    const version = snapshotOf(assistedSheetDraft());
    const result = await publishVersion(options, version);

    expect(result.version.id).toBe(version.id);

    const reloaded = await readVersion(options, version.id);

    expect(reloaded?.generationMetadataSnapshot.mode).toBe("manual-assisted");
    expect(reloaded?.contentHash).toBe(version.contentHash);
    expect(reloaded?.normativeContextSnapshot).toEqual(version.normativeContextSnapshot);
  });

  it("refuse d'écrire un mock et ne laisse aucun fichier derrière lui", async () => {
    // L'instantané est construit en contournant le garde : c'est précisément le
    // chemin que cette barrière-ci couvre, et le seul moyen de l'exercer.
    const version = snapshotOf(assistedSheetDraft({ mode: "mock" }));

    await expect(publishVersion(options, version)).rejects.toBeInstanceOf(UnpublishableSnapshotError);

    expect(existsSync(join(rootDir, "versions"))).toBe(false);
    expect((await readIndex(options)).entries).toEqual([]);
  });

  it("refuse d'écrire un mode inconnu", async () => {
    const version = snapshotOf(assistedSheetDraft());
    const forged = {
      ...version,
      generationMetadataSnapshot: { ...version.generationMetadataSnapshot, mode: "mode-futur" }
    } as unknown as typeof version;

    await expect(publishVersion(options, forged)).rejects.toBeInstanceOf(UnpublishableSnapshotError);
  });

  it("porte la politique de notation d'un comparaison-seule dans l'index", async () => {
    const comparisonContext: NormativeContext = {
      profile: "course-original",
      status: "legacy",
      effectiveTo: "2025-12-31",
      scoringPolicy: "comparison-only",
      sourceVersionIds: ["e2e-pack-reference"],
      supersededByProfile: "anc-2026-current",
      customAccountDisclosures: [],
      versionConflictNotes: []
    };
    const version = snapshotOf(
      draftFor({ contentType: "flashcard", content: flashcardContent() } as ContentPayload, {
        id: "fixture-comparaison",
        status: "approved",
        mode: "manual-assisted",
        normativeContext: comparisonContext
      })
    );

    await publishVersion(options, version);

    const entry = (await readIndex(options)).entries[0];

    // Un contenu assisté « comparaison seule » reste comparaison seule : le mode
    // de génération ne décide de rien en matière de notation.
    expect(entry.scoringPolicy).toBe("comparison-only");
    expect(entry.normativeProfile).toBe("course-original");
    expect((await readVersion(options, version.id))?.normativeContextSnapshot).toEqual(comparisonContext);
  });
});

// --- 5. Le parcours technique complet (§11) ---------------------------------

describe("parcours technique de publication", () => {
  /**
   * De `needs_review` à une version relue depuis le magasin, sur une fixture
   * jetable.
   *
   * AUCUN DES CONTENUS RÉELS N'EST TOUCHÉ. Le brouillon est fabriqué ici, la
   * cible est un dossier temporaire supprimé par `afterEach`, et l'approbation
   * est une transition en mémoire — rien n'est écrit dans `data/generated/` ni
   * dans `content/published/`.
   */
  it("mène un manual-assisted de needs_review à une version relue", async () => {
    const pending = assistedSheetDraft({ id: "fixture-technique-assistee", status: "needs_review" });

    expect(pending.status).toBe("needs_review");
    // L'approbation passe par la machine à états, pas par une affectation : un
    // test qui écrirait « approved » à la main prouverait un chemin que le
    // produit n'emprunte pas.
    assertTransition(pending.status, "approved");

    const approved = { ...pending, status: "approved" } as ContentDraft;
    const report = inspectForPublication({ draft: approved, corpus: testCorpus, currentVersion: 0 });

    expect(report.passed).toBe(true);

    const version = snapshotOf(approved, report.publicationVersion);

    expect(version.contentHash).toBe(report.contentHash);

    await publishVersion(options, version);

    const reloaded = await readVersion(options, version.id);

    expect(reloaded).toBeDefined();
    expect(reloaded?.generationMetadataSnapshot.mode).toBe("manual-assisted");
    expect(reloaded?.normativeContextSnapshot).toEqual(approved.normativeContext);
    expect(reloaded?.normativeContextSnapshot?.scoringPolicy).toBe("graded");
    expect(reloaded?.reviewMetadataSnapshot.reviewedBy).toBe("relecteur@example.test");

    // La trace : l'index nomme la version active, son auteur de publication et
    // son empreinte. C'est ce que le magasin de fichiers enregistre d'un acte de
    // publication ; le journal nominatif, lui, vit en base.
    const entries = (await readIndex(options)).entries;

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: version.id,
      status: "published",
      publishedBy: "relecteur@example.test",
      contentHash: version.contentHash
    });
  });

  it("refuse le même parcours en mode mock, sans rien écrire", async () => {
    const pending = assistedSheetDraft({
      id: "fixture-technique-mock",
      status: "needs_review",
      mode: "mock"
    });

    assertTransition(pending.status, "approved");

    const approved = { ...pending, status: "approved" } as ContentDraft;
    const report = inspectForPublication({ draft: approved, corpus: testCorpus, currentVersion: 0 });

    expect(report.passed).toBe(false);
    expect(report.errors.map((problem) => problem.code)).toContain("mode-non-publiable");
    expect(isPublishableGenerationMode(approved.generationMetadata.mode)).toBe(false);

    // Rien n'a été écrit : ni instantané, ni index.
    expect(await readdir(rootDir)).toEqual([]);
  });
});
