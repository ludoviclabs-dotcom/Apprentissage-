"use client";

import { useState } from "react";

interface SourceHit {
  content: string;
  confidence: number;
  source: {
    pack: string;
    document: string;
    sourceType: string;
    pageStart?: number;
    pageEnd?: number;
    effectiveDate?: string;
  };
}

interface SourceSearchResult {
  hits?: SourceHit[];
  error?: string;
  sourcePolicy?: string;
}

export function SourceSearchForm() {
  const [query, setQuery] = useState("provision litige");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<SourceSearchResult | null>(null);

  async function searchSources() {
    setIsPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/ai/librarian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 5 })
      });
      const payload = (await response.json()) as SourceSearchResult;
      setResult(payload);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Bibliothecaire</span>
        <h2>Retrouver les sources avant de raisonner</h2>
        <p>Recherche deterministe dans les chunks importes. Si la DB n'est pas active, le resultat reste vide.</p>
      </div>
      <label>
        Recherche
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" className="secondary-action" onClick={searchSources} disabled={isPending || query.length < 3}>
        {isPending ? "Recherche..." : "Chercher les sources"}
      </button>
      {result?.hits ? (
        <div className="source-list">
          {result.hits.length > 0 ? (
            result.hits.map((hit, index) => (
              <article key={`${hit.source.document}-${index}`} className="source-search-row">
                <strong>{hit.source.document}</strong>
                <span>{hit.source.pack} - {hit.source.sourceType} - p.{hit.source.pageStart ?? "?"}</span>
                <p>{hit.content.slice(0, 260)}</p>
              </article>
            ))
          ) : (
            <div className="result-box">
              <strong>Aucune source indexee</strong>
              <span>Importe un source-pack Markdown avec la DB active pour obtenir des resultats.</span>
            </div>
          )}
        </div>
      ) : null}
      {result?.error ? (
        <div className="result-box error">
          <strong>{result.error}</strong>
        </div>
      ) : null}
    </section>
  );
}
