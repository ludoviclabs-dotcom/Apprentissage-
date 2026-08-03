"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Download } from "lucide-react";

/**
 * Le module VBA, affiché en lecture seule et téléchargeable — jamais exécuté.
 *
 * Monaco arrive en import dynamique sans SSR : l'éditeur pèse lourd et n'a pas
 * sa place dans le premier rendu. Pendant le chargement (et pour tout client
 * sans JavaScript) le même code est affiché dans un `<pre>` : le contenu ne
 * dépend jamais de Monaco, seule la coloration en dépend.
 *
 * Le téléchargement est un Blob local, comme l'export de dossier des cas compta
 * (PR-12a) : aucun serveur, aucun réseau. Le fichier téléchargé est le module
 * committé dans `datasets/excel/vba/`, à ouvrir dans Excel sur son propre
 * poste ; la plateforme, elle, n'exécute pas de macro — ni sur Vercel, ni dans
 * le navigateur.
 */

const VbaMonaco = dynamic(() => import("@/components/excel/vba-monaco"), {
  ssr: false,
  loading: () => null
});

export function VbaViewer({ code, filename }: { code: string; filename: string }) {
  const [monacoReady, setMonacoReady] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  function download() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <div className="vba-viewer" data-testid="vba-viewer">
      <div className="vba-viewer-frame">
        {/* Le <pre> reste le support de référence tant que Monaco n'a pas
            signalé son premier rendu ; les deux affichent le même texte. */}
        <VbaMonaco code={code} onReady={() => setMonacoReady(true)} />
        <pre className="vba-fallback" hidden={monacoReady} aria-hidden={monacoReady}>
          <code>{code}</code>
        </pre>
      </div>

      <div className="journal-actions">
        <button type="button" className="secondary-action" onClick={download}>
          <Download size={16} aria-hidden="true" /> Télécharger le module ({filename})
        </button>
        <span className="result-inline muted">
          Fichier de travail pour Excel sur votre poste — la plateforme n&apos;exécute aucune macro.
        </span>
      </div>
      <span className="sr-only" role="status">
        {downloaded ? `Module téléchargé : ${filename}.` : ""}
      </span>
    </div>
  );
}
