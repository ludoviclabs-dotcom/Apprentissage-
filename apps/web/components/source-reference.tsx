import type { SourceReference as SourceReferenceType } from "@finance/domain";

export function SourceReference({ sources }: { sources: SourceReferenceType[] }) {
  if (sources.length === 0) {
    return <p className="muted">Aucune source attachée.</p>;
  }

  return (
    <div className="source-list">
      {sources.map((source) => (
        <div key={`${source.pack}-${source.document}-${source.pageStart ?? "na"}`} className="source-row">
          <span>{source.pack}</span>
          <strong>{source.document}</strong>
          <small>
            {source.pageStart ? `p. ${source.pageStart}${source.pageEnd ? `-${source.pageEnd}` : ""}` : "pack"}
            {source.effectiveDate ? ` · ${source.effectiveDate}` : ""}
          </small>
        </div>
      ))}
    </div>
  );
}
