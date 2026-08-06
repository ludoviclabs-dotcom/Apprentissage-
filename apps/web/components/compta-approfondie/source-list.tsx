// Sous-chemin « public », pas la racine du paquet : celle-ci exporte aussi le
// magasin, qui importe `node:fs/promises`. Ce composant est rendu côté serveur
// *et* importé par des îlots clients (`sheet-tools.tsx`) ; passer par la racine
// tirait donc `node:fs` dans le bundle navigateur et faisait échouer le build.
import { SOURCE_TYPE_LABELS, type PublicSourceReference } from "@finance/content-publication/public";

/**
 * Rendu d'une référence de source, partout dans le chapitre.
 *
 * CE QUI EST AFFICHÉ EST TOUT CE QUI EXISTE. L'instantané publié ne porte ni
 * chemin, ni nom de fichier, ni URL : les extraits sont retirés à la
 * construction du snapshot et le document d'origine n'est servi par aucune
 * route. Il n'y a donc rien à masquer ici — ce composant ne peut pas divulguer
 * ce qu'il n'a pas reçu, et c'est la seule forme de garantie qui tienne.
 */

export function pageRangeLabel(reference: PublicSourceReference): string {
  return reference.pageStart === reference.pageEnd
    ? `page ${reference.pageStart}`
    : `pages ${reference.pageStart} à ${reference.pageEnd}`;
}

/**
 * Citation courte, en ligne, sous une règle ou une formule.
 *
 * ELLE NOMME LA NATURE DU MATÉRIAU, ET CE N'EST PAS DÉCORATIF. `AGENTS.md`
 * interdit de mélanger cours et référence officielle sans le dire ; une règle
 * qui s'appuie sur un support de cours et une autre qui s'appuie sur le PCG ne
 * se lisent pas de la même façon, et l'affichage doit permettre de les
 * distinguer là où elles se côtoient.
 *
 * Le pack est cité pour la même raison : `AGENTS.md` l'exige au même titre que
 * document, page et date.
 */
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
          <span className="source-kind">{SOURCE_TYPE_LABELS[source.sourceType]}</span>{" "}
          <cite>{source.documentTitle}</cite>
          {source.sectionTitle ? `, ${source.sectionTitle}` : ""}, {pageRangeLabel(source)}
          {source.effectiveDate ? `, en vigueur au ${source.effectiveDate}` : ""}
          <span className="muted"> (pack {source.pack})</span>
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
          <dt>Pack</dt>
          <dd>{reference.pack}</dd>
        </div>
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
