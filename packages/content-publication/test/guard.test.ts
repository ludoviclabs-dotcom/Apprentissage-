import { describe, expect, it } from "vitest";
import { inspectForPublication } from "../src/guard";
import {
  approvedCalculationDraft,
  approvedCaseDraft,
  approvedJournalDraft,
  approvedSheetDraft,
  calculationContent,
  degradedReference,
  draftFor,
  emptyCorpus,
  journalContent,
  sheetContent,
  testCorpus
} from "./fixtures";
import type { ContentPayload } from "@finance/content-generation";

/**
 * Le garde de publication : ce qu'il refuse, et pourquoi.
 *
 * Chaque cas correspond à un refus nommé au cahier des charges. On assert le
 * *code* du refus et non seulement `passed === false` : un contenu peut échouer
 * pour la mauvaise raison, et un test qui ne regarde que le booléen laisserait
 * passer un garde qui refuse tout.
 */

function inspect(draft: Parameters<typeof inspectForPublication>[0]["draft"], corpus = testCorpus) {
  return inspectForPublication({ draft, corpus, currentVersion: 0 });
}

function codes(report: ReturnType<typeof inspectForPublication>): string[] {
  return report.errors.map((issue) => issue.code);
}

describe("garde de publication — statuts éditoriaux", () => {
  for (const status of ["draft", "needs_review", "validation_failed", "rejected"] as const) {
    it(`refuse un contenu en « ${status} »`, () => {
      const report = inspect(draftFor(
        { contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload,
        { status, validationPassed: status !== "validation_failed" }
      ));

      expect(report.passed).toBe(false);
      expect(codes(report)).toContain("statut-non-approuve");
    });
  }

  it("accepte un contenu approuvé et valide", () => {
    const report = inspect(approvedSheetDraft());

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.publicationVersion).toBe(1);
    expect(report.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("garde de publication — provenance du contenu", () => {
  it("refuse un contenu généré en mode mock", () => {
    const report = inspect(
      draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
        mode: "mock"
      })
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("mode-non-publiable");
  });

  it("accepte un contenu rédigé en mode manual-assisted", () => {
    // Le mode assisté a franchi les mêmes contrôles déterministes et attend la
    // même approbation humaine que le mode live : rien ne justifie de le
    // refuser ici. C'est la seule différence de traitement entre lui et `mock`,
    // et elle doit être vérifiée plutôt que supposée.
    const report = inspect(
      draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
        status: "approved",
        mode: "manual-assisted"
      })
    );

    expect(codes(report)).not.toContain("mode-non-publiable");
  });

  it("refuse un contenu dont le corpus est introuvable", () => {
    const report = inspect(approvedSheetDraft(), emptyCorpus);

    expect(report.passed).toBe(false);
    expect(report.sourceIntegrity.corpusAvailable).toBe(true);
    expect(codes(report)).toContain("document-inconnu");
  });

  it("refuse de publier sans corpus du tout plutôt que de conclure favorablement", () => {
    const report = inspectForPublication({
      draft: approvedSheetDraft(),
      corpus: undefined,
      currentVersion: 0
    });

    expect(report.passed).toBe(false);
    expect(report.sourceIntegrity.corpusAvailable).toBe(false);
    expect(codes(report)).toContain("corpus-indisponible");
  });

  it("refuse un contenu appuyé sur une page dont l'extraction est dégradée", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          essentialRules: [
            {
              statement: "La prime de remboursement est amortie sur la durée de l'emprunt.",
              sourceReferences: [degradedReference]
            }
          ]
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("page-degradee");
  });

  it("refuse une référence vers un document qui n'existe plus", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          essentialRules: [
            {
              statement: "Une règle citant un document disparu du corpus extrait.",
              sourceReferences: [
                {
                  pack: "test-pack",
                  documentId: "test-pack-zzzzzzzzzzzz",
                  documentTitle: "Document supprimé",
                  sourceType: "course" as const,
                  pageStart: 1,
                  pageEnd: 1,
                  chunkIds: ["chunk-disparu00000000"]
                }
              ]
            }
          ]
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("document-inconnu");
  });
});

describe("garde de publication — fuites", () => {
  it("refuse un chemin de fichier absolu", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          summary: "Voir le support sous C:\\Users\\ludo\\cours\\obligations pour le détail complet."
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("chemin-prive");
  });

  it("refuse un lien direct vers un fichier source privé", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          summary: "Le support complet est disponible sur https://exemple.test/cours-obligations.pdf ici."
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("url-fichier-prive");
  });

  it("refuse une mention de CONTENT_SOURCE_ROOT", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          summary: "Le fichier se trouve dans CONTENT_SOURCE_ROOT, à la racine du dossier privé du poste."
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("url-fichier-prive");
  });

  it("refuse ce qui ressemble à une clé d'API", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({
          summary: "Appel effectué avec api_key=sk-abcdefghijklmnopqrstuvwxyz012345 pour produire la fiche."
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("secret-detecte");
  });
});

describe("garde de publication — contrôles déterministes rejoués", () => {
  it("accepte un exercice de calcul dont le recalcul concorde", () => {
    const report = inspect(approvedCalculationDraft());

    expect(report.passed).toBe(true);
    expect(report.deterministicValidation.passed).toBe(true);
    expect(report.deterministicValidation.checks).toHaveLength(1);
  });

  it("refuse un exercice de calcul dont la réponse annoncée a été retouchée après approbation", () => {
    const report = inspect(
      draftFor({
        contentType: "calculation_exercise",
        content: calculationContent({ expectedAnswer: 99999 })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(report.deterministicValidation.passed).toBe(false);
    expect(codes(report)).toContain("controle-deterministe");
  });

  it("accepte une écriture équilibrée", () => {
    const report = inspect(approvedJournalDraft());

    expect(report.passed).toBe(true);
    expect(report.deterministicValidation.passed).toBe(true);
  });

  it("refuse une écriture déséquilibrée", () => {
    const lines = journalContent().expectedLines.map((line, index) =>
      index === 0 ? { ...line, debit: 1 } : line
    );

    const report = inspect(
      draftFor({
        contentType: "journal_entry_exercise",
        content: journalContent({
          expectedLines: lines,
          expectedTotalDebit: 80001,
          expectedTotalCredit: 8048000
        })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(report.deterministicValidation.passed).toBe(false);
    expect(
      report.deterministicValidation.checks.some((check) => check.detail.includes("déséquilibrée"))
    ).toBe(true);
  });

  it("vérifie l'équilibre de chaque étape d'écriture d'un mini-cas", () => {
    const report = inspect(approvedCaseDraft());

    expect(report.passed).toBe(true);
    expect(report.deterministicValidation.checks.map((check) => check.label)).toContain(
      "Étape « ecriture »"
    );
  });
});

describe("garde de publication — contenu vide et empreinte", () => {
  it("refuse un contenu dont un champ porteur est blanc", () => {
    // Une chaîne d'espaces assez longue pour satisfaire le `min(20)` du schéma :
    // c'est exactement le cas que Zod ne peut pas attraper, et que le garde doit
    // donc attraper lui-même.
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({ summary: " ".repeat(40) })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("contenu-vide");
  });

  it("refuse un contenu qui ne respecte plus son schéma", () => {
    const report = inspect(
      draftFor({
        contentType: "smart_revision_sheet",
        content: sheetContent({ essentialRules: [] })
      } as ContentPayload)
    );

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("schema-invalide");
  });

  it("refuse un contenu dont l'empreinte ne correspond plus à ce qui a été relu", () => {
    const report = inspectForPublication({
      draft: approvedSheetDraft(),
      corpus: testCorpus,
      currentVersion: 0,
      reviewedContentHash: "f".repeat(64)
    });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("hash-divergent");
  });

  it("produit un rapport complet, même en cas de refus", () => {
    const report = inspect(
      draftFor({ contentType: "smart_revision_sheet", content: sheetContent() } as ContentPayload, {
        status: "draft",
        mode: "mock"
      })
    );

    expect(report).toMatchObject({
      passed: false,
      sourceIntegrity: { corpusAvailable: true },
      deterministicValidation: { passed: true },
      publicationVersion: 1
    });
    expect(report.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(codes(report)).toEqual(
      expect.arrayContaining(["statut-non-approuve", "mode-non-publiable"])
    );
  });
});
