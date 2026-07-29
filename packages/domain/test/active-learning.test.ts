import { describe, expect, it } from "vitest";
import {
  buildRevisionSession,
  businessCases,
  createErrorJournalEntries,
  flashcards,
  getRevisionIntervalDays,
  normalizeForMatching,
  reviewFlashcardSchedule,
  scoreBusinessCase
} from "../src";

describe("active learning helpers", () => {
  it("maps review ratings to deterministic SRS intervals", () => {
    expect(getRevisionIntervalDays("forgotten")).toBe(1);
    expect(getRevisionIntervalDays("partial")).toBe(3);
    expect(getRevisionIntervalDays("correct")).toBe(7);
    expect(getRevisionIntervalDays("mastered")).toBe(21);
  });

  it("schedules the next flashcard review", () => {
    const reviewedAt = new Date("2026-06-17T08:00:00.000Z");
    const review = reviewFlashcardSchedule("fc-test", "correct", reviewedAt);

    expect(review.nextDueAt).toBe("2026-06-24T08:00:00.000Z");
    expect(review.intervalDays).toBe(7);
    expect(review.nextStatus).toBe("learning");
  });

  it("builds a due revision session without mastered cards", () => {
    const session = buildRevisionSession(flashcards, new Date("2026-06-17T09:00:00.000Z"), 20);

    expect(session.cards.length).toBeGreaterThan(0);
    expect(session.cards.every((card) => card.status !== "mastered")).toBe(true);
    expect(session.dueCount).toBeGreaterThan(0);
  });

  it("creates error journal entries from correction categories", () => {
    const entries = createErrorJournalEntries({
      id: "corr-test",
      exerciseId: "ex-test",
      score: 8,
      summary: "",
      rubricScores: [],
      correct: [],
      partialPoints: [],
      errors: [],
      calculationErrors: ["Mauvais montant."],
      accountingTreatmentErrors: ["Provision automatique."],
      reasoningErrors: ["Conclusion sans preuve."],
      sourceQualityIssues: ["Source absente."],
      missingElements: ["Annexe."],
      remediation: "",
      remediationPlan: {
        microLesson: "",
        nextAction: "Refaire.",
        competencyTags: ["cg-provisions"],
        expectedAnswer: ""
      },
      sourceReferences: []
    });

    expect(entries.map((entry) => entry.category)).toEqual([
      "calculation",
      "accounting-treatment",
      "reasoning",
      "source-quality",
      "missing-element"
    ]);
  });
});

describe("scoreBusinessCase", () => {
  it("normalizes accents on both sides of the comparison", () => {
    expect(normalizeForMatching("Produits à recevoir")).toBe("produits a recevoir");
  });

  it("credits an accented expected point written without accents", () => {
    const caseItem = {
      id: "bc-accents",
      domainId: "compta-generale",
      title: "Cas accents",
      description: "",
      dossier: "",
      status: "available",
      documents: [],
      questions: [
        {
          id: "q1",
          prompt: "",
          expectedPoints: ["produits à recevoir", "rattachement à la période"]
        }
      ],
      expectedDeliverable: "",
      sourceReferences: []
    } as unknown as (typeof businessCases)[number];

    const attempt = scoreBusinessCase(caseItem, "J'ai retenu produits a recevoir et rattachement a la periode.");

    expect(attempt.score).toBe(20);
  });

  it("lets every seeded business case reach a full score", () => {
    for (const caseItem of businessCases) {
      const expectedTerms = caseItem.questions.flatMap((question) => question.expectedPoints);
      const perfectMemo = expectedTerms.join(" ; ");

      expect(scoreBusinessCase(caseItem, perfectMemo).score, `${caseItem.id} is unscorable`).toBe(20);
    }
  });
});
