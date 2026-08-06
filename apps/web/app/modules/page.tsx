import type { Metadata } from "next";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { getFeatures } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";
import { loadModuleOverview } from "@/lib/publication/chapter";

export const metadata: Metadata = {
  title: "Modules",
  description:
    "Les parcours guidés par niveaux : comptabilité générale et Excel Finance Lab, avec déblocage au score."
};

/**
 * Index des modules structurés.
 *
 * La navigation groupée expose une entrée « Modules » unique : cette page est
 * son atterrissage et liste les tracks disponibles. Le contenu de chaque track
 * (niveaux, gating, exercices) reste rendu par sa propre page.
 */
export default async function ModulesIndexPage() {
  const billing = getFeatures().billing;
  const user = await getCurrentUser();
  const progression = await getCanonicalLearningProgression(user?.id);
  const comptaApprofondie = await loadModuleOverview();

  return (
    <div className="page-stack">
      <PageHeader
        label="Modules"
        title="Des parcours guidés, niveau par niveau"
        description="Chaque module se débloque au score : exercices directs, rétention, cas pratique et justification comptent séparément."
      />

      <section className="module-grid">
        {progression.tracks.map(({ track }) => (
          <ModuleCard
            key={track.trackId}
            href={track.href}
            title={track.title}
            description={track.description}
            premium={track.premium && billing.enabled}
          />
        ))}

        {/*
          « Comptabilité approfondie » n'est pas un track canonique : son contenu
          vient de la fabrique éditoriale et se débloque par la publication, pas
          par un score. Il n'a donc pas sa place dans `progression.tracks`, dont
          chaque entrée suppose des niveaux et une inscription. Une carte
          distincte, une entrée de navigation existante — pas un second système.
        */}
        {comptaApprofondie.availableChapters.length > 0 ? (
          <ModuleCard
            href="/modules/comptabilite-approfondie"
            title={comptaApprofondie.module.label}
            description={comptaApprofondie.module.description}
            meta={
              <p className="muted">
                {comptaApprofondie.availableChapters.length} chapitre
                {comptaApprofondie.availableChapters.length > 1 ? "s" : ""} publié
                {comptaApprofondie.availableChapters.length > 1 ? "s" : ""} ·{" "}
                {comptaApprofondie.totalActivities} activité
                {comptaApprofondie.totalActivities > 1 ? "s" : ""}
              </p>
            }
          />
        ) : null}
      </section>
    </div>
  );
}
