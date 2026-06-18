import { describe, expect, it } from "vitest";
import {
  type Competency,
  getDomainAverage,
  getOverallAverage,
  getWeakestCompetencies,
  statusFromStrength
} from "../src";

// Fixed fixture so these pure-function tests stay stable as the seed corpus grows.
const sample: Competency[] = [
  { id: "a", domainId: "compta-generale", name: "A", levelMin: 1, levelMax: 3, status: "in-progress", strength: 60, focus: "" },
  { id: "b", domainId: "compta-generale", name: "B", levelMin: 1, levelMax: 3, status: "fragile", strength: 40, focus: "" },
  { id: "c", domainId: "ifrs-ias", name: "C", levelMin: 1, levelMax: 3, status: "not-started", strength: 20, focus: "" },
  { id: "d", domainId: "ifrs-ias", name: "D", levelMin: 1, levelMax: 3, status: "not-started", strength: 16, focus: "" }
];

describe("progress helpers", () => {
  it("computes a rounded domain average", () => {
    expect(getDomainAverage("ifrs-ias", sample)).toBe(18);
  });

  it("computes a rounded overall average", () => {
    expect(getOverallAverage(sample)).toBe(34);
  });

  it("returns the weakest competencies first", () => {
    const weakest = getWeakestCompetencies(sample, 2);

    expect(weakest.map((competency) => competency.id)).toEqual(["d", "c"]);
  });

  it("maps strength to learning status", () => {
    expect(statusFromStrength(85)).toBe("mastered");
    expect(statusFromStrength(60)).toBe("in-progress");
    expect(statusFromStrength(40)).toBe("fragile");
    expect(statusFromStrength(20)).toBe("not-started");
  });
});
