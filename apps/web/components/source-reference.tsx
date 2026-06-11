import type { SourceReference as SourceReferenceType } from "@finance/domain";

export function SourceReference({ sources }: { sources: SourceReferenceType[] }) {
  if (sources.length === 0) {
    return <p className="muted">Aucune source attachee : la reponse doit rester en mode note non sourcee.</p>;
  }

  return (
    <div className="source-list">
      {sources.map((source) => (
        <div
          key={`${source.pack}-${source.document}-${source.pageStart ?? "na"}-${source.effectiveDate ?? "nd"}`}
          className="source-row"
        >
          <span>{source.pack}</span>
          <strong>{source.document}</strong>
          <small>
            {source.sourceType} -{" "}
            {source.pageStart ? `p. ${source.pageStart}${source.pageEnd ? `-${source.pageEnd}` : ""}` : "page non renseignee"} -{" "}
            {source.effectiveDate ?? "date non renseignee"}
          </small>
        </div>
      ))}
    </div>
  );
}
