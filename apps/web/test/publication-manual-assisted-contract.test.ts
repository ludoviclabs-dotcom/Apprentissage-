import { describe, expect, it } from "vitest";
import {
  buildPublishedVersion,
  isGradedVersion,
  normativeContextOf,
  revealFlashcard,
  storedNormativeFields,
  toPublicFlashcardFront,
  toPublicSourceReferences,
  type PublishedContentVersion
} from "@finance/content-publication";
import { isPublishableGenerationMode, type ContentDraft } from "@finance/content-generation";
import type { PublishedVersionRow } from "@finance/db";
import { versionFromRow } from "@/lib/publication/store";
import {
  draftFor,
  flashcardContent,
  sheetContent
} from "../../../packages/content-publication/test/fixtures";
import type { ContentPayload, NormativeContext } from "@finance/content-generation";

/**
 * Le mode assisté survit-il à un aller-retour par PostgreSQL ?
 *
 * CE FICHIER EXERCE LA CORRESPONDANCE, PAS LE MOTEUR. La ligne est construite
 * exactement comme `recordPublishedVersion` la reçoit, puis relue par
 * `versionFromRow`, qui est la fonction que la production emploie. C'est là qu'un
 * champ se perd en silence — un test qui bâtirait sa propre correspondance ne
 * prouverait rien de celle-ci. Que PostgreSQL accepte les colonnes est une autre
 * question, et c'est le rôle des tests d'intégration de `packages/db`.
 *
 * LE MODE N'EST PAS STOCKÉ DANS UNE COLONNE. Il voyage dans le JSONB
 * `generation_metadata_snapshot`, qu'aucune contrainte SQL ne restreint : le
 * correctif ne demande donc aucune migration, et ce fichier le vérifie plutôt
 * que de le supposer.
 */

function publish(draft: ContentDraft): PublishedContentVersion {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-08T12:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

function rowFor(version: PublishedContentVersion): PublishedVersionRow {
  const stored = storedNormativeFields(version);

  return {
    id: version.id,
    sourceArtifactId: version.sourceArtifactId,
    artifactType: version.artifactType,
    title: version.title,
    slug: version.slug,
    domain: version.domain,
    module: version.module,
    chapter: version.chapter,
    chapterLabel: version.chapterLabel,
    contentSnapshot: version.contentSnapshot,
    sourceReferencesSnapshot: version.sourceReferencesSnapshot,
    publicationVersion: version.publicationVersion,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    generationMetadataSnapshot: version.generationMetadataSnapshot,
    validationMetadataSnapshot: version.validationMetadataSnapshot,
    reviewMetadataSnapshot: version.reviewMetadataSnapshot,
    contentHash: version.contentHash,
    status: version.status,
    previousPublishedVersionId: version.previousPublishedVersionId,
    archivedAt: version.archivedAt,
    normativeContextSnapshot: stored.normativeContextSnapshot,
    normativeProfile: stored.normativeProfile,
    scoringPolicy: stored.scoringPolicy
  };
}

const COMPARISON_CONTEXT: NormativeContext = {
  profile: "course-original",
  status: "legacy",
  effectiveTo: "2025-12-31",
  scoringPolicy: "comparison-only",
  sourceVersionIds: ["e2e-pack-reference"],
  supersededByProfile: "anc-2026-current",
  customAccountDisclosures: [],
  versionConflictNotes: []
};

function assistedSheet(): ContentDraft {
  return draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
    status: "approved",
    mode: "manual-assisted"
  });
}

describe("aller-retour PostgreSQL du mode de génération", () => {
  it("conserve manual-assisted de l'instantané à la relecture", () => {
    const version = versionFromRow(rowFor(publish(assistedSheet())));

    expect(version.generationMetadataSnapshot.mode).toBe("manual-assisted");
  });

  it("conserve le référentiel et sa politique de notation", () => {
    const version = versionFromRow(
      rowFor(publish({ ...assistedSheet(), normativeContext: COMPARISON_CONTEXT } as ContentDraft))
    );

    expect(version.generationMetadataSnapshot.mode).toBe("manual-assisted");
    expect(version.normativeContextSnapshot).toEqual(COMPARISON_CONTEXT);
    expect(normativeContextOf(version).scoringPolicy).toBe("comparison-only");
    expect(isGradedVersion(version)).toBe(false);
  });

  it("projette le mode dans aucune colonne de résumé", () => {
    // Les colonnes promues servent à répondre « qu'y a-t-il de publié, et
    // qu'a-t-on le droit de noter ». Le mode n'y figure pas : il ne conditionne
    // aucune lecture de liste, et l'y ajouter créerait une deuxième vérité à
    // maintenir en face du JSONB.
    const row = rowFor(publish(assistedSheet()));

    expect(Object.keys(row)).not.toContain("generationMode");
    // La fiche de test emploie 4671, un sous-compte déclaré : son profil est
    // « propre au cas », ce qui n'a rien à voir avec le mode de génération — et
    // c'est justement le point.
    expect(row.normativeProfile).toBe("entity-specific");
    expect(row.scoringPolicy).toBe("graded");
  });

  it("relit un mock sans le rendre publiable pour autant", () => {
    // Une ligne insérée à la main, une base restaurée d'un environnement de
    // recette : la relecture doit réussir — c'est ce qui permet de la constater —
    // et la liste blanche doit continuer de la refuser.
    const forged = rowFor(publish(assistedSheet()));
    const row: PublishedVersionRow = {
      ...forged,
      generationMetadataSnapshot: {
        ...(forged.generationMetadataSnapshot as Record<string, unknown>),
        mode: "mock"
      }
    };
    const version = versionFromRow(row);

    expect(version.generationMetadataSnapshot.mode).toBe("mock");
    expect(isPublishableGenerationMode(version.generationMetadataSnapshot.mode)).toBe(false);
  });
});

describe("ce que le navigateur reçoit d'un contenu assisté", () => {
  function assistedCard(): PublishedContentVersion {
    return versionFromRow(
      rowFor(
        publish(
          draftFor({ contentType: "flashcard", content: flashcardContent() } as ContentPayload, {
            id: "fixture-assistee-carte",
            status: "approved",
            mode: "manual-assisted"
          })
        )
      )
    );
  }

  it("ne porte ni le mode de génération, ni le fournisseur, ni le prompt", () => {
    const version = assistedCard();

    // Test de contrôle : l'instantané, lui, porte bien ces champs. Sans lui, les
    // absences vérifiées plus bas ne prouveraient rien.
    expect(version.generationMetadataSnapshot.mode).toBe("manual-assisted");

    for (const projected of [toPublicFlashcardFront(version), revealFlashcard(version)]) {
      const serialized = JSON.stringify(projected);

      for (const forbidden of ['"mode"', '"provider"', '"promptId"', '"inputHash"', "manual-assisted"]) {
        expect(serialized, `le DTO public expose ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("ne laisse aucun client décider qu'un contenu est publiable", () => {
    // Le serveur reste l'autorité : la projection ne transporte ni le mode, ni
    // un drapeau « publiable » qu'un navigateur pourrait retourner modifié.
    const serialized = JSON.stringify(revealFlashcard(assistedCard()));

    expect(serialized.toLowerCase()).not.toContain("publishable");
    expect(serialized.toLowerCase()).not.toContain("publiable");
    expect(serialized).not.toContain("generationMetadata");
  });

  it("laisse les sources désigner sans citer, quel que soit le mode", () => {
    const serialized = JSON.stringify(
      toPublicSourceReferences(assistedCard().sourceReferencesSnapshot)
    );

    expect(serialized).not.toContain("excerpt");
    expect(serialized).not.toContain('"mode"');
  });
});
