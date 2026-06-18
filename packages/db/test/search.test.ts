import { describe, expect, it } from "vitest";
import { searchKnowledge } from "../src/repository";

describe("seed knowledge search", () => {
  it("returns cited hits for a corpus term", async () => {
    const hits = await searchKnowledge("titres", 8);

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.content.length).toBeGreaterThan(0);
      expect(hit.source.pack).toBeTruthy();
      expect(hit.source.document).toBeTruthy();
      expect(hit.confidence).toBeGreaterThan(0);
      expect(hit.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it("is accent-insensitive", async () => {
    const withAccent = await searchKnowledge("écart", 8);
    const withoutAccent = await searchKnowledge("ecart", 8);

    expect(withAccent.length).toBeGreaterThan(0);
    expect(withoutAccent.length).toBe(withAccent.length);
  });

  it("ignores queries shorter than three characters", async () => {
    expect(await searchKnowledge("ab")).toEqual([]);
  });
});
