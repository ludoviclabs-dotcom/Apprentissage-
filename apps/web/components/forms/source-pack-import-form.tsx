"use client";

import { useState } from "react";

interface ImportResult {
  manifest?: {
    rootPath: string;
    files: Array<{ path: string; extension: string; sizeBytes: number }>;
    skippedCount: number;
  };
  error?: string;
  details?: string;
}

export function SourcePackImportForm({ disabled = false }: { disabled?: boolean }) {
  const [path, setPath] = useState("C:\\Users\\Ludo\\Apprentissage\\source-packs");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submitImport() {
    if (disabled) {
      setResult({ error: "Import désactivé en démo publique." });
      return;
    }

    setIsPending(true);
    setResult(null);

    try {
      const response = await fetch("/api/source-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
      const payload = (await response.json()) as ImportResult;
      setResult(payload);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="panel action-form">
      <div>
        <span className="section-label">Import local</span>
        <h2>Analyser un dossier source-pack</h2>
        <p>Le MVP crée un manifeste validable. L'extraction Docling et les embeddings viennent ensuite.</p>
        {disabled ? <p className="muted">Lecture seule : active auth + base privée pour autoriser l'import.</p> : null}
      </div>
      <label>
        Chemin du dossier
        <input value={path} disabled={disabled} onChange={(event) => setPath(event.target.value)} />
      </label>
      <button type="button" className="primary-action" onClick={submitImport} disabled={isPending || disabled}>
        {isPending ? "Analyse..." : "Analyser le pack"}
      </button>
      {result?.manifest ? (
        <div className="result-box">
          <strong>{result.manifest.files.length} fichiers détectés</strong>
          <span>{result.manifest.skippedCount} fichiers ignorés</span>
        </div>
      ) : null}
      {result?.error ? (
        <div className="result-box error">
          <strong>{result.error}</strong>
          <span>{result.details}</span>
        </div>
      ) : null}
    </section>
  );
}
