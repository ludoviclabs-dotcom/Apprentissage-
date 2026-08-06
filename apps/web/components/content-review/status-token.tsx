import type { ContentDraftStatus, GenerationMode } from "@finance/content-generation";

/**
 * Étiquettes de statut et d'origine.
 *
 * Les valeurs brutes du modèle (`needs_review`, `mock`) ne doivent pas atteindre
 * l'écran : elles sont traduites ici, comme le fait `status-labels.ts` pour le
 * reste de l'application. L'origine est affichée sur chaque contenu, parce qu'un
 * relecteur doit savoir en permanence s'il lit une fixture technique ou une
 * génération réelle.
 */

const STATUS_LABELS: Record<ContentDraftStatus, string> = {
  draft: "Brouillon",
  validation_failed: "Contrôles en échec",
  needs_review: "À relire",
  approved: "Approuvé",
  rejected: "Rejeté"
};

const STATUS_CLASS: Record<ContentDraftStatus, string> = {
  draft: "processing",
  validation_failed: "needs-review",
  needs_review: "processing",
  approved: "ready",
  rejected: "needs-review"
};

export function StatusToken({ status }: { status: ContentDraftStatus }) {
  return <span className={`state-token ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function statusLabelFor(status: ContentDraftStatus): string {
  return STATUS_LABELS[status];
}

/**
 * L'origine, dite en toutes lettres.
 *
 * Trois origines, trois étiquettes distinctes : un relecteur qui approuve engage
 * sa signature, et « rédigé à partir des sources » n'est pas la même information
 * que « écrit par un modèle » ni que « fixture de démonstration ». Une étiquette
 * commune aux deux dernières laisserait croire qu'une fixture peut être relue
 * comme du cours.
 */
const MODE_BADGES: Record<GenerationMode, { label: string; tone: string; title: string }> = {
  mock: {
    label: "Fixture (mock)",
    tone: "needs-review",
    title: "Fixture technique, pas une génération réelle — impubliable"
  },
  live: {
    label: "Génération IA",
    tone: "ready",
    title: "Rédigé par un modèle à partir des sources du chapitre"
  },
  "manual-assisted": {
    label: "Rédaction assistée",
    tone: "processing",
    title:
      "Rédigé à partir des extraits validés, sans appel à un fournisseur — mêmes contrôles, même approbation humaine"
  }
};

export function ModeBadge({ mode }: { mode: GenerationMode }) {
  const badge = MODE_BADGES[mode];

  return (
    <span className={`state-token ${badge.tone}`} title={badge.title}>
      {badge.label}
    </span>
  );
}
