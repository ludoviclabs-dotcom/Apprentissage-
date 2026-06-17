import type {
  BusinessCase,
  BusinessCaseAttempt,
  Correction,
  ErrorJournalEntry,
  ExamSession,
  Flashcard,
  FlashcardStatus,
  ReviewRating,
  RevisionReview,
  RevisionSession
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getRevisionIntervalDays(rating: ReviewRating): number {
  const intervals: Record<ReviewRating, number> = {
    forgotten: 1,
    partial: 3,
    correct: 7,
    mastered: 21
  };

  return intervals[rating];
}

export function getFlashcardStatusFromReview(rating: ReviewRating): FlashcardStatus {
  if (rating === "forgotten") {
    return "due";
  }

  if (rating === "partial") {
    return "learning";
  }

  if (rating === "mastered") {
    return "mastered";
  }

  return "learning";
}

export function reviewFlashcardSchedule(
  flashcardId: string,
  rating: ReviewRating,
  reviewedAt = new Date()
): RevisionReview {
  const intervalDays = getRevisionIntervalDays(rating);
  const nextDueAt = new Date(reviewedAt.getTime() + intervalDays * DAY_MS);

  return {
    flashcardId,
    rating,
    reviewedAt: reviewedAt.toISOString(),
    nextDueAt: nextDueAt.toISOString(),
    intervalDays,
    nextStatus: getFlashcardStatusFromReview(rating)
  };
}

export function buildRevisionSession(
  flashcards: Flashcard[],
  now = new Date(),
  limit = 12
): RevisionSession {
  const dueCards = flashcards
    .filter((card) => card.status !== "mastered" && new Date(card.dueAt).getTime() <= now.getTime())
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
  const newCards = flashcards.filter((card) => card.status === "new");
  const learningCards = flashcards.filter((card) => card.status === "learning");

  return {
    id: `revision-${now.toISOString().slice(0, 10)}`,
    generatedAt: now.toISOString(),
    dueCount: dueCards.length,
    newCount: newCards.length,
    fragileCount: learningCards.length,
    masteredCount: flashcards.filter((card) => card.status === "mastered").length,
    cards: [...dueCards, ...newCards, ...learningCards]
      .filter((card, index, list) => list.findIndex((item) => item.id === card.id) === index)
      .slice(0, limit)
  };
}

export function createErrorJournalEntries(
  correction: Correction,
  createdAt = new Date()
): ErrorJournalEntry[] {
  const base = {
    exerciseId: correction.exerciseId,
    correctionId: correction.id,
    competencyIds: correction.remediationPlan.competencyTags,
    nextAction: correction.remediationPlan.nextAction,
    createdAt: createdAt.toISOString()
  };

  return [
    ...correction.calculationErrors.map((summary, index) => ({
      ...base,
      id: `${correction.id}-calc-${index + 1}`,
      category: "calculation" as const,
      summary
    })),
    ...correction.accountingTreatmentErrors.map((summary, index) => ({
      ...base,
      id: `${correction.id}-treatment-${index + 1}`,
      category: "accounting-treatment" as const,
      summary
    })),
    ...correction.reasoningErrors.map((summary, index) => ({
      ...base,
      id: `${correction.id}-reasoning-${index + 1}`,
      category: "reasoning" as const,
      summary
    })),
    ...correction.sourceQualityIssues.map((summary, index) => ({
      ...base,
      id: `${correction.id}-source-${index + 1}`,
      category: "source-quality" as const,
      summary
    })),
    ...correction.missingElements.map((summary, index) => ({
      ...base,
      id: `${correction.id}-missing-${index + 1}`,
      category: "missing-element" as const,
      summary
    }))
  ];
}

export function startExamSession(template: ExamSession, startedAt = new Date()): ExamSession {
  return {
    ...template,
    id: `${template.id}-${startedAt.getTime()}`,
    status: "in-progress",
    startedAt: startedAt.toISOString()
  };
}

export function scoreBusinessCase(caseItem: BusinessCase, userMemo: string): BusinessCaseAttempt {
  const normalized = userMemo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const expectedTerms = caseItem.questions.flatMap((question) => question.expectedPoints);
  const matched = expectedTerms.filter((term) => normalized.includes(term.toLowerCase()));
  const score = Math.min(20, Math.round((matched.length / Math.max(1, expectedTerms.length)) * 20));

  return {
    id: `bc-attempt-${caseItem.id}-${Date.now()}`,
    businessCaseId: caseItem.id,
    userMemo,
    score,
    correction:
      score >= 14
        ? "Diagnostic exploitable : les signaux, preuves et actions sont relies."
        : "Diagnostic incomplet : relier chaque signal a une preuve et terminer par une action corrective.",
    createdAt: new Date().toISOString()
  };
}
