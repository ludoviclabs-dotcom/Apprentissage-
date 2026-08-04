import { describe, expect, it } from "vitest";
import {
  activeCurriculum,
  evaluateCertificateEligibility,
  getPublishedTrackLevels,
  type CurriculumVersion,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";

/**
 * The curriculum an attestation is judged against (review finding P1).
 *
 * Completion is graded by `refreshTrackProgress`, which evaluates the learner's
 * *pinned* curriculum and only its published levels. Eligibility used to compare
 * those snapshots against every level of whichever curriculum is active today.
 * Publishing N3 and N4 therefore made an attestation permanently unobtainable
 * for anybody who had finished the two-level version — their two snapshots were
 * measured against four levels, two of which nobody had asked them to take.
 */

function level(id: string, position: number, status: "published" | "planned"): ModuleLevelDefinition {
  return {
    id,
    trackId: "track-history",
    moduleId: "module-history",
    domainId: "finance",
    level: position,
    title: id,
    objective: "objectif",
    competencyIds: [],
    criticalCompetencyIds: [],
    estimatedMinutes: 10,
    publicationStatus: status
  };
}

function passed(levelId: string, score: number): LevelSnapshot {
  return {
    levelId,
    rulesVersion: "v1",
    status: "passed",
    score,
    components: { direct: score, retention: 0, caseStudy: 0, explanation: 0 },
    missingKinds: [],
    finalDiagnosticCompleted: true,
    blockers: []
  };
}

/** The version a learner finished before two levels were added to the track. */
const pinned: CurriculumVersion = {
  id: "curriculum-2026-01",
  label: "Version historique",
  effectiveFrom: "2026-01-01",
  rules: activeCurriculum.rules,
  levels: [level("l1", 1, "published"), level("l2", 2, "published")]
};

/** The same track after N3 and N4 were published. */
const current: CurriculumVersion = {
  ...pinned,
  id: "curriculum-2026-07",
  levels: [...pinned.levels, level("l3", 3, "published"), level("l4", 4, "published")]
};

describe("an attestation is judged against the curriculum that graded it", () => {
  const snapshots = [passed("l1", 90), passed("l2", 86)];

  it("issues to a learner who finished the version they were enrolled on", () => {
    const result = evaluateCertificateEligibility({
      levels: getPublishedTrackLevels(pinned, "track-history"),
      snapshots,
      entitled: true
    });

    expect(result.eligible).toBe(true);
    expect(result.averageScore).toBe(88);
  });

  it("refuses that same learner when levels are read from the newer curriculum", () => {
    // This is the bug, pinned so it cannot come back: same learner, same
    // snapshots, judged against a syllabus published after they finished.
    const result = evaluateCertificateEligibility({
      levels: getPublishedTrackLevels(current, "track-history"),
      snapshots,
      entitled: true
    });

    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("levels-incomplete");
    // And the score is halved by two levels they were never asked to take.
    expect(result.averageScore).toBe(44);
  });

  it("ignores a planned level, which no snapshot can ever satisfy", () => {
    const withPlanned: CurriculumVersion = {
      ...pinned,
      levels: [...pinned.levels, level("l3", 3, "planned")]
    };

    // `refreshTrackProgress` only ever evaluates published levels, so counting
    // a planned one would make the track permanently unfinishable.
    expect(getPublishedTrackLevels(withPlanned, "track-history")).toHaveLength(2);
    expect(
      evaluateCertificateEligibility({
        levels: getPublishedTrackLevels(withPlanned, "track-history"),
        snapshots,
        entitled: true
      }).eligible
    ).toBe(true);
  });
});
