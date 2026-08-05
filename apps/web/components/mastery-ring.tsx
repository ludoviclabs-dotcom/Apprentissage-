/**
 * L'anneau de maîtrise.
 *
 * `score === null` n'est pas « zéro » : c'est « pas de score ». Les deux se
 * dessinent différemment — un anneau vide avec un tiret au centre, contre un
 * anneau à 0 % — parce que « tu n'as rien commencé » et « tu as tout raté » ne
 * disent pas la même chose au même lecteur.
 *
 * La maquette affiche 64 % en mode démonstration, sous la mention « exemple
 * neutre ». Ce composant ne le fait pas : `getCanonicalLearningProgression`
 * renvoie `null` sans compte, et fabriquer un pourcentage pour remplir un
 * cercle est exactement le geste que PR-20 a retiré du reste du produit
 * (ADR-011). Le sous-titre porte alors un fait vrai — le volume du catalogue —
 * plutôt qu'un score imaginaire.
 *
 * Le pourcentage est écrit au centre : l'anneau seul porterait l'information
 * par la géométrie et la couleur, ce que la règle d'accessibilité du système
 * de design interdit.
 */

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface MasteryRingProps {
  /** 0–100, ou `null` quand aucun score personnel n'existe. */
  score: number | null;
  /** Sous le pourcentage : « 28 compétences ». */
  caption: string;
  /** Diamètre rendu. Le viewBox reste à 120 pour que le tracé ne bouge pas. */
  size?: number;
}

export function MasteryRing({ score, caption, size = 180 }: MasteryRingProps) {
  const percent = score === null ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  const filled = (percent / 100) * CIRCUMFERENCE;
  const label =
    score === null
      ? `Aucun score personnel. ${caption}.`
      : `Maîtrise globale ${percent} pour cent. ${caption}.`;

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
      {score === null ? null : (
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          className="mastery-ring-value"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          transform="rotate(-90 60 60)"
        />
      )}
      <text x="60" y="57" textAnchor="middle" className="mastery-ring-figure">
        {score === null ? "—" : `${percent}%`}
      </text>
      <text x="60" y="76" textAnchor="middle" className="mastery-ring-caption">
        {caption}
      </text>
    </svg>
  );
}
