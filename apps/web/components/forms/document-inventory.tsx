"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { domains, type DocumentRecord } from "@finance/domain";
import { DomainBadge } from "@/components/domain-badge";
import { SOURCE_PACK_STATUS_LABELS, statusLabel } from "@/lib/status-labels";

type DocumentStatusFilter = "all" | "ready" | "processing" | "needs-review";

export function DocumentInventory({ documents }: { documents: DocumentRecord[] }) {
  const [query, setQuery] = useState("");
  const [domainId, setDomainId] = useState("all");
  const [status, setStatus] = useState<DocumentStatusFilter>("all");

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        document.title.toLowerCase().includes(normalizedQuery) ||
        document.filename.toLowerCase().includes(normalizedQuery) ||
        document.originalPath.toLowerCase().includes(normalizedQuery);
      const matchesDomain = domainId === "all" || document.domainId === domainId;
      const matchesStatus = status === "all" || document.status === status;

      return matchesQuery && matchesDomain && matchesStatus;
    });
  }, [documents, domainId, query, status]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">Inventaire</span>
          <h2>Documents récents</h2>
        </div>
      </div>

      <div className="filter-bar">
        <label>
          Recherche
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titre, fichier, chemin..."
          />
        </label>
        <label>
          Domaine
          <select value={domainId} onChange={(event) => setDomainId(event.target.value)}>
            <option value="all">Tous</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          État
          <select value={status} onChange={(event) => setStatus(event.target.value as DocumentStatusFilter)}>
            <option value="all">Tous</option>
            <option value="ready">{SOURCE_PACK_STATUS_LABELS.ready}</option>
            <option value="processing">{SOURCE_PACK_STATUS_LABELS.processing}</option>
            <option value="needs-review">{SOURCE_PACK_STATUS_LABELS["needs-review"]}</option>
          </select>
        </label>
      </div>

      {filteredDocuments.length > 0 ? (
        <div className="document-table">
          {filteredDocuments.map((document) => (
            <article key={document.id} className="document-row">
              <DomainBadge domainId={document.domainId} />
              <div>
                <Link href={`/documents/${document.id}`}>
                  <strong>{document.title}</strong>
                </Link>
                <small>{document.originalPath}</small>
              </div>
              <span>{document.fileType.toUpperCase()}</span>
              <span>{document.pages} pages</span>
              <span className={`state-token ${document.status}`}>{statusLabel(document.status)}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="result-box">
          <strong>Aucun document trouvé</strong>
          <span>Élargis la recherche ou change les filtres pour retrouver les imports disponibles.</span>
        </div>
      )}
    </section>
  );
}
