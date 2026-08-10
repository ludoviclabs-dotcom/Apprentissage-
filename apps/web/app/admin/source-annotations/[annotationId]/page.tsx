import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { AnnotationActions } from "@/components/source-annotations/annotation-actions";
import { PageImage } from "@/components/source-annotations/page-image";
import {
  currentImageHash,
  findAnnotation,
  isStale,
  loadPlan,
  requireAnnotationAccess,
  sortForReview
} from "@/lib/source-annotations/service";

export const metadata: Metadata = {
  title: "Annotation visuelle — Administration"
};

export const dynamic = "force-dynamic";

/**
 * Revue d'une annotation : l'image à gauche, ce qu'on en a tiré à droite.
 *
 * L'image ne vient pas d'un chemin de fichier mais d'une route
 * d'administration qui la résout côté serveur. Rien dans cette page ne nomme
 * un répertoire, un PDF, ni une source privée.
 */
export default async function AnnotationDetailPage({
  params
}: {
  params: Promise<{ annotationId: string }>;
}) {
  await requireAnnotationAccess();

  const { annotationId } = await params;
  const annotation = await findAnnotation(annotationId);

  if (!annotation) {
    notFound();
  }

  const plan = await loadPlan();
  const queue = sortForReview(plan?.annotations ?? []);
  const position = queue.findIndex((entry) => entry.annotationId === annotationId);
  const previous = position > 0 ? queue[position - 1] : null;
  const next = position >= 0 && position < queue.length - 1 ? queue[position + 1] : null;
  const nextPending = queue
    .slice(position + 1)
    .find((entry) => entry.reviewStatus === "needs_human_review");

  const rendered = await currentImageHash(annotation);
  const outdated = isStale(annotation, rendered);
  const approved = queue.filter((entry) => entry.reviewStatus === "approved").length;

  return (
    <div className="page-stack">
      <PageHeader
        label="Sources visuelles"
        title={`${annotation.annotationType} — page ${annotation.pageNumber}`}
        description={annotation.expectedInformation}
        aside={
          <div className="hero-score">
            <span>Signées</span>
            <strong>
              {approved} / {queue.length}
            </strong>
          </div>
        }
      >
        <p className="muted">
          <Link href="/admin/source-annotations">← Toute la file</Link>
          {" · "}
          <span data-priority={annotation.priority}>{annotation.priority}</span>
          {" · "}
          confiance {annotation.confidence ?? "non évaluée"}
          {annotation.confidence === "low" ? " (faible)" : null}
        </p>
        <p className="muted">
          {previous ? (
            <Link href={`/admin/source-annotations/${previous.annotationId}`}>← Précédente</Link>
          ) : null}
          {next ? (
            <>
              {" "}
              <Link href={`/admin/source-annotations/${next.annotationId}`}>Suivante →</Link>
            </>
          ) : null}
          {nextPending ? (
            <>
              {" · "}
              <Link href={`/admin/source-annotations/${nextPending.annotationId}`}>
                Prochaine à relire
              </Link>
            </>
          ) : null}
        </p>
      </PageHeader>

      {annotation.confidence === "low" ? (
        <p className="muted" role="alert">
          Confiance faible sur cette transcription — la comparer à l&apos;image avec attention avant
          toute décision.
        </p>
      ) : null}

      {outdated ? (
        <p className="muted" role="alert">
          La source visuelle a changé — nouvelle revue requise. L&apos;approbation est refusée tant que
          la transcription n&apos;a pas été confrontée au rendu actuel.
        </p>
      ) : null}

      <div className="annotation-review">
        <section aria-label="Source visuelle">
          <PageImage annotationId={annotation.annotationId} pageNumber={annotation.pageNumber} />
          <p className="muted">
            Page {annotation.pageNumber} · région {annotation.regionId}
          </p>
        </section>

        <section aria-label="Annotation">
          <h2>Transcription</h2>
          <p>{annotation.transcription ?? "Aucune transcription proposée."}</p>

          <h2>Faits relevés ({annotation.structuredFacts.length})</h2>
          {annotation.structuredFacts.length === 0 ? (
            <p className="muted">Aucun fait structuré — rien n&apos;a été inventé.</p>
          ) : (
            <ul>
              {annotation.structuredFacts.map((fact) => (
                <li key={fact.factId}>
                  <strong>{fact.label}</strong> : {String(fact.value)}
                  {fact.unit ? ` ${fact.unit}` : null} — {fact.sourceRegion} (confiance {fact.confidence})
                </li>
              ))}
            </ul>
          )}

          {annotation.warnings.length > 0 ? (
            <>
              <h2>Avertissements</h2>
              <ul>
                {annotation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          ) : null}

          <h2>Provenance</h2>
          <p className="muted">
            Méthode : {annotation.transcriptionMethod ?? "non renseignée"} · empreinte du rendu{" "}
            {annotation.pageImageHash ? `${annotation.pageImageHash.slice(0, 16)}…` : "absente"} · statut{" "}
            {annotation.reviewStatus}
            {annotation.reviewedBy ? ` · signée par ${annotation.reviewedBy}` : null}
          </p>

          <AnnotationActions
            annotation={annotation}
            nextHref={nextPending ? `/admin/source-annotations/${nextPending.annotationId}` : null}
          />
        </section>
      </div>
    </div>
  );
}
