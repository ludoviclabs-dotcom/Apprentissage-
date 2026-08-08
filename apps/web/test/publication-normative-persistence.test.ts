import {
  buildPublishedVersion,
  filterComparisonOnlyVersions,
  filterGradedVersions,
  inspectForPublication,
  isGradedVersion,
  normativeContextOf,
  publishedContentVersionSchema,
  revealFlashcard,
  storedNormativeFields,
  toPublicJournalEntryExercise,
  type PublishedContentVersion
} from "@finance/content-publication";
import type { ContentDraft, NormativeContext } from "@finance/content-generation";
import type { PublishedVersionRow } from "@finance/db";
import { describe, expect, it } from "vitest";
import { versionFromRow } from "@/lib/publication/store";
import {
  approvedFlashcardDraft,
  approvedJournalDraft,
  testCorpus
} from "../../../packages/content-publication/test/fixtures";

/**
 * Le référentiel survit-il à un aller-retour par PostgreSQL ?
 *
 * CE QUI ÉTAIT PERDU, ET POURQUOI C'ÉTAIT GRAVE. `published_content_versions`
 * n'avait pas de colonne pour `normativeContext` : l'écriture le laissait
 * tomber, la lecture ne pouvait pas le retrouver, et
 * `resolveNormativeContext` — dont le défaut est *le référentiel en vigueur* —
 * rendait courante et notable une carte publiée « support d'origine, comparaison
 * seule ». Elle serait entrée dans la file de révision espacée et aurait corrigé
 * un apprenant sur un traitement remplacé au 1er janvier 2026. Le modèle
 * normatif défait par la couche de stockage, sans qu'aucune erreur ne s'affiche.
 *
 * CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS. Il exerce la chaîne
 * réelle — brouillon → instantané → colonnes → `versionFromRow` → projection
 * publique — en construisant la ligne exactement comme la table la rend. Il
 * prouve donc la correspondance, qui est l'endroit où un champ se perd. Il ne
 * prouve pas que PostgreSQL accepte la migration : cela demande un moteur, et
 * c'est le rôle de `packages/db/test/normative-persistence.integration.test.ts`.
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

/**
 * La ligne telle que la table la rend, construite depuis la version.
 *
 * Le passage par `storedNormativeFields` n'est pas un raccourci de test : c'est
 * la fonction que `recordPublishedVersion` reçoit côté écriture. La contourner
 * aurait fait passer le test sur une correspondance que le code n'emploie pas.
 */
function rowFor(version: PublishedContentVersion, overrides: Partial<PublishedVersionRow> = {}): PublishedVersionRow {
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
    scoringPolicy: stored.scoringPolicy,
    ...overrides
  };
}

const CURRENT_CONTEXT: NormativeContext = {
  profile: "anc-2026-current",
  status: "current",
  effectiveFrom: "2026-01-01",
  scoringPolicy: "graded",
  sourceVersionIds: ["reference-core-anc-2026-002bbc6a5eca"],
  customAccountDisclosures: [],
  versionConflictNotes: []
};

const LEGACY_CONTEXT: NormativeContext = {
  profile: "course-original",
  status: "legacy",
  effectiveTo: "2025-12-31",
  scoringPolicy: "comparison-only",
  sourceVersionIds: ["reference-core-anc-2026-002bbc6a5eca"],
  supersededByProfile: "anc-2026-current",
  customAccountDisclosures: [
    {
      accountNumber: "4816",
      parentAccount: "481",
      source: "course",
      label: "Frais d'émission des emprunts (numérotation du support)"
    }
  ],
  versionConflictNotes: [
    {
      code: "compte-remplace",
      severity: "warning",
      message: "Note interne de relecture : 481 et 6862 tiennent ce rôle depuis le 1er janvier 2026.",
      sourceIds: ["reference-core-anc-2026-002bbc6a5eca"]
    }
  ]
};

const ENTITY_CONTEXT: NormativeContext = {
  profile: "entity-specific",
  status: "custom",
  effectiveFrom: "2026-01-01",
  scoringPolicy: "graded",
  sourceVersionIds: ["reference-core-anc-2026-002bbc6a5eca"],
  customAccountDisclosures: [
    {
      accountNumber: "4671",
      parentAccount: "467",
      source: "course",
      label: "Obligataires, obligations à placer"
    }
  ],
  versionConflictNotes: []
};

function roundTrip(context: NormativeContext, draft = approvedFlashcardDraft()): PublishedContentVersion {
  return versionFromRow(rowFor(publish({ ...draft, normativeContext: context } as ContentDraft)));
}

describe("aller-retour du contexte normatif", () => {
  it("conserve un profil en vigueur, champ par champ", () => {
    const context = roundTrip(CURRENT_CONTEXT).normativeContextSnapshot;

    expect(context).toEqual(CURRENT_CONTEXT);
  });

  it("conserve le profil du support d'origine et sa politique de comparaison", () => {
    const version = roundTrip(LEGACY_CONTEXT);

    expect(version.normativeContextSnapshot?.profile).toBe("course-original");
    expect(version.normativeContextSnapshot?.status).toBe("legacy");
    expect(version.normativeContextSnapshot?.scoringPolicy).toBe("comparison-only");
    expect(version.normativeContextSnapshot?.supersededByProfile).toBe("anc-2026-current");
    expect(version.normativeContextSnapshot?.effectiveTo).toBe("2025-12-31");
  });

  it("conserve un sous-compte propre au cas et son compte parent", () => {
    const version = roundTrip(ENTITY_CONTEXT);

    expect(version.normativeContextSnapshot?.profile).toBe("entity-specific");
    expect(version.normativeContextSnapshot?.customAccountDisclosures).toEqual([
      {
        accountNumber: "4671",
        parentAccount: "467",
        source: "course",
        label: "Obligataires, obligations à placer"
      }
    ]);
  });

  it("conserve les identifiants de version de référentiel", () => {
    expect(roundTrip(CURRENT_CONTEXT).normativeContextSnapshot?.sourceVersionIds).toEqual([
      "reference-core-anc-2026-002bbc6a5eca"
    ]);
  });

  it("conserve les notes de divergence pour la relecture", () => {
    expect(roundTrip(LEGACY_CONTEXT).normativeContextSnapshot?.versionConflictNotes).toHaveLength(1);
  });

  it("dérive les deux colonnes de résumé depuis l'instantané", () => {
    const row = rowFor(publish({ ...approvedFlashcardDraft(), normativeContext: LEGACY_CONTEXT } as ContentDraft));

    expect(row.normativeProfile).toBe("course-original");
    expect(row.scoringPolicy).toBe("comparison-only");
  });
});

describe("ce que la lecture en tire", () => {
  it("n'admet dans la file notée que ce qui fait foi", () => {
    const current = roundTrip(CURRENT_CONTEXT);
    const legacy = versionFromRow(
      rowFor(
        publish({
          ...approvedFlashcardDraft(),
          title: "Carte du support d'origine",
          normativeContext: LEGACY_CONTEXT
        } as ContentDraft)
      )
    );

    expect(isGradedVersion(current)).toBe(true);
    expect(isGradedVersion(legacy)).toBe(false);
    expect(filterGradedVersions([current, legacy])).toEqual([current]);
    expect(filterComparisonOnlyVersions([current, legacy])).toEqual([legacy]);
  });

  it("n'expose pas les notes internes après relecture depuis la base", () => {
    const version = versionFromRow(
      rowFor(publish({ ...approvedJournalDraft(), normativeContext: LEGACY_CONTEXT } as ContentDraft))
    );
    const serialized = JSON.stringify(toPublicJournalEntryExercise(version));

    expect(serialized).not.toContain("Note interne de relecture");
    expect(serialized).not.toContain("versionConflictNotes");
    expect(serialized).not.toContain("sourceVersionIds");
  });

  it("ne nomme aucun sous-compte avant la tentative, et le nomme après", () => {
    const version = versionFromRow(
      rowFor(publish({ ...approvedFlashcardDraft(), normativeContext: ENTITY_CONTEXT } as ContentDraft))
    );

    expect(JSON.stringify(normativeContextOf(version))).not.toContain("4671");
    expect(revealFlashcard(version).disclosedAccounts[0]?.accountNumber).toBe("4671");
  });
});

describe("compatibilité des lignes antérieures", () => {
  it("relit une ligne écrite avant la migration 0015", () => {
    // Les trois colonnes sont nulles : c'est l'état d'une publication faite
    // avant que le modèle existe.
    const version = versionFromRow(
      rowFor(publish({ ...approvedFlashcardDraft(), normativeContext: CURRENT_CONTEXT } as ContentDraft), {
        normativeContextSnapshot: null,
        normativeProfile: null,
        scoringPolicy: null
      })
    );

    expect(version.normativeContextSnapshot).toBeNull();
    // Elle est lue comme le référentiel en vigueur, ce qu'elle signifiait quand
    // elle a été écrite — et non comme une erreur.
    expect(normativeContextOf(version).profile).toBe("anc-2026-current");
    expect(normativeContextOf(version).scoringPolicy).toBe("graded");
  });

  it("distingue « pas de référentiel » de « référentiel courant »", () => {
    const older = rowFor(publish({ ...approvedFlashcardDraft(), normativeContext: CURRENT_CONTEXT } as ContentDraft), {
      normativeContextSnapshot: null,
      normativeProfile: null,
      scoringPolicy: null
    });

    // La colonne dit « non établi ». Seule la lecture applique le défaut : la
    // base ne prétend pas que la version portait un référentiel.
    expect(older.normativeProfile).toBeNull();
    expect(versionFromRow(older).normativeContextSnapshot).toBeNull();
  });
});

describe("garde de publication", () => {
  function inspect(draft: ContentDraft) {
    return inspectForPublication({ draft, corpus: testCorpus, currentVersion: 0 });
  }

  it("refuse une publication sans référentiel", () => {
    const report = inspect({ ...approvedFlashcardDraft(), normativeContext: null } as ContentDraft);

    expect(report.passed).toBe(false);
    expect(report.errors.map((problem) => problem.code)).toContain("contexte-normatif-absent");
  });

  it("refuse un profil en vigueur qui ne nomme aucune version de référentiel", () => {
    const report = inspect({
      ...approvedFlashcardDraft(),
      normativeContext: { ...CURRENT_CONTEXT, sourceVersionIds: [] }
    } as ContentDraft);

    expect(report.passed).toBe(false);
    expect(report.errors.some((problem) => problem.message.includes("version de référentiel"))).toBe(true);
  });

  it("refuse un profil historique déclaré notable", () => {
    const report = inspect({
      ...approvedFlashcardDraft(),
      normativeContext: { ...LEGACY_CONTEXT, scoringPolicy: "graded" }
    } as ContentDraft);

    expect(report.passed).toBe(false);
  });

  it("accepte une publication dont le référentiel est complet", () => {
    expect(inspect({ ...approvedFlashcardDraft(), normativeContext: CURRENT_CONTEXT } as ContentDraft).passed).toBe(
      true
    );
  });
});

describe("versionnement et archivage", () => {
  it("laisse chaque version porter son propre référentiel", () => {
    const first = publish({ ...approvedFlashcardDraft(), normativeContext: LEGACY_CONTEXT } as ContentDraft);
    const second = buildPublishedVersion({
      draft: { ...approvedFlashcardDraft(), normativeContext: CURRENT_CONTEXT } as ContentDraft,
      publishedBy: "relecteur@example.test",
      publishedAt: "2026-09-01T12:00:00.000Z",
      publicationVersion: 2,
      previousPublishedVersionId: first.id
    });

    expect(versionFromRow(rowFor(first)).normativeContextSnapshot?.profile).toBe("course-original");
    expect(versionFromRow(rowFor(second)).normativeContextSnapshot?.profile).toBe("anc-2026-current");
  });

  it("conserve le référentiel d'une version archivée", () => {
    const archived = rowFor(publish({ ...approvedFlashcardDraft(), normativeContext: LEGACY_CONTEXT } as ContentDraft), {
      status: "archived",
      archivedAt: "2026-09-01T12:00:00.000Z"
    });

    // L'archivage ne touche que `status` et `archived_at` : le référentiel de ce
    // qui a été servi reste lisible, sans quoi l'audit ne dirait plus selon quel
    // plan le contenu retiré était vrai.
    expect(publishedContentVersionSchema.parse(archived).normativeContextSnapshot?.profile).toBe(
      "course-original"
    );
  });
});
