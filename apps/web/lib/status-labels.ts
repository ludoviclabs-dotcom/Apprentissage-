import type {
  BusinessCaseStatus,
  CompetencyStatus,
  ExamSessionStatus,
  LearningDayStatus,
  SourcePackStatus
} from "@finance/domain";

/**
 * Libellés français des statuts pédagogiques et documentaires.
 *
 * Les statuts sont stockés en anglais dans le modèle (contrat de données) mais
 * ne doivent jamais atteindre l'écran tels quels. Chaque map est typée sur
 * l'union du domaine : ajouter un statut au modèle casse la compilation ici
 * tant qu'il n'a pas de libellé.
 */

export const LEARNING_DAY_STATUS_LABELS: Record<LearningDayStatus, string> = {
  done: "Terminé",
  today: "Aujourd'hui",
  next: "À venir",
  locked: "Verrouillé"
};

export const COMPETENCY_STATUS_LABELS: Record<CompetencyStatus, string> = {
  "not-started": "Non commencé",
  "in-progress": "En cours",
  fragile: "À consolider",
  mastered: "Maîtrisé"
};

export const SOURCE_PACK_STATUS_LABELS: Record<SourcePackStatus, string> = {
  ready: "Prêt",
  processing: "En traitement",
  "needs-review": "À vérifier"
};

export const EXAM_SESSION_STATUS_LABELS: Record<ExamSessionStatus, string> = {
  draft: "Brouillon",
  "in-progress": "En cours",
  submitted: "Rendue"
};

export const BUSINESS_CASE_STATUS_LABELS: Record<BusinessCaseStatus, string> = {
  locked: "Verrouillé",
  available: "Disponible",
  completed: "Terminé"
};

export type LocalizableStatus =
  | LearningDayStatus
  | CompetencyStatus
  | SourcePackStatus
  | ExamSessionStatus
  | BusinessCaseStatus;

const ALL_STATUS_LABELS: Record<LocalizableStatus, string> = {
  ...SOURCE_PACK_STATUS_LABELS,
  ...EXAM_SESSION_STATUS_LABELS,
  ...BUSINESS_CASE_STATUS_LABELS,
  ...COMPETENCY_STATUS_LABELS,
  ...LEARNING_DAY_STATUS_LABELS
};

/** Libellé français d'un statut du modèle. */
export function statusLabel(status: LocalizableStatus): string {
  return ALL_STATUS_LABELS[status];
}
