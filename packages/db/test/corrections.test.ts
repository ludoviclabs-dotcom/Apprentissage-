import { describe, expect, it } from "vitest";
import { exercises } from "@finance/domain";
import { gradeExercise } from "../src";

function exerciseById(id: string) {
  const exercise = exercises.find((item) => item.id === id);

  if (!exercise) {
    throw new Error(`Missing exercise ${id}`);
  }

  return exercise;
}

describe("deterministic correction engine", () => {
  it("returns a structured sourced correction for a strong answer", () => {
    const correction = gradeExercise(
      exerciseById("ex-provision-litige"),
      "Au 31/12, le litige cree une obligation probable avec sortie de ressources et estimation fiable. Je retiens la fourchette 12 000 a 16 000 EUR, soit 14 000 EUR comme meilleure estimation, avec dotation, debit, credit et compte de provision. L'incertitude est mentionnee en annexe. Source cours page 42."
    );

    expect(correction.rubricScores).toHaveLength(4);
    expect(correction.score).toBeGreaterThanOrEqual(16);
    expect(correction.sourceReferences.length).toBeGreaterThan(0);
    expect(correction.remediationPlan.competencyTags).toEqual(["cg-provisions", "cg-cutoff"]);
  });

  it("separates partial points from missing elements", () => {
    const correction = gradeExercise(
      exerciseById("ex-provision-litige"),
      "Il faut provisionner car la perte est probable et l'avocat donne une estimation. La reponse doit etre justifiee."
    );

    expect(correction.score).toBeGreaterThan(0);
    expect(correction.partialPoints.length).toBeGreaterThan(0);
    expect(correction.missingElements.length).toBeGreaterThan(0);
  });

  it("flags a calculation error when the claimed amount is reused without estimate", () => {
    const correction = gradeExercise(
      exerciseById("ex-provision-litige"),
      "La societe doit provisionner 18 000 EUR car le fournisseur reclame ce montant et le risque existe."
    );

    expect(correction.calculationErrors.length).toBeGreaterThan(0);
  });

  it("keeps an off-topic answer low and still structured", () => {
    const correction = gradeExercise(
      exerciseById("ex-provision-litige"),
      "Le seuil de rentabilite se calcule avec les charges fixes et le taux de marge sur cout variable."
    );

    expect(correction.score).toBeLessThan(8);
    expect(correction.rubricScores.every((item) => typeof item.justification === "string")).toBe(true);
    expect(correction.reasoningErrors.length + correction.accountingTreatmentErrors.length).toBeGreaterThan(0);
  });

  it("flags an IFRS treatment error on a weak IAS 37 comparison", () => {
    const correction = gradeExercise(
      exerciseById("ex-ias37-comparison"),
      "PCG et IAS 37 sont identiques : par prudence on provisionne toujours, sans distinguer annexe ou passif eventuel."
    );

    expect(correction.accountingTreatmentErrors.length).toBeGreaterThan(0);
    expect(correction.sourceQualityIssues.length).toBeGreaterThan(0);
  });
});
