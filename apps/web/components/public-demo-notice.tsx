import { PUBLIC_DEMO_MESSAGE, PUBLIC_DEMO_TITLE } from "@/lib/features";

/**
 * L'unique notice de mode découverte.
 *
 * Elle est rendue par le shell, donc exactement une fois par page. C'est
 * délibéré : la version précédente répétait un message d'exploitation sous
 * chaque carte de révision, ce qui transformait une information de contexte en
 * bruit — et en bruit qui nommait `FINANCE_HUB_USE_DATABASE`.
 *
 * Un composant, une copie, un emplacement. Ce qu'une interaction précise doit
 * rappeler au moment du résultat (« Résultat temporaire — non enregistré ») est
 * une étiquette de statut, pas une seconde notice, et vit dans le composant
 * concerné.
 */
export function PublicDemoNotice() {
  return (
    <section className="demo-banner" aria-label={PUBLIC_DEMO_TITLE}>
      <strong>{PUBLIC_DEMO_TITLE}</strong>
      <span>{PUBLIC_DEMO_MESSAGE}</span>
    </section>
  );
}
