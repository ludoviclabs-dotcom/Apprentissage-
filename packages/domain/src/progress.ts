import type { Competency, CompetencyStatus, Correction, DomainId } from "./types";

export function getCompetencyStatusLabel(status: CompetencyStatus): string {
  const labels: Record<CompetencyStatus, string> = {
    "not-started": "non commencé",
    "in-progress": "en cours",
    fragile: "fragile",
    mastered: "maîtrisé"
  };

  return labels[status];
}

export function getDomainAverage(domainId: DomainId, competencies: Competency[]): number {
  const scoped = competencies.filter((competency) => competency.domainId === domainId);

  if (scoped.length === 0) {
    return 0;
  }

  const total = scoped.reduce((sum, competency) => sum + competency.strength, 0);
  return Math.round(total / scoped.length);
}

export function getOverallAverage(competencies: Competency[]): number {
  if (competencies.length === 0) {
    return 0;
  }

  const total = competencies.reduce((sum, competency) => sum + competency.strength, 0);
  return Math.round(total / competencies.length);
}

export function getWeakestCompetencies(competencies: Competency[], limit = 3): Competency[] {
  return [...competencies]
    .sort((left, right) => left.strength - right.strength)
    .slice(0, limit);
}

export function statusFromStrength(strength: number): CompetencyStatus {
  if (strength >= 80) {
    return "mastered";
  }

  if (strength >= 55) {
    return "in-progress";
  }

  if (strength >= 30) {
    return "fragile";
  }

  return "not-started";
}

export function applyCorrectionToCompetencies(
  competencies: Competency[],
  correction: Correction
): Competency[] {
  const delta = correction.score >= 14 ? 5 : correction.score >= 10 ? 2 : -4;

  return competencies.map((competency) => {
    const isImpacted = correction.errors.some((error) =>
      error.toLowerCase().includes(competency.name.slice(0, 12).toLowerCase())
    );

    if (!isImpacted && correction.score >= 10) {
      return competency;
    }

    const strength = Math.max(0, Math.min(100, competency.strength + delta));

    return {
      ...competency,
      strength,
      status: statusFromStrength(strength)
    };
  });
}
