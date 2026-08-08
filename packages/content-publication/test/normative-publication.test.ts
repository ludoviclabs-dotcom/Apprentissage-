import type { ContentDraft, NormativeContext } from "@finance/content-generation";
import { describe, expect, it } from "vitest";
import { inspectForPublication } from "../src/guard";
import { catalogueFromArtifactTypes, computeChapterProgress } from "../src/progress";
import {
  disclosedAccountsOf,
  filterComparisonOnlyVersions,
  filterGradedVersions,
  isCurrentProfileVersion,
  isGradedVersion,
  normativeContextOf,
  revealFlashcard,
  toPublicFlashcardFront,
  toPublicJournalEntryExercise
} from "../src/public/projection";
import { buildPublishedVersion } from "../src/snapshot";
import { approvedFlashcardDraft, approvedJournalDraft, testCorpus } from "./fixtures";

/**
 * Ce que le référentiel change une fois le contenu publié.
 *
 * Trois propriétés, et elles se tiennent : le profil voyage avec l'instantané,
 * un contenu de comparaison n'entre dans aucune file notée, et les notes de
 * revue ne franchissent pas la frontière du navigateur.
 */

function publish(draft: ContentDraft) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-01T12:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

const legacyContext = (): NormativeContext => ({
  profile: "course-original",
  status: "legacy",
  effectiveTo: "2025-12-31",
  scoringPolicy: "comparison-only",
  sourceVersionIds: ["reference-core-anc-2026-002bbc6a5eca"],
  supersededByProfile: "anc-2026-current",
  customAccountDisclosures: [
    {
      accountNumber: "4671",
      parentAccount: "467",
      source: "course",
      label: "Obligataires, obligations à placer"
    }
  ],
  versionConflictNotes: [
    {
      code: "compte-remplace",
      severity: "warning",
      message:
        "Note interne de relecture : le virement par 791 n'apparaît nulle part dans le mécanisme du compte 481.",
      sourceIds: ["reference-core-anc-2026-002bbc6a5eca"]
    }
  ]
});

describe("le référentiel voyage avec l'instantané", () => {
  it("recopie le contexte normatif du brouillon", () => {
    const version = publish(approvedJournalDraft());

    expect(version.normativeContextSnapshot?.profile).toBe("entity-specific");
    expect(normativeContextOf(version).profile).toBe("entity-specific");
  });

  it("rend le référentiel en vigueur pour une version antérieure au champ", () => {
    const version = publish(approvedJournalDraft());
    const older = { ...version, normativeContextSnapshot: null };

    expect(normativeContextOf(older).profile).toBe("anc-2026-current");
    expect(normativeContextOf(older).scoringPolicy).toBe("graded");
    expect(isCurrentProfileVersion(older)).toBe(true);
  });
});

describe("les DTO publics n'exposent pas les notes internes", () => {
  it("retire les notes de divergence et les versions de référentiel", () => {
    const version = publish(
      { ...approvedJournalDraft(), normativeContext: legacyContext() } as ContentDraft
    );
    const serialized = JSON.stringify(toPublicJournalEntryExercise(version));

    expect(serialized).not.toContain("Note interne de relecture");
    expect(serialized).not.toContain("versionConflictNotes");
    expect(serialized).not.toContain("sourceVersionIds");
    expect(serialized).not.toContain("reference-core-anc-2026");
  });

  it("ne nomme aucun sous-compte avant la tentative", () => {
    const version = publish(
      { ...approvedJournalDraft(), normativeContext: legacyContext() } as ContentDraft
    );
    const serialized = JSON.stringify(toPublicJournalEntryExercise(version));

    // 4671 est un compte attendu de l'écriture : le publier dans le contexte
    // reviendrait à redonner par la bande ce que `requiredAccounts` retire.
    expect(serialized).not.toContain("4671");
    expect(disclosedAccountsOf(version)).toHaveLength(1);
  });

  it("livre les sous-comptes déclarés une fois la réponse connue", () => {
    const version = publish(
      { ...approvedFlashcardDraft(), normativeContext: legacyContext() } as ContentDraft
    );
    const revealed = revealFlashcard(version);

    expect(revealed.disclosedAccounts[0]?.parentAccount).toBe("467");
    expect(revealed.normativeContext.profile).toBe("course-original");
    expect(JSON.stringify(revealed)).not.toContain("Note interne de relecture");
  });

  it("annonce la politique de notation à l'écran public", () => {
    const version = publish(
      { ...approvedFlashcardDraft(), normativeContext: legacyContext() } as ContentDraft
    );

    expect(toPublicFlashcardFront(version).normativeContext.scoringPolicy).toBe("comparison-only");
    expect(toPublicFlashcardFront(version).normativeContext.supersededByProfile).toBe(
      "anc-2026-current"
    );
  });
});

describe("les files notées n'emploient que ce qui fait foi", () => {
  const current = () => publish(approvedFlashcardDraft());
  // Un titre distinct, et pas seulement un identifiant de brouillon distinct :
  // l'identité d'une version publiée se dérive du titre, si bien que deux
  // brouillons homonymes produiraient la même version — et le test ne
  // comparerait plus rien.
  const legacy = () =>
    publish({
      ...approvedFlashcardDraft(),
      id: "e2e-draft-flashcard-legacy",
      title: "Carte du support d'origine",
      normativeContext: legacyContext()
    } as ContentDraft);

  it("écarte une carte historique de la file de révision espacée", () => {
    const graded = filterGradedVersions([current(), legacy()]);

    expect(graded).toHaveLength(1);
    expect(isGradedVersion(graded[0])).toBe(true);
    expect(graded[0].normativeContextSnapshot?.profile).toBe("anc-2026-current");
  });

  it("conserve la carte historique pour l'encart comparatif", () => {
    const comparison = filterComparisonOnlyVersions([current(), legacy()]);

    expect(comparison).toHaveLength(1);
    expect(comparison[0].normativeContextSnapshot?.profile).toBe("course-original");
  });

  it("ne fait dépendre aucun score d'un contenu de comparaison", () => {
    // Le catalogue est bâti sur les seules versions notées : un événement porté
    // par une carte de comparaison n'a plus d'artefact actif où se rattacher, et
    // ne compte donc ni comme réussite ni comme échec.
    const gradedIds = new Set(filterGradedVersions([current(), legacy()]).map((version) => version.id));
    const catalogue = catalogueFromArtifactTypes(["flashcard"], { activeArtifactIds: gradedIds });

    const progress = computeChapterProgress(
      [
        {
          kind: "flashcard_reviewed",
          artifactId: legacy().id,
          succeeded: false,
          occurredAt: "2026-08-02T10:00:00.000Z"
        }
      ],
      catalogue
    );

    expect(progress.totalAttempts).toBe(0);
    expect(progress.outstandingFailures).toBe(0);
    expect(progress.status).toBe("not-started");
  });
});

describe("garde de publication — référentiel déterminé", () => {
  function inspect(draft: ContentDraft) {
    return inspectForPublication({ draft, corpus: testCorpus, currentVersion: 0 });
  }

  it("refuse de publier un contenu à comptes versionnés sans référentiel", () => {
    const report = inspect({ ...approvedJournalDraft(), normativeContext: null } as ContentDraft);

    expect(report.passed).toBe(false);
    expect(report.errors.map((problem) => problem.code)).toContain("contexte-normatif-absent");
  });

  it("publie le même contenu une fois le référentiel posé", () => {
    expect(inspect(approvedJournalDraft()).passed).toBe(true);
  });
});
