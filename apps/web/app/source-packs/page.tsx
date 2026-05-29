import { DomainBadge } from "@/components/domain-badge";
import { getSourceModel } from "@/lib/view-model";

export default function SourcePacksPage() {
  const { sourcePacks } = getSourceModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Source packs</span>
          <h1>Connaissance contrôlée, versionnée, vérifiable</h1>
          <p>Chaque pack garde domaine, version, date d'effet, statut et volume indexé.</p>
        </div>
      </section>

      <section className="pack-grid">
        {sourcePacks.map((pack) => (
          <article key={pack.id} className="pack-card">
            <div className="pack-top">
              <DomainBadge domainId={pack.domainId} />
              <span className={`state-token ${pack.status}`}>{pack.status}</span>
            </div>
            <h2>{pack.name}</h2>
            <p>{pack.description}</p>
            <div className="pack-stats">
              <span>{pack.documentsCount} docs</span>
              <span>{pack.chunksCount} chunks</span>
              <span>{pack.versionLabel}</span>
            </div>
            <small>Date d'effet : {pack.effectiveDate}</small>
          </article>
        ))}
      </section>

      <section className="panel">
        <span className="section-label">Règle produit</span>
        <h2>Pas de synchronisation fragile</h2>
        <p>
          Un pack est une entrée contrôlée : tu le télécharges, tu l'importes, tu le compares, puis tu valides
          les impacts sur tes fiches et exercices.
        </p>
      </section>
    </div>
  );
}
