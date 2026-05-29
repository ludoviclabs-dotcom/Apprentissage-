import { describe, expect, it } from "vitest";
import { createSourceAudit, createTutorResponse } from "../src";

const retrieval = [
  {
    content: "Une provision suppose une obligation actuelle, une sortie probable et une estimation fiable.",
    confidence: 0.86,
    source: {
      pack: "cours-master-2025",
      document: "Clôture comptable",
      sourceType: "course" as const,
      pageStart: 42,
      pageEnd: 44
    }
  }
];

describe("AI agent contracts", () => {
  it("creates a sourced tutor response", () => {
    const response = createTutorResponse({
      question: "Explique une provision.",
      mode: "reprise",
      retrieval
    });

    expect(response.sources).toHaveLength(1);
    expect(response.reasoningSteps).toContain("Retrouver les passages sources les plus proches.");
  });

  it("audits retrieval source mix", () => {
    expect(createSourceAudit(retrieval)).toMatchObject({
      sourceCount: 1,
      hasOfficialReference: false,
      averageConfidence: 0.86
    });
  });

  it("rejects uncited tutor answers", () => {
    expect(() =>
      createTutorResponse({
        question: "Explique sans source.",
        mode: "reprise",
        retrieval: []
      })
    ).toThrow("requires at least one source");
  });
});
