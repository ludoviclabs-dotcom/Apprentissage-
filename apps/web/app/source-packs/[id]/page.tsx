import { notFound } from "next/navigation";
import { DomainBadge } from "@/components/domain-badge";
import { getDocuments, getSourcePacks } from "@finance/db";

export default async function SourcePackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sourcePacks, documents] = await Promise.all([getSourcePacks(), getDocuments()]);
  const pack = sourcePacks.find((item) => item.id === id);

  if (!pack) {
    notFound();
  }

  const packDocuments = documents.filter((document) => document.sourcePackId === pack.id);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Source pack</span>
          <h1>{pack.name}</h1>
          <p>{pack.description}</p>
        </div>
      </section>

      <section className="panel detail-grid">
        <DomainBadge domainId={pack.domainId} />
        <dl>
          <div>
            <dt>Version</dt>
            <dd>{pack.versionLabel}</dd>
          </div>
          <div>
            <dt>Date d'effet</dt>
            <dd>{pack.effectiveDate}</dd>
          </div>
          <div>
            <dt>Statut</dt>
            <dd>{pack.status}</dd>
          </div>
          <div>
            <dt>Documents</dt>
            <dd>{pack.documentsCount}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <span className="section-label">Documents liés</span>
        <h2>{packDocuments.length} documents détectés</h2>
        <div className="document-table">
          {packDocuments.map((document) => (
            <article key={document.id} className="document-row">
              <DomainBadge domainId={document.domainId} />
              <strong>{document.title}</strong>
              <span>{document.fileType.toUpperCase()}</span>
              <span>{document.pages} pages</span>
              <span className={`state-token ${document.status}`}>{document.status}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
