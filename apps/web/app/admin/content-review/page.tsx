import type { Metadata } from "next";
import Link from "next/link";
import { contentTypeLabels, type ContentType } from "@finance/content-generation";
import { loadAllDrafts, requireReviewAccess } from "@/lib/content-review/service";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusToken, ModeBadge } from "@/components/content-review/status-token";

export const metadata: Metadata = {
  title: "Relecture des contenus — Administration",
  description: "File de relecture des contenus générés : sources, contrôles, approbation ou rejet."
};

export const dynamic = "force-dynamic";

interface SearchParams {
  chapitre?: string;
  type?: string;
  statut?: string;
  q?: string;
  qualite?: string;
}

export default async function ContentReviewPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireReviewAccess();

  const filters = await searchParams;
  const all = await loadAllDrafts();

  const chapters = [...new Set(all.map((entry) => entry.draft.chapterLabel))].sort();
  const types = [...new Set(all.map((entry) => entry.draft.contentType))].sort();
  const statuses = [...new Set(all.map((entry) => entry.draft.status))].sort();

  const minQuality = filters.qualite ? Number.parseInt(filters.qualite, 10) : undefined;
  const query = filters.q?.trim().toLowerCase();

  const visible = all.filter(({ draft }) => {
    if (filters.chapitre && draft.chapterLabel !== filters.chapitre) return false;
    if (filters.type && draft.contentType !== filters.type) return false;
    if (filters.statut && draft.status !== filters.statut) return false;
    if (query && !draft.title.toLowerCase().includes(query)) return false;
    if (
      minQuality !== undefined &&
      Number.isFinite(minQuality) &&
      (draft.validationMetadata?.qualityScore ?? 0) < minQuality
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="page-stack">
      <PageHeader
        label="Administration"
        title="Relecture des contenus générés"
        description="Aucun de ces contenus n'est publié. L'approbation enregistre une décision de relecture ; la publication fera l'objet d'un lot ultérieur."
      />

      <section className="panel">
        <h2 className="panel-heading">Filtrer</h2>
        <form className="filter-bar" method="get">
          <label>
            Chapitre
            <select name="chapitre" defaultValue={filters.chapitre ?? ""}>
              <option value="">Tous</option>
              {chapters.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </label>

          <label>
            Type
            <select name="type" defaultValue={filters.type ?? ""}>
              <option value="">Tous</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {contentTypeLabels[type as ContentType] ?? type}
                </option>
              ))}
            </select>
          </label>

          <label>
            Statut
            <select name="statut" defaultValue={filters.statut ?? ""}>
              <option value="">Tous</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label>
            Qualité minimale
            <input type="number" name="qualite" min={0} max={100} defaultValue={filters.qualite ?? ""} />
          </label>

          <label>
            Titre contient
            <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Rechercher…" />
          </label>

          <button type="submit" className="secondary-action">
            Appliquer
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-heading">
          {visible.length} contenu{visible.length > 1 ? "s" : ""} sur {all.length}
        </h2>

        {all.length === 0 ? (
          <EmptyState
            title="Aucun brouillon"
            description="Lancer pnpm content:generate pour produire des contenus à relire."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="Aucun résultat" description="Aucun contenu ne correspond à ces filtres." />
        ) : (
          <div className="table-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th scope="col">Titre</th>
                  <th scope="col">Type</th>
                  <th scope="col">Chapitre</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Qualité</th>
                  <th scope="col">Origine</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ draft }) => (
                  <tr key={draft.id}>
                    <td>
                      <Link href={`/admin/content-review/${draft.id}`}>{draft.title}</Link>
                    </td>
                    <td>{contentTypeLabels[draft.contentType]}</td>
                    <td>{draft.chapterLabel}</td>
                    <td>
                      <StatusToken status={draft.status} />
                    </td>
                    <td>{draft.validationMetadata?.qualityScore ?? "—"}</td>
                    <td>
                      <ModeBadge mode={draft.generationMetadata.mode} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
