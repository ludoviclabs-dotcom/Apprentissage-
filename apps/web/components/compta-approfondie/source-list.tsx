import type { PublicSourceReference } from "@finance/content-publication";

/**
 * Rendu d'une référence de source, partout dans le chapitre.
 *
 * CE QUI EST AFFICHÉ EST TOUT CE QUI EXISTE. L'instantané publié ne porte ni
 * chemin, ni nom de fichier, ni URL : les extraits sont retirés à la
 * construction du snapshot et le document d'origine n'est servi par aucune
 * route. Il n'y a donc rien à masquer ici — ce composant ne peut pas divulguer
 * ce qu'il n'a pas reçu, et c'est la seule forme de garantie qui tienne.
 */

const SOURCE_TYPE_LABELS: Record<PublicSourceReference["sourceType"], string> = {
  course: "Support de cours",
  "official-reference": "Référence officielle",
  "personal-note": "Note personnelle",
  exercise: "Énoncé ou corrigé"
};

export function pageRangeLabel(reference: PublicSourceReference): string {
  return reference.pageStart === reference.pageEnd
    ? `page ${reference.pageStart}`
    : `pages ${reference.pageStart} à ${reference.pageEnd}`;
}

/** Citation courte, en ligne, sous une règle ou une formule. */
export function SourceCitation({ sources }: { sources: readonly PublicSourceReference[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <p className="source-citation">
      <span className="sr-only">Sources : </span>
      {sources.map((source, index) => (
        <span key={`${source.documentId}-${source.pageStart}-${index}`}>
          {index > 0 ? " · " : ""}
          <cite>{source.documentTitle}</cite>
          {source.sectionTitle ? `, ${source.sectionTitle}` : ""}, {pageRangeLabel(source)}
        </span>
      ))}
    </p>
  );
}

/** Fiche détaillée d'une source, pour le panneau « Sources ». */
export function SourceCard({
  reference,
  citedBy
}: {
  reference: PublicSourceReference;
  citedBy?: ReadonlyArray<{ title: string; artifactType: string }>;
}) {
  return (
    <article className="source-card">
      <h3>{reference.documentTitle}</h3>
      <dl className="source-meta">
        <div>
          <dt>Nature</dt>
          <dd>{SOURCE_TYPE_LABELS[reference.sourceType]}</dd>
        </div>
        {reference.sectionTitle ? (
          <div>
            <dt>Section</dt>
            <dd>{reference.sectionTitle}</dd>
          </div>
        ) : null}
        <div>
          <dt>Pages</dt>
          <dd>{pageRangeLabel(reference)}</dd>
        </div>
        {reference.effectiveDate ? (
          <div>
            <dt>Date d&apos;effet</dt>
            <dd>{reference.effectiveDate}</dd>
          </div>
        ) : null}
      </dl>

      {citedBy && citedBy.length > 0 ? (
        <p className="muted">
          Cité par&nbsp;: {citedBy.map((entry) => entry.title).join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
