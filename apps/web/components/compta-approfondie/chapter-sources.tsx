import { SourceCard } from "@/components/compta-approfondie/source-list";
import { EmptyState } from "@/components/ui/empty-state";
import type { ChapterSourceEntry } from "@/lib/publication/chapter";

/**
 * Panneau « Sources » du chapitre.
 *
 * Il énumère ce sur quoi le chapitre s'appuie, document par document et page par
 * page. Il ne propose aucun lien vers un fichier : les supports sont privés, ils
 * ne sont servis par aucune route, et la mention finale le dit au lecteur plutôt
 * que de le laisser chercher un téléchargement qui n'existe pas.
 */
export function ChapterSources({ sources }: { sources: readonly ChapterSourceEntry[] }) {
  if (sources.length === 0) {
    return (
      <EmptyState
        title="Aucune source référencée"
        description="Ce chapitre ne cite encore aucune source. Un contenu publié en cite toujours au moins une : si cet écran est vide, c'est que rien n'est publié."
      />
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-heading">
        {sources.length} source{sources.length > 1 ? "s" : ""} citée{sources.length > 1 ? "s" : ""}
      </h2>

      <p className="muted">
        Chaque règle, formule et correction de ce chapitre renvoie à l&apos;une de ces références.
      </p>

      <div className="source-grid">
        {sources.map((entry) => (
          <SourceCard
            key={`${entry.reference.documentId}-${entry.reference.pageStart}-${entry.reference.sectionTitle ?? ""}`}
            reference={entry.reference}
            citedBy={entry.citedBy}
          />
        ))}
      </div>

      <p className="muted">
        Les documents d&apos;origine sont des supports privés. L&apos;application ne les sert pas et
        n&apos;en publie aucun extrait&nbsp;: seules leur désignation et la page concernée sont
        affichées, pour permettre de retrouver le passage dans son propre exemplaire.
      </p>
    </section>
  );
}
