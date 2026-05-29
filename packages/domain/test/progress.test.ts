import { describe, expect, it } from "vitest";
import {
  competencies,
  getDomainAverage,
  getOverallAverage,
  getWeakestCompetencies,
  statusFromStrength
} from "../src";

describe("progress helpers", () => {
  it("computes a rounded domain average", () => {
    expect(getDomainAverage("ifrs-ias", competencies)).toBe(30);
  });

  it("computes a rounded overall average", () => {
    expect(getOverallAverage(competencies)).toBe(48);
  });

  it("returns the weakest competencies first", () => {
    const weakest = getWeakestCompetencies(competencies, 2);

    expect(weakest.map((competency) => competency.id)).toEqual(["ifrs-18", "cdg-forecast"]);
  });

  it("maps strength to learning status", () => {
    expect(statusFromStrength(85)).toBe("mastered");
    expect(statusFromStrength(60)).toBe("in-progress");
    expect(statusFromStrength(40)).toBe("fragile");
    expect(statusFromStrength(20)).toBe("not-started");
  });
});
