import "server-only";
import {
  comptaCaseStudies,
  competencies as allCompetencies,
  excelCaseStudies,
  type CertificateContent,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "@finance/domain";

/**
 * What an attestation will assert, assembled once and then frozen.
 *
 * Everything here is derived from stored state at issue time and never again.
 * The alternative — recomputing when the PDF is downloaded — would let a
 * document change under a holder who has done nothing: one more attempt moves
 * the average, a curriculum revision renames a competency, and the copy already
 * in a recruiter's inbox stops matching the one the server prints.
 */

/** Every authored case study, both tracks, reduced to what a certificate needs. */
const CASE_STUDIES: Array<{ trackId: string; levelId: string; title: string }> = [
  ...comptaCaseStudies.map((caseStudy) => ({
    trackId: caseStudy.trackId,
    levelId: caseStudy.levelId,
    title: caseStudy.title
  })),
  ...excelCaseStudies.map((caseStudy) => ({
    trackId: caseStudy.trackId,
    levelId: caseStudy.levelId,
    title: caseStudy.title
  }))
];

/**
 * The case studies the learner actually worked.
 *
 * There is no per-case result in the schema — a case study is submitted as its
 * level's exercises with `activityContext: "case_study"` — so the honest signal
 * is the case-study component of the level the case belongs to. A level with no
 * case-study evidence contributes nothing, which is why a learner who cleared
 * the track on drills alone gets a shorter list rather than a false one.
 *
 * This supports "travaillés", the wording the PDF uses. It would not support
 * "réussis", and the PDF does not claim it.
 */
export function caseStudiesWorked(trackId: string, snapshots: LevelSnapshot[]): string[] {
  const byLevel = new Map(snapshots.map((snapshot) => [snapshot.levelId, snapshot]));

  return CASE_STUDIES.filter(
    (caseStudy) =>
      caseStudy.trackId === trackId && (byLevel.get(caseStudy.levelId)?.components.caseStudy ?? 0) > 0
  ).map((caseStudy) => caseStudy.title);
}

/** Competency names declared by the track's levels, deduplicated, in order. */
export function trackCompetencyLabels(levels: ModuleLevelDefinition[]): string[] {
  const byId = new Map(allCompetencies.map((competency) => [competency.id, competency.name]));
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const level of levels) {
    for (const competencyId of level.competencyIds) {
      const name = byId.get(competencyId);

      if (name && !seen.has(name)) {
        seen.add(name);
        labels.push(name);
      }
    }
  }

  return labels;
}

export interface BuildCertificateContentInput {
  holderLabel: string;
  trackLabel: string;
  /** The curriculum that actually graded the learner, not the active one. */
  curriculumVersionId: string;
  trackId: string;
  levels: ModuleLevelDefinition[];
  snapshots: LevelSnapshot[];
  averageScore: number;
}

export function buildCertificateContent(
  input: BuildCertificateContentInput
): CertificateContent {
  const byLevel = new Map(input.snapshots.map((snapshot) => [snapshot.levelId, snapshot]));
  const acquired = input.levels.filter((level) => byLevel.get(level.id)?.status === "passed");

  return {
    holderLabel: input.holderLabel,
    trackLabel: input.trackLabel,
    curriculumVersionId: input.curriculumVersionId,
    levelCount: input.levels.length,
    averageScore: input.averageScore,
    competencies: trackCompetencyLabels(input.levels),
    caseStudies: caseStudiesWorked(input.trackId, input.snapshots),
    // Recorded rather than assumed: it decides whether the document says
    // "réussite" or "complétion", and issuance rules may loosen later.
    allLevelsAcquired: input.levels.length > 0 && acquired.length === input.levels.length
  };
}

/**
 * The name printed on the document.
 *
 * The account's display name, never the e-mail: an attestation is shown to
 * third parties, and "ludovic.labs+test@gmail.com" is both a poor name and a
 * disclosure. A learner with no display name is asked to set one rather than
 * handed a document addressed to their inbox.
 */
export function resolveHolderLabel(displayName: string | null | undefined): string | null {
  const trimmed = (displayName ?? "").trim();

  return trimmed === "" ? null : trimmed.slice(0, 120);
}
