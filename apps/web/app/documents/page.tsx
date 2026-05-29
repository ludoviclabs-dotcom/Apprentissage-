import { DocumentInventory } from "@/components/forms/document-inventory";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";
import { getDocuments } from "@finance/db";

export default async function DocumentsPage() {
  const documents = await getDocuments();
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

      <DocumentUploadForm />

      <DocumentInventory documents={documents} />
    </div>
  );
}
