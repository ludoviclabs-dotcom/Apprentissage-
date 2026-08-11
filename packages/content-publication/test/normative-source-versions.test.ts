import { describe, expect, it } from "vitest";
import { normativeSourceVersionIds } from "@finance/content-generation";
import { inspectForPublication } from "../src/guard";
import {
  REFERENCE_DOC_ID,
  COURSE_DOC_ID,
  courseReference,
  draftFor,
  sheetContent,
  testCorpus
} from "./fixtures";
import type { ContentPayload, NormativeContext } from "@finance/content-generation";

/**
 * Ce qu'un profil doit nommer pour être publiable.
 *
 * LA RÈGLE N'EST PAS DÉCORATIVE. Un contenu qui se dit conforme au plan en
 * vigueur sans nommer la version qu'il suit affirme quelque chose
 * d'invérifiable : le jour où le plan change, rien ne dit ce qu'il faut
 * reprendre. C'est le seul champ qui rende la reprise possible, et c'est
 * pourquoi son absence est un refus de publication et non un avertissement.
 */

const BASE: NormativeContext = {
  profile: "anc-2026-current",
  status: "current",
  effectiveFrom: "2026-01-01",
  scoringPolicy: "graded",
  sourceVersionIds: [REFERENCE_DOC_ID],
  customAccountDisclosures: [],
  versionConflictNotes: []
};

/**
 * La fiche de référence emploie 4671, un sous-compte propre au cas dont la
 * déclaration est un autre sujet. On l'écarte ici pour que ces tests ne portent
 * que sur la version de référentiel : un test qui échoue pour deux raisons
 * n'établit ni l'une ni l'autre.
 */
function inspect(normativeContext: NormativeContext | null) {
  return inspectForPublication({
    draft: draftFor(
      {
        contentType: "smart_revision_sheet",
        content: sheetContent({
          timelineSteps: [
            {
              order: 1,
              moment: "Émission",
              action: "Constatation de la dette obligataire.",
              accountsInvolved: ["163"],
              sourceReferences: [courseReference]
            }
          ]
        })
      } as ContentPayload,
      { status: "approved", normativeContext }
    ),
    corpus: testCorpus,
    currentVersion: 0
  });
}

function codes(report: ReturnType<typeof inspectForPublication>): string[] {
  return report.errors.map((issue) => issue.code);
}

describe("publication — le profil en vigueur nomme sa version", () => {
  it("publie un profil en vigueur qui nomme le référentiel qu'il suit", () => {
    const report = inspect(BASE);

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("refuse un profil en vigueur qui ne nomme aucune version", () => {
    const report = inspect({ ...BASE, sourceVersionIds: [] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("normative-profile-mismatch");
  });

  it("refuse un contenu sans aucun référentiel déclaré", () => {
    const report = inspect(null);

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("contexte-normatif-absent");
  });
});

describe("publication — profil historique et notation", () => {
  const legacy: NormativeContext = {
    profile: "course-original",
    status: "legacy",
    effectiveTo: "2025-12-31",
    scoringPolicy: "comparison-only",
    sourceVersionIds: [COURSE_DOC_ID, REFERENCE_DOC_ID],
    supersededByProfile: "anc-2026-current",
    customAccountDisclosures: [],
    versionConflictNotes: []
  };

  it("publie un traitement d'origine servi en comparaison seule", () => {
    const report = inspect(legacy);

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("refuse de noter sur un traitement d'origine", () => {
    const report = inspect({ ...legacy, scoringPolicy: "graded" });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("normative-profile-mismatch");
  });

  it("refuse un statut qui contredit le profil", () => {
    const report = inspect({ ...legacy, status: "current" });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("normative-profile-mismatch");
  });
});

describe("les versions nommées viennent du corpus, jamais d'une constante", () => {
  it("donne au profil en vigueur les référentiels officiels extraits", () => {
    expect(
      normativeSourceVersionIds({
        profile: "anc-2026-current",
        referenceDocumentIds: [REFERENCE_DOC_ID],
        citedDocumentIds: [COURSE_DOC_ID]
      })
    ).toEqual([REFERENCE_DOC_ID]);
  });

  it("donne au profil propre à un cas le même référentiel officiel", () => {
    // Une subdivision d'entité reste une subdivision *du* plan officiel : elle
    // se lit contre lui, pas contre rien.
    expect(
      normativeSourceVersionIds({
        profile: "entity-specific",
        referenceDocumentIds: [REFERENCE_DOC_ID],
        citedDocumentIds: [COURSE_DOC_ID]
      })
    ).toEqual([REFERENCE_DOC_ID]);
  });

  it("nomme les deux termes de la comparaison pour un profil historique", () => {
    expect(
      normativeSourceVersionIds({
        profile: "course-original",
        referenceDocumentIds: [REFERENCE_DOC_ID],
        citedDocumentIds: [COURSE_DOC_ID, REFERENCE_DOC_ID]
      })
    ).toEqual([COURSE_DOC_ID, REFERENCE_DOC_ID]);
  });

  it("rend une liste vide quand aucun référentiel n'est extrait", () => {
    // Un résultat, pas un échec silencieux : le contenu restera bloqué avec son
    // motif plutôt que de nommer un document que personne n'a ingéré.
    expect(
      normativeSourceVersionIds({
        profile: "anc-2026-current",
        referenceDocumentIds: [],
        citedDocumentIds: [COURSE_DOC_ID]
      })
    ).toEqual([]);
  });
});
