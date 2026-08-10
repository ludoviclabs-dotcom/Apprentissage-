import type { Metadata } from "next";
import Link from "next/link";
import type { VisualAnnotation } from "@finance/content-generation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  currentImageHash,
  isStale,
  loadPlan,
  requireAnnotationAccess,
  sortForReview
} from "@/lib/source-annotations/service";

export const metadata: Metadata = {
  title: "Sources visuelles — Administration",
  description:
    "File de revue des annotations de sources visuelles : transcription, faits relevés, approbation ou rejet."
};

export const dynamic = "force-dynamic";

/**
 * File de revue des sources visuelles.
 *
 * Elle approuve UNE SOURCE, pas un contenu pédagogique : le relecteur atteste
 * que la transcription correspond à l'image, rien de plus. C'est ce qui permet
 * ensuite à un contenu de citer une donnée qui n'existe qu'en image.
 *
 * Les filtres sont des liens, comme dans la relecture de contenu : l'état vit
 * dans l'URL, donc il se partage et survit à un rechargement.
 */
const QUICK_FILTERS: ReadonlyArray<{ label: string; params: Record<string, string> }> = [
  { label: "Toutes", params: {} },
  { label: "Bloquantes", params: { priorite: "BLOCKING" } },
  { label: "Utiles", params: { priorite: "USEFUL" } },
  { label: "Optionnelles", params: { priorite: "OPTIONAL" } },
  { label: "À relire", params: { statut: "needs_human_review" } },
  { label: "Approuvées", params: { statut: "approved" } },
  { label: "Rejetées", params: { statut: "rejected" } },
  { label: "Confiance faible", params: { confiance: "low" } }
];

const STATUS_LABELS: Record<VisualAnnotation["reviewStatus"], string> = {
  draft: "Brouillon",
  needs_human_review: "À relire",
  approved: "Approuvée",
  rejected: "Rejetée"
};

function buildHref(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `/admin/source-annotations?${query}` : "/admin/source-annotations";
}

interface SearchParams {
  priorite?: string;
  statut?: string;
  confiance?: string;
}

export default async function SourceAnnotationsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAnnotationAccess();

  const plan = await loadPlan();
  const filters = await searchParams;

  if (!plan || plan.annotations.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          label="Administration"
          title="Sources visuelles"
          description="Aucune annotation n'a été produite sur cette installation."
        />
        <EmptyState
          title="Rien à relire"
          description="Le plan d'annotation visuelle est absent ou vide. Il est produit par la préparation de chapitre, hors de cet écran."
        />
      </div>
    );
  }

  const rendered = new Map<string, string | undefined>();

  for (const annotation of plan.annotations) {
    rendered.set(annotation.annotationId, await currentImageHash(annotation));
  }

  const all = sortForReview(plan.annotations);
  const visible = all.filter(
    (annotation) =>
      (!filters.priorite || annotation.priority === filters.priorite) &&
      (!filters.statut || annotation.reviewStatus === filters.statut) &&
      (!filters.confiance || annotation.confidence === filters.confiance)
  );

  const approved = all.filter((annotation) => annotation.reviewStatus === "approved").length;
  const remaining = all.filter((annotation) => annotation.reviewStatus === "needs_human_review").length;
  const stale = all.filter((annotation) => isStale(annotation, rendered.get(annotation.annotationId))).length;

  return (
    <div className="page-stack">
      <PageHeader
        label="Administration"
        title="Sources visuelles"
        description="Approuver une annotation atteste que la transcription correspond à l'image. Ce n'est pas une approbation de contenu pédagogique."
        aside={
          <div className="hero-score">
            <span>Signées</span>
            <strong>
              {approved} / {all.length}
            </strong>
          </div>
        }
      >
        <p className="muted">
          {remaining} annotation{remaining > 1 ? "s" : ""} en attente de décision
          {stale > 0 ? ` · ${stale} dont la source a changé` : null}
        </p>
        <nav className="filter-row" aria-label="Filtres">
          {QUICK_FILTERS.map((filter) => (
            <Link key={filter.label} href={buildHref(filter.params)} className="filter-chip">
              {filter.label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {visible.length === 0 ? (
        <EmptyState title="Aucune annotation pour ce filtre" description="Élargir la sélection." />
      ) : (
        <ul className="review-list">
          {visible.map((annotation) => {
            const outdated = isStale(annotation, rendered.get(annotation.annotationId));

            return (
              <li key={annotation.annotationId} className="review-item">
                <Link href={`/admin/source-annotations/${annotation.annotationId}`}>
                  <strong>
                    {annotation.annotationType} — page {annotation.pageNumber}
                  </strong>
                </Link>
                <p className="muted">{annotation.expectedInformation}</p>
                <p className="muted">
                  <span data-priority={annotation.priority}>{annotation.priority}</span>
                  {" · "}
                  confiance {annotation.confidence ?? "non évaluée"}
                  {" · "}
                  {STATUS_LABELS[annotation.reviewStatus]}
                  {annotation.reviewedBy ? ` par ${annotation.reviewedBy}` : null}
                </p>
                {outdated ? (
                  <p className="muted" role="status">
                    La source visuelle a changé — nouvelle revue requise.
                  </p>
                ) : null}
                {annotation.warnings.length > 0 ? (
                  <p className="muted">{annotation.warnings[0]}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
