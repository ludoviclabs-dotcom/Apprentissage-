import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentTypeLabels } from "@finance/content-generation";
import { resolvePublicChapter, resolveSlug } from "@finance/content-publication";
import { findDraft, loadCorpusIndex, requireReviewAccess, resolveExcerpts } from "@/lib/content-review/service";
import { findActive, loadHistory } from "@/lib/publication/store";
import { ContentPreview } from "@/components/content-review/content-preview";
import { DraftEditor } from "@/components/content-review/draft-editor";
import { PublicationActions } from "@/components/content-review/publication-actions";
import { ReviewActions } from "@/components/content-review/review-actions";
import { ModeBadge, StatusToken, statusLabelFor } from "@/components/content-review/status-token";

export const metadata: Metadata = {
  title: "Contenu en relecture — Administration",
  description: "Sources citées, contrôles déterministes, historique et décision de relecture."
};

export const dynamic = "force-dynamic";

export default async function ContentReviewDetailPage({
  params
}: {
  params: Promise<{ draftId: string }>;
}) {
  await requireReviewAccess();

  const { draftId } = await params;
  const entry = await findDraft(draftId);

  if (!entry) {
    notFound();
  }

  const { draft, location } = entry;
  const corpus = await loadCorpusIndex(location.packId);
  const excerpts = resolveExcerpts(draft, corpus);
  const validation = draft.validationMetadata;
  // Même règle que la route d'approbation : contrôles passés ET aucune source
  // dégradée. Le bouton ne fait que refléter la décision du serveur.
  const citesDegradedPage = (validation?.warnings ?? []).some((issue) => issue.code === "page-degradee");
  const canApprove = validation?.passed === true && !citesDegradedPage;

  // L'identité logique du contenu côté public. `undefined` quand le chapitre
  // n'est pas au programme : la publication est alors impossible, et l'écran le
  // dit plutôt que d'offrir un bouton qui échouerait.
  const publicChapter = resolvePublicChapter(draft.chapterSlug);
  const publicationKey = publicChapter
    ? { artifactType: draft.contentType, chapter: publicChapter.slug, slug: resolveSlug(draft) }
    : null;
  const activeVersion = publicationKey ? ((await findActive(publicationKey)) ?? null) : null;
  const publicationHistory = publicationKey ? await loadHistory(publicationKey) : [];

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">
            <Link href="/admin/content-review">Relecture des contenus</Link>
          </span>
          <h1>{draft.title}</h1>
          <p>
            {contentTypeLabels[draft.contentType]} · {draft.chapterLabel} · difficulté {draft.difficulty}/5
          </p>
          <p className="review-badges">
            <StatusToken status={draft.status} />
            <ModeBadge mode={draft.generationMetadata.mode} />
            <span className="muted">
              {draft.generationMetadata.promptId}.{draft.generationMetadata.promptVersion} ·{" "}
              {draft.generationMetadata.model} · révision {draft.reviewMetadata.revision} ·{" "}
              qualité {validation?.qualityScore ?? "—"}/100
            </span>
          </p>
        </div>
      </section>

      <div className="review-layout">
        <aside className="review-sources panel">
          <h2 className="panel-heading">Sources citées</h2>

          {excerpts.length === 0 ? (
            <p className="muted">
              Le corpus extrait n&apos;est pas disponible sur cette instance : les extraits ne peuvent pas être
              affichés. Les références restent vérifiées lors de la validation.
            </p>
          ) : (
            excerpts.map((excerpt) => (
              <article key={`${excerpt.documentTitle}-${excerpt.pageStart}-${excerpt.pageEnd}`} className="review-source">
                <h3>{excerpt.documentTitle}</h3>
                <p className="muted">
                  {excerpt.pageStart === excerpt.pageEnd
                    ? `Page ${excerpt.pageStart}`
                    : `Pages ${excerpt.pageStart} à ${excerpt.pageEnd}`}
                  {excerpt.degraded ? " — extraction dégradée" : ""}
                </p>
                {excerpt.chunks.map((chunk) => (
                  <blockquote key={chunk.chunkId} className="review-excerpt">
                    {chunk.content}
                  </blockquote>
                ))}
              </article>
            ))
          )}

          <p className="muted">
            Le document source n&apos;est pas servi par l&apos;application : seul son texte extrait est affiché.
          </p>
        </aside>

        <div className="review-main">
          <section className="panel">
            <h2 className="panel-heading">Aperçu</h2>
            <ContentPreview draft={draft} />
          </section>

          <section className="panel">
            <h2 className="panel-heading">Contrôles déterministes</h2>

            {!validation ? (
              <p className="muted">Ce contenu n&apos;a pas encore été validé.</p>
            ) : (
              <>
                <p>
                  {validation.passed
                    ? "Tous les contrôles bloquants passent."
                    : `${validation.errors.length} erreur(s) bloquante(s).`}{" "}
                  <span className="muted">({validation.validationVersion})</span>
                </p>

                {validation.errors.length > 0 ? (
                  <>
                    <h3>Erreurs</h3>
                    <ul className="review-issues">
                      {validation.errors.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          <strong>{issue.code}</strong>
                          {issue.path ? <span className="muted"> ({issue.path})</span> : null} — {issue.message}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {citesDegradedPage ? (
                  <p>
                    Ce contenu cite une page dont l&apos;extraction est dégradée : il ne peut pas être approuvé
                    tant qu&apos;il s&apos;appuie dessus.
                  </p>
                ) : null}

                {validation.warnings.length > 0 ? (
                  <>
                    <h3>Avertissements</h3>
                    <ul className="review-issues">
                      {validation.warnings.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          <strong>{issue.code}</strong>
                          {issue.path ? <span className="muted"> ({issue.path})</span> : null} — {issue.message}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-heading">Édition</h2>
            <DraftEditor
              draftId={draft.id}
              initialContent={draft.content}
              disabled={draft.status === "approved"}
            />
          </section>

          <section className="panel">
            <h2 className="panel-heading">Décision</h2>
            <ReviewActions draftId={draft.id} status={draft.status} canApprove={canApprove} />
          </section>

          <section className="panel">
            <h2 className="panel-heading">Publication</h2>

            {publicChapter ? (
              <PublicationActions
                draftId={draft.id}
                status={draft.status}
                mode={draft.generationMetadata.mode}
                activeVersionId={activeVersion?.id ?? null}
                activePublicationVersion={activeVersion?.publicationVersion ?? null}
              />
            ) : (
              <p className="muted">
                Le chapitre «&nbsp;{draft.chapterLabel}&nbsp;» n&apos;appartient à aucun module public :
                ce contenu ne peut pas être publié tant que le chapitre n&apos;est pas inscrit à la
                taxonomie.
              </p>
            )}
          </section>

          {publicationHistory.length > 0 ? (
            <section className="panel">
              <h2 className="panel-heading">Historique des versions publiées</h2>
              <div className="table-scroll">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th scope="col">Version</th>
                      <th scope="col">État</th>
                      <th scope="col">Publiée le</th>
                      <th scope="col">Par</th>
                      <th scope="col">Empreinte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicationHistory.map((version) => (
                      <tr key={version.id}>
                        <td>{version.publicationVersion}</td>
                        <td>{version.status === "published" ? "Active" : "Archivée"}</td>
                        <td>{new Date(version.publishedAt).toLocaleString("fr-FR")}</td>
                        <td>{version.publishedBy}</td>
                        <td>
                          <code>{version.contentHash.slice(0, 12)}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                Aucune version n&apos;est supprimée : archiver retire du site public, jamais du dépôt.
              </p>
            </section>
          ) : null}

          <section className="panel">
            <h2 className="panel-heading">Historique</h2>
            <ol className="review-history">
              {draft.history.map((transition, index) => (
                <li key={`${transition.occurredAt}-${index}`}>
                  {transition.fromStatus
                    ? `${statusLabelFor(transition.fromStatus)} → ${statusLabelFor(transition.toStatus)}`
                    : `Création (${statusLabelFor(transition.toStatus)})`}
                  <span className="muted">
                    {" "}
                    · {new Date(transition.occurredAt).toLocaleString("fr-FR")} · {transition.actor}
                  </span>
                  {transition.comment ? <div className="muted">{transition.comment}</div> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
