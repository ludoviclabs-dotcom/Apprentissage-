import { describe, expect, it } from "vitest";
import {
  contentManifestEntrySchema,
  isPortableRelativePath,
  validateExtractionArtifact,
  validateManifest,
  type ContentManifest,
  type ExtractedDocumentArtifact
} from "../src/content-pipeline";

function makeEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    relativePath: "comptabilite/Les titres - Fiche de cours.pdf",
    originalName: "Les titres - Fiche de cours.pdf",
    extension: ".pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    domainId: "compta-generale",
    category: "course",
    chapterLabel: "Les titres",
    chapterSlug: "les-titres",
    variantKey: "",
    extraction: { status: "pending", issues: [] },
    ...overrides
  };
}

function makeManifest(files: Array<Record<string, unknown>>): Record<string, unknown> {
  const byCategory: Record<string, number> = {};
  for (const file of files) {
    const category = String(file.category);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  return {
    packId: "test-pack",
    generatedAt: "2026-08-05T10:00:00.000Z",
    files,
    skipped: [],
    counts: { files: files.length, skipped: 0, byCategory, byDomain: { "compta-generale": files.length } }
  };
}

function makeArtifact(overrides: Partial<ExtractedDocumentArtifact> = {}): ExtractedDocumentArtifact {
  return {
    sha256: "a".repeat(64),
    relativePath: "comptabilite/doc.pdf",
    extension: ".pdf",
    domainId: "compta-generale",
    category: "course",
    status: "extracted",
    pageCount: 2,
    pages: [
      { pageNumber: 1, rawText: "Texte page un.", markdownText: "Texte page un.", issues: [] },
      { pageNumber: 2, rawText: "Texte page deux.", markdownText: "Texte page deux.", issues: [] }
    ],
    chunks: [
      {
        id: "chunk-1234567890abcdef",
        sectionTitle: "Sans titre",
        content: "Texte page deux.",
        contentHash: "b".repeat(64),
        pageStart: 2,
        pageEnd: 2
      }
    ],
    issues: [],
    ...overrides
  };
}

describe("portes de qualité — chemins", () => {
  it("refuse tout chemin absolu ou non portable", () => {
    expect(isPortableRelativePath("comptabilite/cours.pdf")).toBe(true);
    expect(isPortableRelativePath("C:/Users/Ludo/cours.pdf")).toBe(false);
    expect(isPortableRelativePath("C:\\Users\\Ludo\\cours.pdf")).toBe(false);
    expect(isPortableRelativePath("/home/ludo/cours.pdf")).toBe(false);
    expect(isPortableRelativePath("../cours.pdf")).toBe(false);
    expect(isPortableRelativePath("comptabilite\\cours.pdf")).toBe(false);
  });

  it("rejette un manifeste contenant un chemin absolu", () => {
    const manifest = makeManifest([makeEntry({ relativePath: "C:/Users/Ludo/Dropbox/cours.pdf" })]);
    const result = validateManifest(manifest);

    expect(result.manifest).toBeUndefined();
    expect(result.errors.some((issue) => issue.code === "schema-invalide")).toBe(true);
  });
});

describe("portes de qualité — manifeste", () => {
  it("accepte un manifeste conforme", () => {
    const result = validateManifest(makeManifest([makeEntry()]));
    expect(result.errors).toHaveLength(0);
    expect(result.manifest?.files).toHaveLength(1);
  });

  it("refuse une catégorie documentaire inconnue", () => {
    const parsed = contentManifestEntrySchema.safeParse(makeEntry({ category: "corrige-bis" }));
    expect(parsed.success).toBe(false);
  });

  it("refuse une extension non supportée", () => {
    const parsed = contentManifestEntrySchema.safeParse(
      makeEntry({ extension: ".txt", relativePath: "notes.txt", originalName: "notes.txt" })
    );
    expect(parsed.success).toBe(false);
  });

  it("refuse un checksum qui n'est pas un SHA-256", () => {
    const parsed = contentManifestEntrySchema.safeParse(makeEntry({ sha256: "abc123" }));
    expect(parsed.success).toBe(false);
  });

  it("détecte les chemins dupliqués et les compteurs incohérents", () => {
    const manifest = makeManifest([makeEntry(), makeEntry()]) as { counts: { files: number } };
    manifest.counts.files = 5;
    const result = validateManifest(manifest);

    expect(result.errors.some((issue) => issue.code === "chemin-duplique")).toBe(true);
    expect(result.errors.some((issue) => issue.code === "compteur-incoherent")).toBe(true);
  });
});

describe("portes de qualité — extraction", () => {
  it("accepte un artefact cohérent", () => {
    const result = validateExtractionArtifact(makeArtifact());
    expect(result.errors).toHaveLength(0);
  });

  it("refuse une pagination non strictement croissante", () => {
    const artifact = makeArtifact({
      pages: [
        { pageNumber: 2, rawText: "x", markdownText: "x", issues: [] },
        { pageNumber: 1, rawText: "y", markdownText: "y", issues: [] }
      ],
      chunks: []
    });
    const result = validateExtractionArtifact(artifact);
    expect(result.errors.some((issue) => issue.code === "pagination-non-croissante")).toBe(true);
  });

  it("refuse un chunk qui référence une page absente", () => {
    const artifact = makeArtifact({
      chunks: [
        {
          id: "chunk-ffffffffffffffff",
          sectionTitle: "Sans titre",
          content: "Hors pages.",
          contentHash: "c".repeat(64),
          pageStart: 9,
          pageEnd: 9
        }
      ]
    });
    const result = validateExtractionArtifact(artifact);
    expect(result.errors.some((issue) => issue.code === "chunk-hors-pages")).toBe(true);
  });

  it("refuse le statut « extracted » quand des pages posent problème", () => {
    const artifact = makeArtifact({
      pages: [
        {
          pageNumber: 1,
          rawText: "x",
          markdownText: "x",
          issues: [{ code: "table-suspected", message: "tableau probable", page: 1 }]
        }
      ],
      pageCount: 1,
      chunks: []
    });
    const result = validateExtractionArtifact(artifact);
    expect(result.errors.some((issue) => issue.code === "statut-incoherent")).toBe(true);
  });

  it("refuse des chunks sous statut needs-docling", () => {
    const artifact = makeArtifact({ status: "needs-docling" });
    const result = validateExtractionArtifact(artifact);
    expect(result.errors.some((issue) => issue.code === "statut-incoherent")).toBe(true);
  });
});

describe("portes de qualité — types stricts", () => {
  it("le manifeste validé est typé, pas un JSON libre", () => {
    const result = validateManifest(makeManifest([makeEntry()]));
    const manifest: ContentManifest | undefined = result.manifest;
    expect(manifest?.packId).toBe("test-pack");
  });
});
