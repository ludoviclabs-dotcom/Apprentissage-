"use client";

import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Export pédagogique du dossier, généré côté client (Blob) : aucun serveur,
 * aucun réseau — cohérent avec le local-first. Le contenu est passé par le
 * Server Component qui, lui, tient tous les chiffres du domaine.
 */
export function CaseExport({ filename, markdown }: { filename: string; markdown: string }) {
  const [exported, setExported] = useState(false);

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }

  return (
    <div className="case-export">
      <button type="button" className="secondary-action" onClick={download}>
        <Download size={16} aria-hidden="true" /> Exporter le dossier (Markdown)
      </button>
      <span className="sr-only" role="status">
        {exported ? `Dossier exporté : ${filename}.` : ""}
      </span>
    </div>
  );
}
