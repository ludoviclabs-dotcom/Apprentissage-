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

export function ModeBadge({ mode }: { mode: GenerationMode }) {
  return mode === "mock" ? (
    <span className="state-token needs-review" title="Fixture technique, pas une génération réelle">
      Fixture (mock)
    </span>
  ) : (
    <span className="state-token ready">Génération IA</span>
  );
}
