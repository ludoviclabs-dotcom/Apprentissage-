import type { ReviewRiskLevel } from "@/lib/content-review/service";

/**
 * Le niveau de risque établi par la pré-revue.
 *
 * IL NE DÉCIDE RIEN. C'est un ordre de lecture, pas un verdict : un contenu
 * classé A n'est pas approuvé d'avance, il est seulement celui dont la lecture
 * demande le moins d'arbitrage. Le libellé le dit en toutes lettres au survol,
 * pour qu'un relecteur pressé ne lise pas « A » comme « accepté ».
 *
 * `null` quand aucun classement n'a été produit sur cette installation : la file
 * s'affiche alors sans priorités plutôt que d'inventer un niveau.
 */

const RISK: Record<ReviewRiskLevel, { tone: string; title: string }> = {
  A: {
    tone: "ready",
    title: "Lecture rapide : profil explicite, sources vérifiées, aucune divergence à arbitrer"
  },
  B: {
    tone: "processing",
    title: "Lecture attentive : sous-compte propre au cas, comparaison historique ou formulation à vérifier"
  },
  C: {
    tone: "needs-review",
    title: "Prioritaire : divergence normative, écriture comptable ou source à contrôler de près"
  }
};

export function RiskBadge({ level }: { level: ReviewRiskLevel | null }) {
  if (!level) {
    return <span className="muted">—</span>;
  }

  const risk = RISK[level];

  return (
    <span className={`state-token ${risk.tone}`} title={risk.title}>
      {level}
    </span>
  );
}
