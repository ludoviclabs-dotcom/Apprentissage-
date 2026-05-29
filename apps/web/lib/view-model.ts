import {
  attempts,
  competencies,
  corrections,
  dashboardPriorities,
  documents,
  domains,
  exercises,
  getDomainAverage,
  getWeakestCompetencies,
  learningPath,
  lessons,
  sourcePacks
} from "@finance/domain";

export function getDashboardModel() {
  const currentDay = learningPath.days.find((day) => day.status === "today") ?? learningPath.days[0];
  const currentLesson = lessons.find((lesson) => lesson.id === currentDay.lessonId) ?? lessons[0];
  const currentExercise =
    exercises.find((exercise) => exercise.id === currentDay.exerciseId) ?? exercises[0];
  const latestCorrection = corrections[0];

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
    attempts,
    sourcePacks,
    documents
  };
}

export function getLearningModel() {
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

export function getExerciseModel() {
  return {
    exercises,
    corrections,
    attempts,
    domains,
    competencies
  };
}

export function getSourceModel() {
  return {
    sourcePacks,
    documents,
    domains
  };
}
