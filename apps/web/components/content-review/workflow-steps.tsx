import type { ContentDraftStatus } from "@finance/content-generation";

/**
 * Où en est ce contenu dans le circuit éditorial.
 *
 * IL EXISTE PARCE QUE L'ÉCRAN NE LE DISAIT NULLE PART. La page affichait un
 * panneau « Décision » et un panneau « Publication » côte à côte, sans dire que
 * le second n'est atteignable qu'après le premier. Un relecteur qui parcourt la
 * page de haut en bas lit deux actions possibles là où il n'y en a qu'une — et
 * la seule qui fasse avancer le contenu est celle qu'il ne reconnaît pas comme
 * telle.
 *
 * Les quatre étapes sont celles de la machine à états, pas une invention
 * d'interface : `draft` → `needs_review` → `approved`, puis la publication, qui
 * est une couche séparée et volontairement absente de la machine à états.
 *
 * `rejected` et `validation_failed` ne sont pas des étapes : ce sont des
 * sorties. Elles sont signalées à part plutôt que glissées dans la file, parce
 * qu'un contenu rejeté n'est pas « à mi-chemin », il est revenu en arrière.
 */

const STEPS = [
  { key: "draft", label: "Brouillon", hint: "Produit par la fabrique" },
  { key: "review", label: "Revue humaine", hint: "Approuver ou rejeter" },
  { key: "approved", label: "Approuvé", hint: "Révision figée" },
  { key: "published", label: "Publication", hint: "Action distincte" }
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** L'étape où se trouve un contenu, et celles qu'il a déjà franchies. */
function currentStep(status: ContentDraftStatus): StepKey {
  switch (status) {
    case "draft":
    case "validation_failed":
      return "draft";
    case "needs_review":
    case "rejected":
      return "review";
    case "approved":
      return "approved";
  }
}

export function WorkflowSteps({
  status,
  published
}: {
  status: ContentDraftStatus;
  /** Vrai quand une version de ce contenu est active sur le site public. */
  published: boolean;
}) {
  const active = published ? "published" : currentStep(status);
  const activeIndex = STEPS.findIndex((step) => step.key === active);
  const derailed = status === "rejected" || status === "validation_failed";

  return (
    <nav className="workflow-steps" aria-label="Étape du circuit éditorial">
      <ol>
        {STEPS.map((step, index) => {
          const state =
            index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";

          return (
            <li key={step.key} className={`workflow-step workflow-step-${state}`}>
              <span className="workflow-step-index" aria-hidden="true">
                {index + 1}
              </span>
              <span className="workflow-step-body">
                <span className="workflow-step-label">
                  {step.label}
                  {state === "current" ? <span className="sr-only"> — étape courante</span> : null}
                </span>
                <span className="workflow-step-hint">{step.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {derailed ? (
        <p className="workflow-steps-note">
          {status === "rejected"
            ? "Ce contenu a été rejeté : il peut être rouvert, corrigé, puis remis en revue."
            : "Les contrôles déterministes ont échoué : le contenu doit être corrigé avant de revenir en revue."}
        </p>
      ) : null}
    </nav>
  );
}
