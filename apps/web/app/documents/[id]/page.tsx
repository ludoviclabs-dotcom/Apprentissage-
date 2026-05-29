import { notFound } from "next/navigation";
import { DomainBadge } from "@/components/domain-badge";
import { getDocuments } from "@finance/db";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documents = await getDocuments();
  const document = documents.find((item) => item.id === id);

  if (!document) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Document</span>
          <h1>{document.title}</h1>
          <p>{document.originalPath}</p>
        </div>
      </section>

      <section className="panel detail-grid">
        <DomainBadge domainId={document.domainId} />
        <dl>
          <div>
            <dt>Type</dt>
            <dd>{document.fileType.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{document.pages}</dd>
          </div>
          <div>
            <dt>Checksum</dt>
            <dd>{document.checksum}</dd>
          </div>
          <div>
            <dt>Importé le</dt>
            <dd>{document.importedAt}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
