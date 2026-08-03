import { CircleCheck, CircleX } from "lucide-react";
import type { ControlCheck } from "@finance/domain";

/**
 * Feuille de contrôle du dossier : chaque cohérence est calculée côté domaine
 * (`buildControlSheet`) et rendue avec icône + texte — jamais la couleur seule.
 *
 * `showDetails` est désactivé sur la page d'un case study : les détails
 * chiffrés contiennent le résultat et le total du bilan, c'est-à-dire les
 * réponses attendues des étapes — le verdict (conforme / à corriger) suffit
 * tant que le learner n'a pas produit les chiffres lui-même.
 */
export function ControlSheet({
  checks,
  showDetails = true
}: {
  checks: ControlCheck[];
  showDetails?: boolean;
}) {
  const passedCount = checks.filter((check) => check.passed).length;

  return (
    <section className="panel" aria-label="Feuille de contrôle">
      <div className="panel-heading">
        <div>
          <span className="section-label">Feuille de contrôle</span>
          <h2>Les cohérences vérifiées avant l'arrêté</h2>
        </div>
        <span className={`state-token ${passedCount === checks.length ? "ready" : "needs-review"}`}>
          {passedCount}/{checks.length} contrôles
        </span>
      </div>

      <ul className="control-sheet">
        {checks.map((check) => (
          <li key={check.id} className="control-sheet-row" data-check-id={check.id} data-passed={check.passed}>
            {check.passed ? (
              <CircleCheck size={18} aria-hidden="true" className="control-icon control-icon--pass" />
            ) : (
              <CircleX size={18} aria-hidden="true" className="control-icon control-icon--fail" />
            )}
            <div>
              <strong>
                {check.label} — {check.passed ? "conforme" : "à corriger"}
              </strong>
              {showDetails ? <p className="muted">{check.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
