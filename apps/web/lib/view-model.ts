import {
  dashboardPriorities,
  domains,
  getDomainAverage,
  getWeakestCompetencies,
} from "@finance/domain";
import {
  getCompetencies,
  getBusinessCases,
  getConcepts,
  getCorrectionHistory,
  getDocuments,
  getErrorJournal,
  getExamSessions,
  getExercises,
  getFlashcards,
  getLearningPath,
  getLearningModules,
  getLessons,
  getProgressSnapshot,
  getRevisionSession,
  getSourcePacks
} from "@finance/db";

export async function getDashboardModel() {
  const [competencies, exercises, lessons, learningPath, correctionHistory, sourcePacks, documents] =
    await Promise.all([
      getCompetencies(),
      getExercises(),
      getLessons(),
      getLearningPath(),
      getCorrectionHistory(),
      getSourcePacks(),
      getDocuments()
    ]);
  const currentDay = learningPath.days.find((day) => day.status === "today") ?? learningPath.days[0];
  const currentLesson = lessons.find((lesson) => lesson.id === currentDay?.lessonId) ?? lessons[0];
  const currentExercise =
    exercises.find((exercise) => exercise.id === currentDay?.exerciseId) ?? exercises[0];
  const latestCorrection = correctionHistory.corrections[0];

  return {
    domains: domains.map((domain) => ({
      ...domain,
      average: getDomainAverage(domain.id, competencies),
      competencies: competencies.filter((competency) => competency.domainId === domain.id)
    })),
    overallAverage: Math.round(
      domains.reduce((sum, domain) => sum + getDomainAverage(domain.id, competencies), 0) / domains.length
    ),
    currentDay,
    currentLesson,
    currentExercise,
    latestCorrection,
    priorities: dashboardPriorities,
    weakestCompetencies: getWeakestCompetencies(competencies, 5),
    learningPath,
    attempts: correctionHistory.attempts,
    sourcePacks,
    documents
  };
}

export async function getLearningModel() {
  const [learningPath, lessons, exercises, competencies] = await Promise.all([
    getLearningPath(),
    getLessons(),
    getExercises(),
    getCompetencies()
  ]);
  const currentDay = learningPath.days.find((day) => day.status === "today") ?? learningPath.days[0];

  return {
    learningPath,
    currentDay,
    lessons,
    exercises,
    competencies,
    domains
  };
}

export async function getExerciseModel() {
  const [exercises, correctionHistory, competencies] = await Promise.all([
    getExercises(),
    getCorrectionHistory(),
    getCompetencies()
  ]);

  return {
    exercises,
    corrections: correctionHistory.corrections,
    attempts: correctionHistory.attempts,
    domains,
    competencies
  };
}

export async function getSourceModel() {
  const [sourcePacks, documents] = await Promise.all([getSourcePacks(), getDocuments()]);

  return {
    sourcePacks,
    documents,
    domains
  };
}

export async function getPathModel() {
  const [learningPath, modules, competencies, lessons, exercises] = await Promise.all([
    getLearningPath(),
    getLearningModules(),
    getCompetencies(),
    getLessons(),
    getExercises()
  ]);

  return {
    learningPath,
    modules,
    competencies,
    lessons,
    exercises,
    domains
  };
}

export async function getKnowledgeModel() {
  const [modules, concepts, flashcards, lessons] = await Promise.all([
    getLearningModules(),
    getConcepts(),
    getFlashcards(),
    getLessons()
  ]);

  return {
    modules,
    concepts,
    flashcards,
    lessons,
    domains
  };
}

export async function getRevisionModel() {
  const [session, flashcards, errorJournal] = await Promise.all([
    getRevisionSession(),
    getFlashcards(),
    getErrorJournal()
  ]);

  return {
    session,
    flashcards,
    errorJournal
  };
}

export async function getExamModel() {
  const [examSessions, exercises, competencies] = await Promise.all([
    getExamSessions(),
    getExercises(),
    getCompetencies()
  ]);

  return {
    examSessions,
    exercises,
    competencies,
    domains
  };
}

export async function getProgressModel() {
  const snapshot = await getProgressSnapshot();

  return {
    ...snapshot,
    domains
  };
}

export async function getBusinessCaseModel() {
  const [businessCases, modules, competencies] = await Promise.all([
    getBusinessCases(),
    getLearningModules(),
    getCompetencies()
  ]);

  return {
    businessCases,
    modules,
    competencies,
    domains
  };
}
