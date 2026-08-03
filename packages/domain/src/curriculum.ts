import { assertValidRules, type MasteryRules } from "./mastery";
import { comptaGeneraleV1Levels } from "./compta-generale-v1";
import { excelLabLevels } from "./excel-lab";
import { competencies } from "./taxonomy";
import type { DomainId } from "./types";

/**
 * Versioned curriculum: the ordered levels of each track and the rules used to
 * clear them.
 *
 * A learner is enrolled against a *version*. Publishing new thresholds therefore
 * cannot re-grade somebody who already progressed — their enrolment keeps
 * pointing at the version they started under. That is the whole reason the rules
 * live here as data instead of as constants next to the scoring function.
 */

export interface ModuleLevelDefinition {
  id: string;
  /** Groups the ordered levels that gate each other. */
  trackId: string;
  moduleId: string;
  domainId: DomainId;
  /** 1-based position inside the track. Must be contiguous. */
  level: number;
  title: string;
  objective: string;
  competencyIds: string[];
  /**
   * Competencies that must each reach the minimum on their own. They exist so a
   * level cannot be cleared by compensating a weak essential with strong
   * optionals, so this list must be a subset of `competencyIds`.
   */
  criticalCompetencyIds: string[];
  estimatedMinutes: number;
}

export interface CurriculumVersion {
  id: string;
  label: string;
  /** ISO date. Informational — selection is by `id`, never by comparing dates. */
  effectiveFrom: string;
  rules: MasteryRules;
  levels: ModuleLevelDefinition[];
}

export class InvalidCurriculumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCurriculumError";
  }
}

const COMPTA_GENERALE_TRACK = "track-compta-generale";

export const curriculum2026Q3: CurriculumVersion = {
  id: "curriculum-2026-07",
  label: "Socle comptabilité générale — juillet 2026",
  effectiveFrom: "2026-07-01",
  rules: {
    version: "curriculum-2026-07",
    weights: {
      direct: 0.4,
      retention: 0.25,
      caseStudy: 0.2,
      explanation: 0.15
    },
    passingScore: 75,
    criticalCompetencyMinimum: 60,
    requireFinalDiagnostic: true
  },
  levels: [
    {
      id: "level-compta-generale-1",
      trackId: COMPTA_GENERALE_TRACK,
      moduleId: "module-compta-provisions",
      domainId: "compta-generale",
      level: 1,
      title: "Écritures courantes et séparation des exercices",
      objective: "Enregistrer une opération simple et rattacher la charge au bon exercice.",
      competencyIds: ["cg-cutoff"],
      criticalCompetencyIds: ["cg-cutoff"],
      estimatedMinutes: 120
    },
    {
      id: "level-compta-generale-2",
      trackId: COMPTA_GENERALE_TRACK,
      moduleId: "module-compta-provisions",
      domainId: "compta-generale",
      level: 2,
      title: "Provisions et rattachement",
      objective: "Distinguer provision, charge à payer et passif éventuel, et le justifier.",
      competencyIds: ["cg-cutoff", "cg-provisions"],
      criticalCompetencyIds: ["cg-provisions"],
      estimatedMinutes: 180
    },
    {
      id: "level-compta-generale-3",
      trackId: COMPTA_GENERALE_TRACK,
      moduleId: "module-compta-provisions",
      domainId: "compta-generale",
      level: 3,
      title: "Référentiel IAS 37",
      objective: "Confronter le traitement français au référentiel IFRS et citer la source.",
      competencyIds: ["cg-provisions", "ifrs-ias37"],
      criticalCompetencyIds: ["ifrs-ias37"],
      estimatedMinutes: 180
    },
    {
      id: "level-compta-generale-4",
      trackId: COMPTA_GENERALE_TRACK,
      moduleId: "module-compta-provisions",
      domainId: "compta-generale",
      level: 4,
      title: "Clôture justifiée",
      objective: "Mener une clôture simple et défendre chaque écriture par une pièce.",
      competencyIds: ["cg-cutoff", "cg-provisions", "ifrs-ias37", "fisc-retraitements"],
      criticalCompetencyIds: ["cg-cutoff", "cg-provisions", "ifrs-ias37"],
      estimatedMinutes: 240
    },
    // A second track in the same version. Enrolment is per (user, track), so
    // adding one leaves everybody progressing through the provisions track
    // exactly where they were.
    ...comptaGeneraleV1Levels,
    // Third track: the Excel Finance Lab (PR-06), on the same reasoning.
    ...excelLabLevels
  ]
};

export const curriculumVersions: CurriculumVersion[] = [curriculum2026Q3];

/** The version new enrolments are created against. */
export const activeCurriculum = curriculum2026Q3;

/**
 * Validation boundary for curriculum data. Called by the seed and by tests, so a
 * malformed track fails at import time rather than producing a track nobody can
 * finish — the class of bug PR-00 found in the business-case scorer.
 */
export function assertValidCurriculum(version: CurriculumVersion): void {
  assertValidRules(version.rules);

  if (version.rules.version !== version.id) {
    throw new InvalidCurriculumError(
      `Rules version "${version.rules.version}" does not match curriculum id "${version.id}".`
    );
  }

  if (version.levels.length === 0) {
    throw new InvalidCurriculumError(`Curriculum "${version.id}" has no levels.`);
  }

  const knownCompetencies = new Set(competencies.map((competency) => competency.id));
  const seenIds = new Set<string>();
  const byTrack = new Map<string, ModuleLevelDefinition[]>();

  for (const level of version.levels) {
    if (seenIds.has(level.id)) {
      throw new InvalidCurriculumError(`Duplicate level id "${level.id}".`);
    }

    seenIds.add(level.id);

    if (level.competencyIds.length === 0) {
      throw new InvalidCurriculumError(`Level "${level.id}" targets no competency.`);
    }

    for (const competencyId of level.competencyIds) {
      if (!knownCompetencies.has(competencyId)) {
        throw new InvalidCurriculumError(`Level "${level.id}" references unknown competency "${competencyId}".`);
      }
    }

    for (const competencyId of level.criticalCompetencyIds) {
      if (!level.competencyIds.includes(competencyId)) {
        throw new InvalidCurriculumError(
          `Level "${level.id}" marks "${competencyId}" critical but does not target it.`
        );
      }
    }

    const track = byTrack.get(level.trackId) ?? [];
    track.push(level);
    byTrack.set(level.trackId, track);
  }

  for (const [trackId, levels] of byTrack) {
    const positions = levels.map((level) => level.level).sort((left, right) => left - right);

    // Contiguous and 1-based: a gap would make a level permanently unreachable,
    // because availability is decided by the previous level being acquired.
    for (const [index, position] of positions.entries()) {
      if (position !== index + 1) {
        throw new InvalidCurriculumError(
          `Track "${trackId}" levels must be numbered 1..n without gaps, got ${positions.join(", ")}.`
        );
      }
    }
  }
}

export function getCurriculumVersion(id: string): CurriculumVersion | undefined {
  return curriculumVersions.find((version) => version.id === id);
}

/** Levels of a track in gating order. */
export function getTrackLevels(version: CurriculumVersion, trackId: string): ModuleLevelDefinition[] {
  return version.levels
    .filter((level) => level.trackId === trackId)
    .sort((left, right) => left.level - right.level);
}

export function getTrackIds(version: CurriculumVersion): string[] {
  return [...new Set(version.levels.map((level) => level.trackId))];
}
