import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { searchKnowledge } from "@finance/db";

export const metadata: Metadata = {
  title: "Recherche",
  description: "Recherche locale sur le corpus documentaire, extraits cités à l'appui."
};

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
      <PageHeader
        label="Recherche"
        title="Moteur de recherche documentaire"
        description="Recherche locale sur le corpus dérivé et cité (leçons, notions, flashcards). Chaque résultat conserve sa source : pack, document, page et date."
      />

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
        <EmptyState
          icon={<SearchX size={22} />}
          title="Aucun résultat"
          description={`Rien ne correspond à « ${query} ». Essayez un terme plus général (par ex. « amortissement », « écart », « titres »).`}
        />
      ) : null}
    </div>
  );
}
