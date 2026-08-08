import type { Metadata } from "next";
import Link from "next/link";
import { contentTypeLabels, type ContentType } from "@finance/content-generation";
import { loadAllDrafts, loadReviewRisks, requireReviewAccess } from "@/lib/content-review/service";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  NormativeProfileBadge,
  ScoringPolicyBadge,
  UndeterminedProfileBadge
} from "@/components/content-review/normative-panel";
import { RiskBadge } from "@/components/content-review/risk-badge";
import { StatusToken, ModeBadge } from "@/components/content-review/status-token";

export const metadata: Metadata = {
  title: "Relecture des contenus — Administration",
  description: "File de relecture des contenus générés : sources, contrôles, approbation ou rejet."
};

export const dynamic = "force-dynamic";

/**
 * Les filtres rapides de la file.
 *
 * Ils reprennent l'ordre de revue recommandé — les prioritaires d'abord — et
 * les trois statuts qu'un relecteur veut isoler. Ce sont de simples liens :
 * l'état vit dans l'URL, donc un filtre se partage, se met en signet et
 * survit à un rechargement.
 */
const QUICK_FILTERS: ReadonlyArray<{ label: string; params: Record<string, string> }> = [
  { label: "Tous", params: {} },
  { label: "C prioritaires", params: { risque: "C" } },
  { label: "B à lire", params: { risque: "B" } },
  { label: "A rapides", params: { risque: "A" } },
  { label: "À relire", params: { statut: "needs_review" } },
  { label: "Approuvés", params: { statut: "approved" } },
  { label: "Rejetés", params: { statut: "rejected" } }
];

interface SearchParams {
  chapitre?: string;
  type?: string;
  statut?: string;
  q?: string;
  qualite?: string;
  /** Filtre rapide sur le niveau de risque établi par la pré-revue. */
  risque?: string;
}

export default async function ContentReviewPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireReviewAccess();

  const filters = await searchParams;
  const all = await loadAllDrafts();
  const risks = await loadReviewRisks();

  // LE COMPTEUR PORTE SUR LES DÉCISIONS, PAS SUR LES CONTENUS RESTANTS. Une file
  // qui n'affiche que « 24 contenus » ne dit pas où en est la revue : approuver
  // et rejeter font tous deux avancer, et c'est leur somme qui progresse.
  const decided = all.filter(
    (entry) => entry.draft.status === "approved" || entry.draft.status === "rejected"
  ).length;

  const chapters = [...new Set(all.map((entry) => entry.draft.chapterLabel))].sort();
  const types = [...new Set(all.map((entry) => entry.draft.contentType))].sort();
  const statuses = [...new Set(all.map((entry) => entry.draft.status))].sort();

  const minQuality = filters.qualite ? Number.parseInt(filters.qualite, 10) : undefined;
  const query = filters.q?.trim().toLowerCase();

  const visible = all.filter(({ draft }) => {
    if (filters.chapitre && draft.chapterLabel !== filters.chapitre) return false;
    if (filters.type && draft.contentType !== filters.type) return false;
    if (filters.statut && draft.status !== filters.statut) return false;
    if (filters.risque && risks.get(draft.id)?.level !== filters.risque) return false;
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
        description="L'approbation enregistre une décision de relecture ; elle ne publie rien. La publication est une action distincte, déclenchée contenu par contenu depuis sa fiche."
      />

      <section className="panel">
        <h2 className="panel-heading">Filtres rapides</h2>
        <p className="review-counter">
          <strong>
            {decided} / {all.length}
          </strong>{" "}
          décision{decided > 1 ? "s" : ""} enregistrée{decided > 1 ? "s" : ""}
          <span className="muted"> — une décision est une approbation ou un rejet.</span>
        </p>
        <nav className="review-quick-filters" aria-label="Filtres rapides">
          {QUICK_FILTERS.map((filter) => {
            const target = new URLSearchParams();
            if (filters.chapitre) target.set("chapitre", filters.chapitre);
            for (const [key, value] of Object.entries(filter.params)) target.set(key, value);
            const query = target.toString();
            const active =
              (filters.risque ?? "") === (filter.params.risque ?? "") &&
              (filters.statut ?? "") === (filter.params.statut ?? "");

            return (
              <Link
                key={filter.label}
                className={`state-token ${active ? "ready" : "processing"}`}
                href={query.length > 0 ? `/admin/content-review?${query}` : "/admin/content-review"}
                aria-current={active ? "true" : undefined}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
      </section>

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
                  <th scope="col">Risque</th>
                  <th scope="col">Qualité</th>
                  <th scope="col">Origine</th>
                  <th scope="col">Référentiel</th>
                  <th scope="col">Alertes</th>
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
                    <td>
                      <RiskBadge level={risks.get(draft.id)?.level ?? null} />
                    </td>
                    <td>{draft.validationMetadata?.qualityScore ?? "—"}</td>
                    <td>
                      <ModeBadge mode={draft.generationMetadata.mode} />
                    </td>
                    <td>
                      {draft.normativeContext ? (
                        <>
                          <NormativeProfileBadge profile={draft.normativeContext.profile} />{" "}
                          <ScoringPolicyBadge policy={draft.normativeContext.scoringPolicy} />
                        </>
                      ) : (
                        <UndeterminedProfileBadge />
                      )}
                    </td>
                    <td>
                      {(draft.validationMetadata?.warnings ?? []).length > 0 ? (
                        <span
                          className="state-token needs-review"
                          title={(draft.validationMetadata?.warnings ?? [])
                            .map((issue) => issue.code)
                            .join(", ")}
                        >
                          {(draft.validationMetadata?.warnings ?? []).length}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
