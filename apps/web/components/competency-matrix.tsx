import type { CSSProperties } from "react";
import type { CanonicalTrackState } from "@/lib/learning-progression";

/**
 * La matrice de compétences : une ligne par parcours, une colonne par niveau.
 *
 * TROIS ÉTATS DE CELLULE, ET LA DISTINCTION COMPTE.
 *
 * - `locked` : le niveau n'est pas ouvert. Cadenas, jamais une couleur d'erreur
 *   — un niveau verrouillé n'est pas une faute (règle du système de design).
 * - `pending` : le niveau est ouvert mais aucune preuve n'a encore été
 *   produite. Un tiret, pas un « 0 » : afficher zéro accuserait le lecteur d'un
 *   échec qu'il n'a pas commis. C'est l'état de toutes les cellules ouvertes en
 *   mode démonstration.
 * - `scored` : un score réel, écrit en toutes lettres dans la cellule.
 *
 * LA COULEUR NE PORTE JAMAIS SEULE. La saturation indigo double le nombre, elle
 * ne le remplace pas ; les cellules verrouillées portent un cadenas *et* un
 * libellé accessible. Un lecteur d'écran parcourt la table par ses en-têtes.
 *
 * `data-canonical-track` / `data-canonical-score` restent portés par la ligne :
 * `levels-enabled.spec.ts` vérifie que l'accueil, le parcours, la progression
 * et le module annoncent le même score canonique, et lit ces attributs.
 */

type CellState = "locked" | "pending" | "scored";

interface Cell {
  key: string;
  state: CellState;
  score: number | null;
  title: string;
}

/**
 * Un niveau ouvert dont aucune activité n'a été enregistrée vaut 0 dans le
 * modèle de maîtrise. On le distingue d'un vrai 0 par l'absence de preuve :
 * toutes les familles d'activité manquent encore.
 */
function cellFor(level: CanonicalTrackState["levels"][number], personal: boolean): Cell {
  const { definition, snapshot, canOpen } = level;

  if (!canOpen) {
    return {
      key: definition.id,
      state: "locked",
      score: null,
      title: `${definition.title} — niveau non ouvert`
    };
  }

  const untouched = snapshot.missingKinds.length > 0 && snapshot.score === 0;

  if (!personal || untouched) {
    return {
      key: definition.id,
      state: "pending",
      score: null,
      title: `${definition.title} — aucune évaluation`
    };
  }

  return {
    key: definition.id,
    state: "scored",
    score: Math.round(snapshot.score),
    title: `${definition.title} — ${Math.round(snapshot.score)} sur 100`
  };
}

export function CompetencyMatrix({
  tracks,
  personal
}: {
  tracks: CanonicalTrackState[];
  personal: boolean;
}) {
  // Toutes les lignes partagent la même grille : sans cela, deux parcours de
  // longueurs différentes désaligneraient leurs colonnes de niveau.
  const columns = Math.max(1, ...tracks.map((track) => track.levels.length));
  const template = `minmax(120px, 1.4fr) repeat(${columns}, minmax(0, 1fr)) 76px`;

  return (
    <section className="panel matrix-panel" aria-labelledby="matrice-titre">
      <div>
        <span className="section-label">Matrice de compétences</span>
        <h2 id="matrice-titre">Force par domaine et par niveau</h2>
      </div>

      <div className="matrix" role="table" aria-label="Force de maîtrise par parcours et par niveau">
        <div className="matrix-row matrix-head" role="row" style={{ gridTemplateColumns: template }}>
          <span role="columnheader">Parcours</span>
          {Array.from({ length: columns }, (_, index) => (
            <span key={index} role="columnheader" className="matrix-cell-label">
              N{index + 1}
            </span>
          ))}
          <span role="columnheader" className="matrix-average">
            moyenne
          </span>
        </div>

        {tracks.map((track) => (
          <div
            key={track.track.trackId}
            className="matrix-row"
            role="row"
            style={{ gridTemplateColumns: template }}
            data-canonical-track={track.track.trackId}
            data-canonical-score={track.score ?? "neutral"}
          >
            <span role="rowheader" className="matrix-track">
              {track.track.title}
            </span>

            {Array.from({ length: columns }, (_, index) => {
              const level = track.levels[index];

              if (!level) {
                return <span key={index} role="cell" className="matrix-cell absent" aria-label="Niveau inexistant" />;
              }

              const cell = cellFor(level, personal);

              return (
                <span
                  key={cell.key}
                  role="cell"
                  className={`matrix-cell ${cell.state}`}
                  // L'opacité suit le score : la teinte double le nombre.
                  style={
                    cell.state === "scored"
                      ? ({ "--matrix-fill": `${Math.max(20, cell.score ?? 0)}%` } as CSSProperties)
                      : undefined
                  }
                  title={cell.title}
                  aria-label={cell.title}
                >
                  {cell.state === "scored" ? cell.score : cell.state === "locked" ? "🔒" : "—"}
                </span>
              );
            })}

            <span role="cell" className="matrix-average">
              {track.score === null ? "—" : `${Math.round(track.score)} %`}
            </span>
          </div>
        ))}
      </div>

      <p className="matrix-legend">
        Saturation indigo = force de maîtrise · cadenas = niveau non ouvert · tiret = aucune
        évaluation enregistrée.
      </p>
    </section>
  );
}
