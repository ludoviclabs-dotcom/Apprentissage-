import { describe, expect, it, vi } from "vitest";

vi.mock("../src/client", () => ({
  canUseDatabase: () => true,
  createDb: () => {
    throw new Error("database unavailable");
  }
}));

describe("configured database mode", () => {
  it("does not return seeded catalogue data when the configured database is unavailable", async () => {
    const { getDocuments, getExercises, getLearningModules, getSourcePacks } = await import("../src/repository");

    // `canUseDatabase()` is true: a failed query must surface as unavailable,
    // never be reinterpreted as permission to serve the seeded demo catalogue.
    await expect(getSourcePacks()).rejects.toThrow("database unavailable");
    await expect(getDocuments()).rejects.toThrow("database unavailable");
    await expect(getExercises()).rejects.toThrow("database unavailable");
    await expect(getLearningModules()).rejects.toThrow("database unavailable");
  });
});
