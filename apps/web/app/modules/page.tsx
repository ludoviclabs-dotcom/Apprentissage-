import type { Metadata } from "next";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { getFeatures } from "@/lib/features";

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
const MODULE_TRACKS = [
  {
    href: "/modules/comptabilite-generale",
    title: "Comptabilité générale — parcours v1",
    description:
      "Le cycle complet d'une facture, de l'achat au règlement : journal interactif, TVA, banque, immobilisation et mini-cas de clôture.",
    premium: false
  },
  {
    href: "/modules/excel-finance-lab",
    title: "Excel Finance Lab",
    description:
      "Raisonnement tableur sur données réelles : compte de résultat, prévision de trésorerie et écarts budgétaires, corrigés sur le résultat et la formule.",
    premium: true
  }
] as const;

export default function ModulesIndexPage() {
  const billing = getFeatures().billing;

  return (
    <div className="page-stack">
      <PageHeader
        label="Modules"
        title="Des parcours guidés, niveau par niveau"
        description="Chaque module se débloque au score : exercices directs, rétention, cas pratique et justification comptent séparément."
      />

      <section className="module-grid">
        {MODULE_TRACKS.map((track) => (
          <ModuleCard
            key={track.href}
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
