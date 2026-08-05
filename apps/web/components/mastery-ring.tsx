/**
 * L'anneau de maîtrise du tableau de bord.
 *
 * Deux arcs concentriques sur la même circonférence : ce qui est acquis, puis
 * ce qui est en cours, le reste laissé au rail de fond. Ils se suivent plutôt
 * que de se superposer, sinon la longueur visible ne correspondrait plus à la
 * part annoncée.
 *
 * `caption` porte un fait, pas un score. Sans compte, la maquette affiche
 * « N2 » sous la mention « exemple neutre » ; ici le centre affiche un tiret.
 * `getCanonicalLearningProgression` renvoie `null` sans compte, et dessiner un
 * niveau atteint que personne n'a atteint est ce que le reste du produit a
 * cessé de faire. Un anneau vide dit la vérité ; la légende chiffrée à côté
 * porte l'information réelle.
 *
 * Le centre est du texte : l'arc seul porterait la valeur par la géométrie et
 * la couleur, ce qu'interdit la règle d'accessibilité du système de design.
 */

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface MasteryRingSegment {
  /** Part de la circonférence, 0–100. */
  percent: number;
  /** Classe portant la couleur : `acquired` ou `in-progress`. */
  tone: "acquired" | "in-progress";
}

export interface MasteryRingProps {
  /** Texte du centre. `null` quand aucun score personnel n'existe. */
  figure: string | null;
  caption: string;
  segments: MasteryRingSegment[];
  /** Description complète pour un lecteur d'écran. */
  label: string;
  size?: number;
}

export function MasteryRing({ figure, caption, segments, label, size = 150 }: MasteryRingProps) {
  let consumed = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
      className="mastery-ring"
    >
      <circle cx="60" cy="60" r={RADIUS} fill="none" className="mastery-ring-track" strokeWidth="12" />

      {segments.map((segment) => {
        const length = (Math.max(0, Math.min(100, segment.percent)) / 100) * CIRCUMFERENCE;
        // `dashoffset` négatif décale l'arc : chaque segment démarre là où le
        // précédent s'arrête, ce qui les met bout à bout sur le cercle.
        const offset = -consumed;

        consumed += length;

        return length === 0 ? null : (
          <circle
            key={segment.tone}
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            className={`mastery-ring-arc ${segment.tone}`}
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray={`${length} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
          />
        );
      })}

      <text x="60" y="57" textAnchor="middle" className="mastery-ring-figure">
        {figure ?? "—"}
      </text>
      <text x="60" y="76" textAnchor="middle" className="mastery-ring-caption">
        {caption}
      </text>
    </svg>
  );
}
