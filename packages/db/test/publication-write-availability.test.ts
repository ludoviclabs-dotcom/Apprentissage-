import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « La base n'a pas répondu » et « la base a refusé » sont deux faits distincts.
 *
 * POURQUOI CETTE DISTINCTION EXISTE. Une écriture de publication qui échouait
 * remontait telle quelle jusqu'à la route, qui n'en reconnaissait que la
 * violation d'unicité et rendait « Action impossible », 500, pour tout le reste.
 * Un relecteur voyait donc la même erreur opaque qu'une base injoignable, qu'une
 * migration non appliquée ou qu'un identifiant déjà pris — trois situations dont
 * une seule appelle un nouvel essai, et aucune n'est un défaut du contenu.
 *
 * CE QUE LA CLASSIFICATION NE DOIT PAS AVALER. `23505` — une autre version vient
 * d'être publiée — reste une exception, parce que la route en fait un 409 qui
 * invite à recharger. La confondre avec une indisponibilité transformerait une
 * course gagnée par quelqu'un d'autre en « rien n'a été enregistré ».
 *
 * La base est simulée : l'installation qui exécute ces tests n'a pas de
 * PostgreSQL, et une panne de connexion réelle rendrait le test vert sur une
 * machine et absent sur la suivante. Ce qui est exercé ici est le code de
 * `runPublicationWrite`, pas le pilote.
 */

const state = vi.hoisted(() => ({ failure: new Error("non configuré") as unknown }));

vi.mock("../src/client", () => ({
  canUseDatabase: () => true,
  createDb: () => ({
    transaction: async () => {
      throw state.failure;
    }
  })
}));

const { publicationWriteUnavailabilityReason, recordArchivedVersion, recordPublishedVersion } =
  await import("../src/publication-repository");

const VERSION = {
  id: "pub-flashcard-fixture-technique-v1",
  sourceArtifactId: "fixture-technique",
  artifactType: "flashcard",
  title: "Fixture technique",
  slug: "fixture-technique",
  domain: "comptabilite",
  module: "comptabilite-approfondie",
  chapter: "les-emprunts-obligataires",
  chapterLabel: "Les emprunts obligataires",
  contentSnapshot: {},
  sourceReferencesSnapshot: [],
  publicationVersion: 1,
  publishedAt: "2026-08-08T12:00:00.000Z",
  publishedBy: "test",
  generationMetadataSnapshot: { mode: "manual-assisted" },
  validationMetadataSnapshot: {},
  reviewMetadataSnapshot: {},
  contentHash: "a".repeat(64),
  previousPublishedVersionId: null,
  normativeContextSnapshot: null,
  normativeProfile: null,
  scoringPolicy: null
};

const AUDIT = {
  action: "publish" as const,
  versionId: VERSION.id,
  previousVersionId: null,
  artifactType: VERSION.artifactType,
  chapter: VERSION.chapter,
  slug: VERSION.slug,
  publicationVersion: 1,
  actor: "test",
  contentHash: VERSION.contentHash
};

beforeEach(() => {
  state.failure = new Error("non configuré");
});

describe("classification des échecs d'écriture", () => {
  it("reconnaît une base injoignable", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "CONNECT_TIMEOUT"]) {
      expect(publicationWriteUnavailabilityReason({ code }), code).toContain(code);
    }
  });

  it("reconnaît une migration non appliquée", () => {
    expect(publicationWriteUnavailabilityReason({ code: "42P01" })).toContain("0014");
    expect(publicationWriteUnavailabilityReason({ code: "42703" })).toContain("0015");
  });

  it("laisse remonter une violation d'unicité", () => {
    // C'est le refus qui produit un 409 « publication concurrente ». Le classer
    // comme indisponibilité le ferait disparaître.
    expect(publicationWriteUnavailabilityReason({ code: "23505" })).toBeNull();
  });

  it("laisse remonter toute autre erreur, y compris sans code", () => {
    for (const error of [new Error("boum"), { code: "23514" }, { code: "22P02" }, null, undefined, "chaîne"]) {
      expect(publicationWriteUnavailabilityReason(error)).toBeNull();
    }
  });

  it("ne rapporte jamais le message d'origine, qui porte hôte et port", () => {
    const reason = publicationWriteUnavailabilityReason({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED 127.0.0.1:5432"
    });

    expect(reason).not.toContain("127.0.0.1");
    expect(reason).not.toContain("5432");
  });
});

describe("écriture d'une publication sur une base injoignable", () => {
  it("rapporte une indisponibilité au lieu de lever", async () => {
    state.failure = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED"
    });

    const result = await recordPublishedVersion(VERSION, AUDIT);

    expect(result.status).toBe("unavailable");
    expect(result.status === "unavailable" && result.reason).toContain("ECONNREFUSED");
  });

  it("rapporte une indisponibilité quand les tables n'existent pas", async () => {
    state.failure = Object.assign(new Error('relation "published_content_versions" does not exist'), {
      code: "42P01"
    });

    const result = await recordPublishedVersion(VERSION, AUDIT);

    expect(result.status).toBe("unavailable");
    expect(result.status === "unavailable" && result.reason).toContain("0014");
  });

  it("laisse la publication concurrente remonter jusqu'à la route", async () => {
    state.failure = Object.assign(new Error("duplicate key"), { code: "23505" });

    await expect(recordPublishedVersion(VERSION, AUDIT)).rejects.toMatchObject({ code: "23505" });
  });

  it("applique la même règle à l'archivage", async () => {
    state.failure = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

    const result = await recordArchivedVersion(VERSION.id, "2026-08-08T13:00:00.000Z", {
      ...AUDIT,
      action: "archive"
    });

    expect(result.status).toBe("unavailable");
  });
});
