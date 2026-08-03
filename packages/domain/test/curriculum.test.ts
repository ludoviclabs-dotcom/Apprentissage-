import { describe, expect, it } from "vitest";
import {
  COMPTA_GENERALE_V1_TRACK,
  EXCEL_LAB_TRACK,
  InvalidCurriculumError,
  activeCurriculum,
  assertValidCurriculum,
  competencies,
  curriculumVersions,
  getCurriculumVersion,
  getTrackIds,
  getTrackLevels,
  type CurriculumVersion
} from "../src";

function clone(): CurriculumVersion {
  return structuredClone(activeCurriculum);
}

describe("shipped curriculum", () => {
  it("is valid", () => {
    for (const version of curriculumVersions) {
      expect(() => assertValidCurriculum(version), version.id).not.toThrow();
    }
  });

  it("declares four gated levels on the accounting track", () => {
    const levels = getTrackLevels(activeCurriculum, "track-compta-generale");

    expect(levels.map((level) => level.level)).toEqual([1, 2, 3, 4]);
  });

  it("marks at least two distinct critical competencies across the track", () => {
    const critical = new Set(activeCurriculum.levels.flatMap((level) => level.criticalCompetencyIds));

    expect(critical.size).toBeGreaterThanOrEqual(2);
  });

  it("only references competencies that exist in the taxonomy", () => {
    const known = new Set(competencies.map((competency) => competency.id));

    for (const level of activeCurriculum.levels) {
      for (const competencyId of level.competencyIds) {
        expect(known.has(competencyId), `${level.id} → ${competencyId}`).toBe(true);
      }
    }
  });

  it("pins its rules version to its own id, so an enrolment cannot drift", () => {
    expect(activeCurriculum.rules.version).toBe(activeCurriculum.id);
  });

  it("is resolvable by id", () => {
    expect(getCurriculumVersion(activeCurriculum.id)?.id).toBe(activeCurriculum.id);
    expect(getCurriculumVersion("nope")).toBeUndefined();
  });

  it("lists its tracks", () => {
    // Exact rather than "contains": a track appearing here that nobody meant to
    // publish is a track learners can enrol in, so it has to be noticed.
    expect(getTrackIds(activeCurriculum)).toEqual([
      "track-compta-generale",
      COMPTA_GENERALE_V1_TRACK,
      EXCEL_LAB_TRACK
    ]);
  });

  it("gates the comptabilité générale v1 track on four contiguous levels", () => {
    const levels = getTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK);

    // PR-12a published the closing (N3) and financial-statements (N4) levels:
    // the full vertical « de la pièce au bilan », still gap-free.
    expect(levels.map((level) => level.level)).toEqual([1, 2, 3, 4]);
    expect(levels.map((level) => level.id)).toEqual([
      "level-compta-generale-v1-1",
      "level-compta-generale-v1-2",
      "level-compta-generale-v1-3",
      "level-compta-generale-v1-4"
    ]);
    // Each level must gate on something it actually teaches, or the unlock rule
    // has nothing to measure.
    for (const level of levels) {
      expect(level.criticalCompetencyIds.length, level.id).toBeGreaterThan(0);
    }
  });
});

describe("assertValidCurriculum", () => {
  it("rejects a rules version that disagrees with the curriculum id", () => {
    const version = clone();
    version.rules.version = "something-else";

    expect(() => assertValidCurriculum(version)).toThrow(InvalidCurriculumError);
  });

  it("rejects an empty curriculum", () => {
    expect(() => assertValidCurriculum({ ...clone(), levels: [] })).toThrow(InvalidCurriculumError);
  });

  it("rejects duplicate level ids", () => {
    const version = clone();
    version.levels[1].id = version.levels[0].id;

    expect(() => assertValidCurriculum(version)).toThrow(/Duplicate level id/);
  });

  it("rejects a level targeting no competency", () => {
    const version = clone();
    version.levels[0].competencyIds = [];
    version.levels[0].criticalCompetencyIds = [];

    expect(() => assertValidCurriculum(version)).toThrow(/targets no competency/);
  });

  it("rejects an unknown competency", () => {
    const version = clone();
    version.levels[0].competencyIds = ["cg-does-not-exist"];

    expect(() => assertValidCurriculum(version)).toThrow(/unknown competency/);
  });

  it("rejects a critical competency the level does not target", () => {
    const version = clone();
    version.levels[0].criticalCompetencyIds = ["ifrs-18"];

    expect(() => assertValidCurriculum(version)).toThrow(/marks "ifrs-18" critical/);
  });

  it("rejects a gap in level numbering", () => {
    // A gap would make the level after it permanently unreachable, because
    // availability depends on the previous level being acquired.
    const version = clone();
    version.levels[2].level = 9;

    expect(() => assertValidCurriculum(version)).toThrow(/without gaps/);
  });

  it("rejects levels that do not start at one", () => {
    const version = clone();

    for (const level of version.levels) {
      level.level += 1;
    }

    expect(() => assertValidCurriculum(version)).toThrow(/without gaps/);
  });

  it("rejects invalid rules through the shared validator", () => {
    const version = clone();
    version.rules.weights.direct = 0.9;

    expect(() => assertValidCurriculum(version)).toThrow();
  });
});
