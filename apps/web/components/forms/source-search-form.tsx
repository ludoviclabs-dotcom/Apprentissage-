"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";

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
  sourcePolicy?: string;
}

export function SourceSearchForm() {
  const [query, setQuery] = useState("provision litige");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<SourceSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function searchSources() {
    setIsPending(true);
    setResult(null);
    setError(null);

    const outcome = await postJson<SourceSearchResult>("/api/ai/librarian", { query, limit: 5 });

    setIsPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    setResult(outcome.data);
  }

  return (
    <section className="panel action-form librarian-panel">
      <div>
        <span className="section-label">Bibliothecaire</span>
        <h2>Retrouver les sources avant de raisonner</h2>
        <p>
          Recherche deterministe dans le corpus. Sans base active, la recherche porte sur le corpus
          seedé du repo ; avec la base active, elle porte sur les chunks importés.
        </p>
      </div>
      {/* Le champ et son action tiennent la même ligne : la recherche est un
          geste, pas un formulaire à parcourir. */}
      <div className="librarian-query">
        <label>
          Recherche
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="secondary-action" onClick={searchSources} disabled={isPending || query.length < 3}>
          {isPending ? "Recherche..." : "Chercher les sources"}
        </button>
      </div>
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
      {error ? (
        <div className="result-box error">
          <strong>{error}</strong>
        </div>
      ) : null}
    </section>
  );
}
