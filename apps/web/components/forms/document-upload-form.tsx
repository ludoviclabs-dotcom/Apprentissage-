"use client";

import { useState } from "react";
import { domains } from "@finance/domain";

interface UploadResult {
  file?: {
    filename: string;
    storedFilename: string;
    extension: string;
    sizeBytes: number;
    checksum: string;
    domainId: string;
    path: string;
    status: string;
  };
  error?: string;
  supported?: string[];
}

export function DocumentUploadForm({ disabled = false }: { disabled?: boolean }) {
  const [domainId, setDomainId] = useState("compta-generale");
  const [file, setFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function submitUpload() {
    if (!file) {
      setResult({ error: "Choisis d'abord un fichier." });
      return;
    }

    if (disabled) {
      setResult({ error: "Upload désactivé en démo publique." });
      return;
    }

    setIsPending(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("domainId", domainId);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as UploadResult;
      setResult(payload);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Upload web</span>
        <h2>Ajouter un document local</h2>
        <p>Le fichier est copie dans data/uploads. Les fichiers Markdown sont prets pour le chunking, les autres attendent Docling.</p>
        {disabled ? <p className="muted">Lecture seule : active auth + base privée pour autoriser l'upload.</p> : null}
      </div>
      <div className="form-grid">
        <label>
          Domaine
          <select value={domainId} onChange={(event) => setDomainId(event.target.value)}>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fichier
          <input
            type="file"
            accept=".pdf,.docx,.pptx,.xlsx,.md"
            disabled={disabled}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <button type="button" className="primary-action" onClick={submitUpload} disabled={isPending || disabled}>
        {isPending ? "Upload..." : "Uploader"}
      </button>
      {result?.file ? (
        <div className="result-box">
          <strong>{result.file.filename}</strong>
          <span>{result.file.status} - {Math.round(result.file.sizeBytes / 1024)} Ko</span>
          <span>{result.file.path}</span>
        </div>
      ) : null}
      {result?.error ? (
        <div className="result-box error">
          <strong>{result.error}</strong>
          {result.supported ? <span>Formats : {result.supported.join(", ")}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
