import type { Metadata } from "next";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { getFeatures } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";

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
      </section>
    </div>
  );
}
