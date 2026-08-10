"use client";

import { useState } from "react";

/**
 * Le rendu de la page, avec un zoom volontairement rudimentaire.
 *
 * Une mise à l'échelle CSS et rien de plus : pas de recadrage sur la région,
 * pas de panoramique, pas de coordonnées. Les annotations ne portent pas encore
 * de coordonnées de région, et un zoom qui prétendrait cadrer sur une zone
 * qu'il ne connaît pas mentirait au relecteur. Le conteneur défile ; le
 * navigateur fait le reste.
 *
 * L'image vient d'une route d'administration, pas d'un chemin : cette page ne
 * sait pas où le fichier se trouve, et n'a pas à le savoir.
 */
const STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
const DEFAULT_INDEX = 2;

export function PageImage({ annotationId, pageNumber }: { annotationId: string; pageNumber: number }) {
  const [index, setIndex] = useState<number>(DEFAULT_INDEX);
  const scale = STEPS[index];

  return (
    <div>
      <div className="review-actions" role="group" aria-label="Zoom">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Zoom −
        </button>
        <button
          type="button"
          disabled={index === STEPS.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Zoom +
        </button>
        <button type="button" disabled={index === DEFAULT_INDEX} onClick={() => setIndex(DEFAULT_INDEX)}>
          Réinitialiser
        </button>
        <span className="muted">{Math.round(scale * 100)} %</span>
      </div>

      <div style={{ overflow: "auto", maxHeight: "80vh", border: "1px solid var(--border, #ccc)" }}>
        {/* Balise brute volontaire : l'optimiseur d'images mettrait ce rendu
            privé en cache sur disque, hors de la garde d'administration. */}
        <img
          src={`/api/admin/source-annotations/${annotationId}/image`}
          alt={`Page ${pageNumber} du document source`}
          style={{ width: `${scale * 100}%`, height: "auto", display: "block" }}
        />
      </div>
    </div>
  );
}
