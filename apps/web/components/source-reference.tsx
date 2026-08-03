import type { SourceReference as SourceReferenceType } from "@finance/domain";

/**
 * Panneau de sources repliable.
 *
 * `<details>/<summary>` natif : utilisable au clavier sans JavaScript, état
 * annoncé par les lecteurs d'écran, et le repli réduit la longueur des pages
 * sans faire disparaître la traçabilité — le résumé annonce toujours combien
 * de sources appuient la réponse.
 */
export function SourceReference({
  sources,
  defaultOpen = false
}: {
  sources: SourceReferenceType[];
  defaultOpen?: boolean;
}) {
  if (sources.length === 0) {
    return <p className="muted">Aucune source attachée : la réponse doit rester en mode note non sourcée.</p>;
  }

  return (
    <details className="source-panel" open={defaultOpen}>
      <summary>
        {sources.length} source{sources.length > 1 ? "s" : ""} citée{sources.length > 1 ? "s" : ""}
      </summary>
      <div className="source-panel-body source-list">
        {sources.map((source) => (
          <div
            key={`${source.pack}-${source.document}-${source.pageStart ?? "na"}-${source.effectiveDate ?? "nd"}`}
            className="source-row"
          >
            <span>{source.pack}</span>
            <strong>{source.document}</strong>
            <small>
              {source.sourceType} ·{" "}
              {source.pageStart
                ? `p. ${source.pageStart}${source.pageEnd ? `-${source.pageEnd}` : ""}`
                : "page non renseignée"}{" "}
              · {source.effectiveDate ?? "date non renseignée"}
            </small>
          </div>
        ))}
      </div>
    </details>
  );
}
