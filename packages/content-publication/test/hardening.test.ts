import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContentPayload } from "@finance/content-generation";
import {
  assertSnapshotPublishable,
  inspectSnapshot,
  scanForForbiddenStrings,
  SnapshotRefusedError
} from "../src/guard";
import { contentHash } from "../src/hash";
import { findRemainingExcerptPaths, stripSourceExcerpts } from "../src/sanitize";
import { buildPublishedVersion } from "../src/snapshot";
import { publishVersion, UnpublishableSnapshotError } from "../src/store";
import { approvedSheetDraft, draftFor, sheetContent } from "./fixtures";

/**
 * Durcissement d'avant-fusion.
 *
 * Ces tests ne couvrent pas de nouvelles fonctionnalités : ils couvrent les
 * chemins par lesquels une règle déjà écrite pourrait être contournée. C'est
 * délibérément redondant avec `guard.test.ts` et `store.test.ts` — une règle
 * dont la violation est inacceptable mérite plus d'une barrière, et chaque
 * barrière mérite son test.
 */

let rootDir: string;
let options: { rootDir: string };

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "publication-hardening-"));
  options = { rootDir };
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function version(draft = approvedSheetDraft()) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-01T12:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

describe("balayage récursif des chaînes interdites", () => {
  it("trouve un chemin enfoui à n'importe quelle profondeur", () => {
    const problems = scanForForbiddenStrings({
      a: { b: [{ c: { d: "voir C:\\Users\\ludo\\cours" } }] }
    });

    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe("chemin-prive");
    // Le chemin d'accès exact, pas seulement « quelque part » : c'est ce qui
    // rend le refus corrigeable.
    expect(problems[0].path).toBe("a.b[0].c.d");
  });

  it("inspecte aussi les clés, pas seulement les valeurs", () => {
    const problems = scanForForbiddenStrings({ "/Users/ludo/note": "anodin" });

    expect(problems.map((problem) => problem.code)).toContain("chemin-prive");
  });

  it("détecte un secret, un jeton et un mot de passe", () => {
    for (const value of [
      "api_key=sk-abcdefghijklmnopqrstuvwxyz",
      "Bearer abcdefghijklmnopqrstuvwxyz012345",
      "password: hunter2000secret"
    ]) {
      expect(scanForForbiddenStrings({ value }).map((problem) => problem.code)).toContain(
        "secret-detecte"
      );
    }
  });

  it("détecte un renvoi vers les répertoires privés du pipeline", () => {
    for (const value of ["data/extracted/pack/pages", "data/generated/drafts", "content-private/x"]) {
      expect(scanForForbiddenStrings({ value }).map((problem) => problem.code)).toContain(
        "url-fichier-prive"
      );
    }
  });

  it("laisse passer un contenu pédagogique ordinaire", () => {
    expect(
      scanForForbiddenStrings({
        statement: "Le compte 163 est crédité du prix de remboursement (PCG, art. 941-16).",
        expression: "(prix de remboursement - prix d'émission) x nombre d'obligations"
      })
    ).toEqual([]);
  });
});

describe("inspection de l'instantané complet", () => {
  it("accepte un instantané légitime", () => {
    expect(inspectSnapshot(version() as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("refuse un chemin caché dans le titre d'un document source", () => {
    // C'est le champ qu'on n'inspecterait pas spontanément : il n'est pas rédigé
    // par un auteur, il vient du nom du fichier d'origine.
    const tampered = {
      ...version(),
      sourceReferencesSnapshot: [
        {
          pack: "e2e-pack",
          documentId: "e2e-pack-course",
          documentTitle: "C:\\Users\\ludo\\cours\\obligations",
          sourceType: "course" as const,
          pageStart: 1,
          pageEnd: 1,
          chunkIds: ["e2e-chunk-rules"]
        }
      ]
    };

    const problems = inspectSnapshot(tampered as unknown as Record<string, unknown>);

    expect(problems.map((problem) => problem.code)).toContain("chemin-prive");
    expect(() => assertSnapshotPublishable(tampered as unknown as Record<string, unknown>)).toThrow(
      SnapshotRefusedError
    );
  });

  it("tolère une adresse de relecteur, qui est de la traçabilité", () => {
    // `publishedBy` et les métadonnées de revue sont exclus du balayage : un
    // registre dont l'objet est de dire qui a publié quoi doit pouvoir porter un
    // compte. Ils ne sont jamais projetés vers le public.
    expect(
      inspectSnapshot({
        publishedBy: "relecteur@example.test",
        reviewMetadataSnapshot: { reviewedBy: "relecteur@example.test", revision: 1 }
      })
    ).toEqual([]);
  });
});

describe("le magasin refuse ce qui ne doit jamais y entrer", () => {
  it("refuse un instantané en mode mock", async () => {
    const mocked = version(
      draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
        mode: "mock"
      })
    );

    await expect(publishVersion(options, mocked)).rejects.toThrow(UnpublishableSnapshotError);
    await expect(publishVersion(options, mocked)).rejects.toThrow(/fixture/i);
  });

  it("refuse un instantané déjà archivé", async () => {
    const archived = { ...version(), status: "archived" as const, archivedAt: "2026-08-02T00:00:00.000Z" };

    await expect(publishVersion(options, archived)).rejects.toThrow(UnpublishableSnapshotError);
  });

  it("refuse un instantané dont l'empreinte ne correspond plus au contenu", async () => {
    const tampered = { ...version(), contentHash: "f".repeat(64) };

    await expect(publishVersion(options, tampered)).rejects.toThrow(/empreinte/i);
  });

  it("refuse un instantané porteur d'un chemin privé", async () => {
    const built = version();
    const tampered = {
      ...built,
      sourceReferencesSnapshot: built.sourceReferencesSnapshot.map((reference) => ({
        ...reference,
        sectionTitle: "/home/ludo/cours"
      }))
    };

    await expect(publishVersion(options, tampered)).rejects.toThrow(SnapshotRefusedError);
  });

  it("accepte un instantané conforme", async () => {
    const result = await publishVersion(options, version());

    expect(result.version.id).toBe(version().id);
  });
});

describe("le texte des sources ne franchit pas la frontière", () => {
  it("le contenu publié ne porte plus les extraits de ses références imbriquées", () => {
    // LE PIÈGE ÉTAIT LÀ. `collectPublishedReferences` nettoyait la liste
    // agrégée, mais chaque règle, formule et étape porte ses *propres*
    // `sourceReferences` — et celles-là partaient avec leur `excerpt` dans le
    // fichier commité, dans la base, et dans la charge utile RSC de la fiche.
    const built = version();
    const serialized = JSON.stringify(built.contentSnapshot);

    expect(serialized).not.toContain("excerpt");
    expect(serialized).not.toContain("Le compte 163 est crédité du prix de remboursement.");
    expect(findRemainingExcerptPaths(built.contentSnapshot)).toEqual([]);
  });

  it("nettoie à n'importe quelle profondeur", () => {
    const cleaned = stripSourceExcerpts({
      steps: [{ sourceReferences: [{ documentId: "d", excerpt: "texte privé", excerptHash: "a" }] }]
    });

    expect(findRemainingExcerptPaths(cleaned)).toEqual([]);
    expect(JSON.stringify(cleaned)).not.toContain("texte privé");
  });

  it("laisse intact tout ce qui n'est pas un extrait", () => {
    const cleaned = stripSourceExcerpts({
      statement: "Le compte 163 est crédité.",
      sourceReferences: [{ documentId: "d", pack: "p", pageStart: 2, excerpt: "x" }]
    });

    expect(cleaned).toEqual({
      statement: "Le compte 163 est crédité.",
      sourceReferences: [{ documentId: "d", pack: "p", pageStart: 2 }]
    });
  });

  it("l'empreinte porte sur le contenu nettoyé, donc reste vérifiable", async () => {
    // Si le garde hachait la charge brute et l'instantané la charge nettoyée,
    // `publishDraft` refuserait toute publication sur une incohérence interne.
    const built = version();

    expect(contentHash(built.contentSnapshot)).toBe(built.contentHash);
    await expect(publishVersion(options, built)).resolves.toMatchObject({ version: { id: built.id } });
  });
});
