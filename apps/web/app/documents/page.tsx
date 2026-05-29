import { DomainBadge } from "@/components/domain-badge";
import { getSourceModel } from "@/lib/view-model";

export default function DocumentsPage() {
  const { documents } = getSourceModel();
  const ready = documents.filter((document) => document.status === "ready").length;
  const pages = documents.reduce((sum, document) => sum + document.pages, 0);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Documents</span>
          <h1>Importer, vérifier, retrouver</h1>
          <p>Le MVP prépare trois entrées : upload web, dossier local et Git pour les contenus non sensibles.</p>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Cours importés</span>
          <strong>{documents.length}</strong>
        </article>
        <article>
          <span>Pages indexées</span>
          <strong>{pages}</strong>
        </article>
        <article>
          <span>Documents prêts</span>
          <strong>{ready}</strong>
        </article>
        <article>
          <span>À vérifier</span>
          <strong>{documents.length - ready}</strong>
        </article>
      </section>

      <section className="three-column">
        <article className="panel">
          <span className="section-label">Mode 1</span>
          <h2>Import manuel</h2>
          <p>Déposer des PDF, DOCX, PPTX, XLSX ou Markdown depuis l'interface.</p>
        </article>
        <article className="panel">
          <span className="section-label">Mode 2</span>
          <h2>Dossier local</h2>
          <p>Ranger les fichiers dans `source-packs`, puis lancer `pnpm ingest &lt;path&gt;`.</p>
        </article>
        <article className="panel">
          <span className="section-label">Mode 3</span>
          <h2>Git</h2>
          <p>Versionner les notes, fiches et exercices non sensibles sans connecteur externe.</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Inventaire</span>
            <h2>Documents récents</h2>
          </div>
        </div>
        <div className="document-table">
          {documents.map((document) => (
            <article key={document.id} className="document-row">
              <DomainBadge domainId={document.domainId} />
              <div>
                <strong>{document.title}</strong>
                <small>{document.originalPath}</small>
              </div>
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
