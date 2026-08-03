import { describe, expect, it } from "vitest";
import {
  COMPTA_GENERALE_V1_TRACK,
  EXCEL_LAB_TRACK,
  activeCurriculum,
  canonicalLearningTracks,
  getAttemptEvidenceKinds,
  getPublishedTrackLevels,
  reviewScoreByRating
} from "../src";

describe("canonical learning tracks", () => {
  it("exposes only the two tracks backed by published module content", () => {
    expect(canonicalLearningTracks.map((track) => track.trackId)).toEqual([
      COMPTA_GENERALE_V1_TRACK,
      EXCEL_LAB_TRACK
    ]);
    expect(canonicalLearningTracks.some((track) => track.trackId === "track-compta-generale")).toBe(
      false
    );
  });

  it("filters planned levels out of scoring without losing their metadata", () => {
    const planned = structuredClone(activeCurriculum);
    const level = planned.levels.find((candidate) => candidate.trackId === COMPTA_GENERALE_V1_TRACK)!;
    level.publicationStatus = "planned";

    expect(getPublishedTrackLevels(planned, COMPTA_GENERALE_V1_TRACK)).not.toContainEqual(level);
  });
});

describe("corrected evidence routing", () => {
  it("feeds direct work and method from a normal corrected attempt", () => {
    expect(
      getAttemptEvidenceKinds({
        exerciseId: "ex-cgv1-achat-marchandises",
        levelId: "level-compta-generale-v1-1",
        context: "exercise"
      })
    ).toEqual(["direct", "explanation"]);
  });

  it("feeds case study only for an exercise that belongs to the authored case", () => {
    expect(
      getAttemptEvidenceKinds({
        exerciseId: "ex-cgv1-achat-marchandises",
        levelId: "level-compta-generale-v1-1",
        context: "case_study"
      })
    ).toEqual(["caseStudy", "explanation"]);

    expect(
      getAttemptEvidenceKinds({
        exerciseId: "ex-xl-chiffre-affaires",
        levelId: "level-excel-finance-1",
        context: "case_study"
      })
    ).toEqual(["direct", "explanation"]);
  });

  it("closes the diagnostic gate only on the declared corrected exercise", () => {
    expect(
      getAttemptEvidenceKinds({
        exerciseId: "ex-xl-taux-marge",
        levelId: "level-excel-finance-1",
        context: "exercise"
      })
    ).toEqual(["direct", "explanation", "caseStudy", "finalDiagnostic"]);
  });

  it("maps a revealed review to a deterministic retention score", () => {
    expect(reviewScoreByRating).toEqual({
      forgotten: 0,
      partial: 50,
      correct: 75,
      mastered: 100
    });
  });
});
