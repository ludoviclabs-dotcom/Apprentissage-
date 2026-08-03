import { describe, expect, it } from "vitest";
import {
  ACTIVITY_KINDS,
  InvalidMasteryRulesError,
  assertValidRules,
  clampPercent,
  competencyStatusFromScore,
  computeLevelScore,
  evaluateLevel,
  evaluateTrack,
  getLevelStatusLabel,
  reduceEventsToComponents,
  shouldRecordUnlock,
  toPercent,
  type MasteryEvent,
  type MasteryRules
} from "../src";

const RULES: MasteryRules = {
  version: "test-rules",
  weights: { direct: 0.4, retention: 0.25, caseStudy: 0.2, explanation: 0.15 },
  passingScore: 75,
  criticalCompetencyMinimum: 60,
  requireFinalDiagnostic: true
};

const ALL = { direct: 100, retention: 100, caseStudy: 100, explanation: 100 };

function event(kind: MasteryEvent["kind"], scorePercent: number, occurredAt: string): MasteryEvent {
  return { levelId: "L1", kind, scorePercent, occurredAt };
}

/** Events that clear every weighted component and the diagnostic gate. */
function passingEvents(levelId = "L1"): MasteryEvent[] {
  return [
    { levelId, kind: "direct", scorePercent: 90, occurredAt: "2026-07-01T00:00:00.000Z" },
    { levelId, kind: "retention", scorePercent: 80, occurredAt: "2026-07-01T00:00:00.000Z" },
    { levelId, kind: "caseStudy", scorePercent: 80, occurredAt: "2026-07-01T00:00:00.000Z" },
    { levelId, kind: "explanation", scorePercent: 80, occurredAt: "2026-07-01T00:00:00.000Z" },
    { levelId, kind: "finalDiagnostic", scorePercent: 100, occurredAt: "2026-07-01T00:00:00.000Z" }
  ];
}

describe("assertValidRules", () => {
  it("accepts weights summing to one", () => {
    expect(() => assertValidRules(RULES)).not.toThrow();
  });

  it("remains valid after JSON serialization for a curriculum version", () => {
    const restored = JSON.parse(JSON.stringify(RULES)) as MasteryRules;

    expect(restored).toEqual(RULES);
    expect(() => assertValidRules(restored)).not.toThrow();
    expect(computeLevelScore({ direct: 80, retention: 60, caseStudy: 40, explanation: 20 }, restored)).toBe(58);
  });

  it("rejects weights that do not sum to one instead of normalising them", () => {
    // Silent normalisation would let a typo rescale everybody's score.
    expect(() =>
      assertValidRules({ ...RULES, weights: { direct: 0.5, retention: 0.25, caseStudy: 0.2, explanation: 0.15 } })
    ).toThrow(InvalidMasteryRulesError);
  });

  it("tolerates float drift within a thousandth", () => {
    expect(() =>
      assertValidRules({
        ...RULES,
        weights: { direct: 0.3333, retention: 0.3333, caseStudy: 0.3334, explanation: 0 }
      })
    ).not.toThrow();
  });

  it("rejects a negative or missing weight", () => {
    expect(() =>
      assertValidRules({ ...RULES, weights: { direct: 1.4, retention: -0.4, caseStudy: 0, explanation: 0 } })
    ).toThrow(InvalidMasteryRulesError);
    expect(() =>
      assertValidRules({
        ...RULES,
        weights: { direct: 0.4, retention: 0.25, caseStudy: 0.2 } as MasteryRules["weights"]
      })
    ).toThrow(InvalidMasteryRulesError);
  });

  it("rejects thresholds outside 0..100", () => {
    expect(() => assertValidRules({ ...RULES, passingScore: 101 })).toThrow(InvalidMasteryRulesError);
    expect(() => assertValidRules({ ...RULES, criticalCompetencyMinimum: -1 })).toThrow(
      InvalidMasteryRulesError
    );
  });
});

describe("toPercent", () => {
  it("converts a mark out of twenty", () => {
    expect(toPercent(20)).toBe(100);
    expect(toPercent(15)).toBe(75);
    expect(toPercent(0)).toBe(0);
  });

  it("clamps out-of-range marks", () => {
    expect(toPercent(25)).toBe(100);
    expect(toPercent(-3)).toBe(0);
  });

  it("supports another maximum", () => {
    expect(toPercent(5, 10)).toBe(50);
  });

  it("refuses a non-positive maximum", () => {
    expect(() => toPercent(5, 0)).toThrow(RangeError);
  });
});

describe("clampPercent", () => {
  it("bounds to 0..100 and maps NaN to zero", () => {
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe("computeLevelScore", () => {
  it("returns 100 when every component is perfect", () => {
    expect(computeLevelScore(ALL, RULES)).toBe(100);
  });

  it("returns 0 when nothing is done", () => {
    expect(computeLevelScore({ direct: 0, retention: 0, caseStudy: 0, explanation: 0 }, RULES)).toBe(0);
  });

  it("applies the documented weighting", () => {
    // 80*0.4 + 60*0.25 + 40*0.2 + 20*0.15 = 32 + 15 + 8 + 3
    expect(computeLevelScore({ direct: 80, retention: 60, caseStudy: 40, explanation: 20 }, RULES)).toBe(58);
  });

  it("rounds to two decimals", () => {
    // 33.333*0.4 + 0 + 0 + 0 = 13.3332
    expect(computeLevelScore({ direct: 33.333, retention: 0, caseStudy: 0, explanation: 0 }, RULES)).toBe(13.33);
  });

  it("clamps components before weighting", () => {
    expect(computeLevelScore({ direct: 500, retention: -50, caseStudy: 0, explanation: 0 }, RULES)).toBe(40);
  });

  it("treats a missing component as zero", () => {
    const partial = { direct: 100 } as Record<(typeof ACTIVITY_KINDS)[number], number>;

    expect(computeLevelScore(partial, RULES)).toBe(40);
  });

  it("refuses to score with invalid rules", () => {
    expect(() => computeLevelScore(ALL, { ...RULES, passingScore: 200 })).toThrow(InvalidMasteryRulesError);
  });
});

describe("passing threshold boundary", () => {
  // The comparison happens on the rounded score, so these are the exact cases
  // that decide whether a level is cleared.
  const cases: Array<[number, boolean]> = [
    [74.98, false],
    [74.99, false],
    [75, true],
    [75.01, true]
  ];

  for (const [score, expected] of cases) {
    it(`score ${score} clears: ${expected}`, () => {
      const snapshot = evaluateLevel(
        {
          levelId: "L1",
          // A single weighted component of 1.0 makes the score exactly the input.
          events: [event("direct", score, "2026-07-01T00:00:00.000Z"), event("finalDiagnostic", 100, "2026-07-01T00:00:00.000Z")],
          criticalCompetencies: [{ competencyId: "c1", strength: 100 }],
          previousLevelAcquired: true,
          alreadyAcquired: false
        },
        { ...RULES, weights: { direct: 1, retention: 0, caseStudy: 0, explanation: 0 } }
      );

      expect(snapshot.score).toBe(score);
      expect(snapshot.blockers.some((blocker) => blocker.code === "score-below-threshold")).toBe(!expected);
    });
  }

  it("rounds 74.995 up to the passing mark", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: [event("direct", 74.995, "2026-07-01T00:00:00.000Z"), event("finalDiagnostic", 100, "2026-07-01T00:00:00.000Z")],
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      { ...RULES, weights: { direct: 1, retention: 0, caseStudy: 0, explanation: 0 } }
    );

    expect(snapshot.score).toBe(75);
    expect(snapshot.status).toBe("passed");
  });
});

describe("reduceEventsToComponents", () => {
  it("keeps the latest score for a kind, not the best", () => {
    // Mastery describes current ability; a newer result supersedes an older one.
    const { components } = reduceEventsToComponents([
      event("direct", 95, "2026-07-01T00:00:00.000Z"),
      event("direct", 40, "2026-07-08T00:00:00.000Z")
    ]);

    expect(components.direct).toBe(40);
  });

  it("is order-independent for distinct timestamps", () => {
    const ascending = reduceEventsToComponents([
      event("direct", 95, "2026-07-01T00:00:00.000Z"),
      event("direct", 40, "2026-07-08T00:00:00.000Z")
    ]);
    const descending = reduceEventsToComponents([
      event("direct", 40, "2026-07-08T00:00:00.000Z"),
      event("direct", 95, "2026-07-01T00:00:00.000Z")
    ]);

    expect(ascending.components).toEqual(descending.components);
  });

  it("breaks timestamp ties by input order, so the reduction stays total", () => {
    const { components } = reduceEventsToComponents([
      event("direct", 10, "2026-07-01T00:00:00.000Z"),
      event("direct", 90, "2026-07-01T00:00:00.000Z")
    ]);

    expect(components.direct).toBe(90);
  });

  it("reports kinds with no event rather than letting them look like failures", () => {
    const { components, missingKinds } = reduceEventsToComponents([
      event("direct", 100, "2026-07-01T00:00:00.000Z")
    ]);

    expect(components.retention).toBe(0);
    expect(missingKinds).toEqual(["retention", "caseStudy", "explanation"]);
  });

  it("detects the final diagnostic without weighting it", () => {
    const withDiagnostic = reduceEventsToComponents([event("finalDiagnostic", 100, "2026-07-01T00:00:00.000Z")]);

    expect(withDiagnostic.finalDiagnosticCompleted).toBe(true);
    expect(withDiagnostic.missingKinds).toEqual([...ACTIVITY_KINDS]);
  });

  it("clamps a stored score outside range", () => {
    const { components } = reduceEventsToComponents([event("direct", 140, "2026-07-01T00:00:00.000Z")]);

    expect(components.direct).toBe(100);
  });
});

describe("evaluateLevel", () => {
  it("acquires a level when every rule is satisfied", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents(),
        criticalCompetencies: [{ competencyId: "c1", strength: 70 }],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.status).toBe("passed");
    expect(snapshot.blockers).toEqual([]);
    // 90*0.4 + 80*0.25 + 80*0.2 + 80*0.15 = 36 + 20 + 16 + 12
    expect(snapshot.score).toBe(84);
  });

  it("ignores events belonging to another level", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents("L2"),
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.score).toBe(0);
    expect(snapshot.status).toBe("available");
  });

  it("is available before any activity and in-progress after some", () => {
    const base = {
      levelId: "L1",
      criticalCompetencies: [],
      previousLevelAcquired: true,
      alreadyAcquired: false
    };

    expect(evaluateLevel({ ...base, events: [] }, RULES).status).toBe("available");
    expect(
      evaluateLevel({ ...base, events: [event("direct", 30, "2026-07-01T00:00:00.000Z")] }, RULES).status
    ).toBe("in_progress");
  });

  it("locks a level whose predecessor is not acquired", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L2",
        events: passingEvents("L2"),
        criticalCompetencies: [],
        previousLevelAcquired: false,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.status).toBe("locked");
    expect(snapshot.blockers.map((blocker) => blocker.code)).toContain("previous-level-not-acquired");
  });

  it("blocks on a weak critical competency even with a passing global score", () => {
    // The whole point of critical competencies: no compensation.
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents(),
        criticalCompetencies: [
          { competencyId: "strong", strength: 95 },
          { competencyId: "weak", strength: 59 }
        ],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.score).toBeGreaterThanOrEqual(RULES.passingScore);
    expect(snapshot.status).toBe("in_progress");
    const blocker = snapshot.blockers.find((item) => item.code === "critical-competency-too-weak");
    expect(blocker?.detail).toContain("weak");
  });

  it("accepts a critical competency exactly at the minimum", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents(),
        criticalCompetencies: [{ competencyId: "c1", strength: 60 }],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.blockers).toEqual([]);
  });

  it("blocks when the final diagnostic is required and missing", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents().filter((item) => item.kind !== "finalDiagnostic"),
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.blockers.map((blocker) => blocker.code)).toEqual(["final-diagnostic-missing"]);
    expect(snapshot.status).toBe("in_progress");
  });

  it("does not require the diagnostic when the rules say so", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents().filter((item) => item.kind !== "finalDiagnostic"),
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      { ...RULES, requireFinalDiagnostic: false }
    );

    expect(snapshot.status).toBe("passed");
  });

  it("stays acquired once recorded, even if scores later drop", () => {
    // Acquisition is monotonic: a bad revision must not re-lock a cleared level.
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: [event("direct", 5, "2026-07-10T00:00:00.000Z")],
        criticalCompetencies: [{ competencyId: "c1", strength: 10 }],
        previousLevelAcquired: true,
        alreadyAcquired: true
      },
      RULES
    );

    expect(snapshot.status).toBe("passed");
    expect(snapshot.score).toBe(2);
    // The blockers still describe the current state honestly.
    expect(snapshot.blockers.length).toBeGreaterThan(0);
  });

  it("reports every failing rule at once", () => {
    const snapshot = evaluateLevel(
      {
        levelId: "L1",
        events: [],
        criticalCompetencies: [{ competencyId: "c1", strength: 10 }],
        previousLevelAcquired: false,
        alreadyAcquired: false
      },
      RULES
    );

    expect(snapshot.blockers.map((blocker) => blocker.code).sort()).toEqual([
      "critical-competency-too-weak",
      "final-diagnostic-missing",
      "previous-level-not-acquired",
      "score-below-threshold"
    ]);
  });

  it("is idempotent: the same inputs always produce the same snapshot", () => {
    const input = {
      levelId: "L1",
      events: passingEvents(),
      criticalCompetencies: [{ competencyId: "c1", strength: 70 }],
      previousLevelAcquired: true,
      alreadyAcquired: false
    };

    expect(evaluateLevel(input, RULES)).toEqual(evaluateLevel(input, RULES));
  });
});

describe("shouldRecordUnlock", () => {
  it("records only an unblocked level that is not yet acquired", () => {
    const clear = evaluateLevel(
      {
        levelId: "L1",
        events: passingEvents(),
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(shouldRecordUnlock(clear, false)).toBe(true);
    expect(shouldRecordUnlock(clear, true)).toBe(false);
  });

  it("does not record a blocked level", () => {
    const blocked = evaluateLevel(
      {
        levelId: "L1",
        events: [],
        criticalCompetencies: [],
        previousLevelAcquired: true,
        alreadyAcquired: false
      },
      RULES
    );

    expect(shouldRecordUnlock(blocked, false)).toBe(false);
  });
});

describe("evaluateTrack", () => {
  const levels = [
    { levelId: "L1", criticalCompetencies: [{ competencyId: "c1", strength: 80 }] },
    { levelId: "L2", criticalCompetencies: [{ competencyId: "c2", strength: 80 }] },
    { levelId: "L3", criticalCompetencies: [{ competencyId: "c3", strength: 80 }] }
  ];

  it("leaves the first level available and the rest locked with no activity", () => {
    const snapshots = evaluateTrack(levels, { events: [], acquiredLevelIds: [] }, RULES);

    expect(snapshots.map((snapshot) => snapshot.status)).toEqual(["available", "locked", "locked"]);
  });

  it("cascades availability as levels are cleared", () => {
    const snapshots = evaluateTrack(levels, { events: passingEvents("L1"), acquiredLevelIds: [] }, RULES);

    expect(snapshots.map((snapshot) => snapshot.status)).toEqual(["passed", "available", "locked"]);
  });

  it("keeps later levels locked when an intermediate one regresses but was acquired", () => {
    const snapshots = evaluateTrack(levels, { events: [], acquiredLevelIds: ["L1", "L2"] }, RULES);

    expect(snapshots.map((snapshot) => snapshot.status)).toEqual(["passed", "passed", "available"]);
  });

  it("does not let a later level be cleared while an earlier one is not", () => {
    const snapshots = evaluateTrack(levels, { events: passingEvents("L2"), acquiredLevelIds: [] }, RULES);

    expect(snapshots[0].status).toBe("available");
    expect(snapshots[1].status).toBe("locked");
  });

  it("is idempotent across repeated evaluation", () => {
    const input = { events: passingEvents("L1"), acquiredLevelIds: ["L1"] };

    expect(evaluateTrack(levels, input, RULES)).toEqual(evaluateTrack(levels, input, RULES));
  });
});

describe("labels", () => {
  it("names every status in French", () => {
    expect(getLevelStatusLabel("locked")).toBe("verrouillé");
    expect(getLevelStatusLabel("available")).toBe("disponible");
    expect(getLevelStatusLabel("in_progress")).toBe("en cours");
    expect(getLevelStatusLabel("passed")).toBe("acquis");
    expect(getLevelStatusLabel("planned")).toBe("planifié");
  });

  it("maps a score onto the competency vocabulary", () => {
    expect(competencyStatusFromScore(90, RULES)).toBe("mastered");
    expect(competencyStatusFromScore(65, RULES)).toBe("in-progress");
    expect(competencyStatusFromScore(20, RULES)).toBe("fragile");
    expect(competencyStatusFromScore(0, RULES)).toBe("not-started");
  });
});
