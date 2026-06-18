import { describe, expect, it } from "vitest";
import {
  comptaBusinessCase,
  comptaConcepts,
  comptaExamSessions,
  comptaExercises,
  comptaFlashcards,
  comptaLearningDays,
  comptaLessons,
  comptaModules,
  competencies,
  concepts,
  exercises,
  learningPath,
  lessons
} from "../src";

describe("compta V1 seed integrity", () => {
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const conceptIds = new Set(concepts.map((c) => c.id));
  const moduleIds = new Set(comptaModules.map((m) => m.id));
  const competencyIds = new Set(competencies.map((c) => c.id));
  const lessonIds = new Set(lessons.map((l) => l.id));

  it("ships the expected volume", () => {
    expect(comptaLessons.length).toBe(10);
    expect(comptaExercises.length).toBe(20);
    expect(comptaFlashcards.length).toBe(50);
    expect(comptaConcepts.length).toBe(10);
    expect(comptaModules.length).toBe(3);
  });

  it("links every lesson to an existing exercise", () => {
    for (const lesson of comptaLessons) {
      expect(exerciseIds.has(lesson.linkedExerciseId)).toBe(true);
    }
  });

  it("links every flashcard to an existing concept and module", () => {
    for (const card of comptaFlashcards) {
      expect(conceptIds.has(card.conceptId)).toBe(true);
      expect(moduleIds.has(card.moduleId)).toBe(true);
    }
  });

  it("references only existing competencies", () => {
    const referenced = [
      ...comptaConcepts.flatMap((c) => c.competencyIds),
      ...comptaExercises.flatMap((e) => e.competencyIds),
      ...comptaFlashcards.flatMap((f) => f.competencyIds),
      ...comptaModules.flatMap((m) => m.competencyIds)
    ];
    for (const id of referenced) {
      expect(competencyIds.has(id)).toBe(true);
    }
  });

  it("scores every exercise rubric to exactly 20", () => {
    for (const exercise of comptaExercises) {
      const total = exercise.rubric.reduce((sum, item) => sum + item.points, 0);
      expect(total).toBe(20);
    }
  });

  it("cites at least one source for every lesson, concept and flashcard", () => {
    for (const lesson of comptaLessons) expect(lesson.sourceReferences.length).toBeGreaterThan(0);
    for (const concept of comptaConcepts) expect(concept.sourceReferences.length).toBeGreaterThan(0);
    for (const card of comptaFlashcards) expect(card.sourceReferences.length).toBeGreaterThan(0);
  });

  it("drives a learning path that points at real lessons and exercises", () => {
    for (const day of learningPath.days) {
      expect(lessonIds.has(day.lessonId)).toBe(true);
      expect(exerciseIds.has(day.exerciseId)).toBe(true);
    }
    expect(learningPath.days.length).toBe(comptaLearningDays.length);
  });

  it("uses unique ids across the new seed", () => {
    const ids = [
      ...comptaLessons.map((l) => l.id),
      ...comptaExercises.map((e) => e.id),
      ...comptaFlashcards.map((f) => f.id),
      ...comptaConcepts.map((c) => c.id)
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds annales that reference existing exercises", () => {
    expect(comptaExamSessions.length).toBeGreaterThan(0);
    for (const exam of comptaExamSessions) {
      expect(exam.exerciseIds.length).toBeGreaterThan(0);
      for (const id of exam.exerciseIds) {
        expect(exerciseIds.has(id)).toBe(true);
      }
    }
  });

  it("ships a business case that cites sources and references existing competencies", () => {
    expect(comptaBusinessCase.sourceReferences.length).toBeGreaterThan(0);
    for (const id of comptaBusinessCase.competencyIds) {
      expect(competencyIds.has(id)).toBe(true);
    }
    for (const question of comptaBusinessCase.questions) {
      for (const id of question.competencyIds) {
        expect(competencyIds.has(id)).toBe(true);
      }
    }
  });
});
