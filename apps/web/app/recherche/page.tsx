import { searchKnowledge } from "@finance/db";

export default async function RecherchePage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const hits = query.length >= 3 ? await searchKnowledge(query, 12) : [];

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Recherche</span>
          <h1>Moteur de recherche documentaire</h1>
          <p>
            Recherche locale sur le corpus dérivé et cité (leçons, notions, flashcards). Chaque résultat conserve
            sa source : pack, document, page et date.
          </p>
        </div>
      </section>

      <section className="panel">
        <form action="/recherche" method="get" className="search-form">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Rechercher une notion, une règle, une écriture..."
            aria-label="Rechercher dans le corpus"
          />
          <button type="submit">Rechercher</button>
        </form>
        {query.length > 0 && query.length < 3 ? (
          <p className="muted">Saisissez au moins 3 caractères.</p>
        ) : null}
        {query.length >= 3 ? (
          <p className="muted">
            {hits.length} résultat{hits.length > 1 ? "s" : ""} pour « {query} ».
          </p>
        ) : null}
      </section>

      {hits.length > 0 ? (
        <section className="search-results">
          {hits.map((hit, index) => (
            <article key={index} className="panel search-hit">
              <p>{hit.content}</p>
              <div className="search-hit-meta">
                <span className="source-chip">
                  {hit.source.pack} · {hit.source.document}
                  {hit.source.pageStart
                    ? ` · p.${hit.source.pageStart}${
                        hit.source.pageEnd && hit.source.pageEnd !== hit.source.pageStart
                          ? `–${hit.source.pageEnd}`
                          : ""
                      }`
                    : ""}
                </span>
                <span className="time-chip">{Math.round(hit.confidence * 100)}%</span>
              </div>
            </article>
          ))}
        </section>
      ) : query.length >= 3 ? (
        <section className="panel">
          <p className="muted">
            Aucun résultat. Essayez un terme plus général (par ex. « amortissement », « écart », « titres »).
          </p>
        </section>
      ) : null}
    </div>
  );
}
