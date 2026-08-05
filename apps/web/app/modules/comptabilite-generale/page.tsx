import Link from "next/link";
import { LevelTrack } from "@/components/level-track";
import { SourceReference } from "@/components/source-reference";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COMPTA_MODULE_BASE, getComptaModuleModel } from "@/lib/compta-module";
import { comptaGeneraleV1Sources } from "@finance/domain";

/**
 * The module's front door.
 *
 * Levels, their gating and their scores are rendered by the PR-02 `LevelTrack`
 * component rather than by a second implementation: the unlock decision is taken
 * server-side by `evaluateTrack`, and a page that decided it again in the browser
 * could show a level as open that the server would refuse.
 *
 * Refonte visuelle : la page porte `module-page`, et toutes les règles vivent
 * sous cette classe dans `styles/module.css` — même patron que `/apprendre`.
 * Aucun token global n'est modifié, les autres écrans ne bougent pas.
 *
 * La seconde liste de niveaux a disparu : elle répétait les mêmes niveaux, dans
 * le même ordre, pour porter le bouton d'ouverture et le volume d'exercices.
 * `LevelTrack` les prend maintenant en paramètres optionnels.
 */
export default async function ComptaGeneraleModulePage() {
  const user = await getCurrentUser();
  const model = await getComptaModuleModel(user?.id);
  const totalExercises = [...model.exercisesByLevel.values()].reduce(
    (sum, list) => sum + list.length,
    0
  );

  const openHrefs = new Map(model.levelStates.map((state) => [state.definition.id, state.href]));
  const exerciseCounts = new Map(
    [...model.exercisesByLevel].map(([levelId, list]) => [levelId, list.length])
  );

  return (
    <div className="page-stack module-page">
      <section
        className="module-hero"
        data-canonical-track="track-compta-generale-v1"
        data-canonical-score={model.score ?? "neutral"}
      >
        <div>
          <span className="section-label">Module</span>
          <h1>Comptabilité générale — parcours v1</h1>
          <p>
            Le cycle complet d&apos;une facture, de l&apos;achat au règlement : {totalExercises}{" "}
            exercices corrigés automatiquement, un journal interactif et un mini-cas de fin de mois.
          </p>
        </div>

        {/* Quatre compteurs lus depuis le modèle. La maquette annonçait 24
            exercices et un seuil de 70 % ; le curriculum publié en compte 37 et
            exige 75 %. Deux chiffres pour une même chose finissent toujours par
            diverger, donc un seul est écrit à la main : aucun. */}
        <div className="module-stats">
          <div>
            <strong>{model.levels.length}</strong>
            <span>niveaux</span>
          </div>
          <div>
            <strong>{totalExercises}</strong>
            <span>exercices</span>
          </div>
          <div>
            <strong>{model.miniCase.steps.length}</strong>
            <span>étapes du cas</span>
          </div>
          <div>
            <strong>{model.passingScore} %</strong>
            <span>seuil</span>
          </div>
        </div>
      </section>

      {model.progressionTracked ? null : (
        <p className="muted">
          Progression non suivie : connecte-toi avec une base active pour que chaque exercice corrigé
          alimente le niveau. Les exercices restent corrigés et notés.
        </p>
      )}

      <LevelTrack
        levels={model.levels}
        snapshots={model.snapshots}
        passingScore={model.passingScore}
        rulesLabel={model.rulesLabel}
        openHrefs={openHrefs}
        exerciseCounts={exerciseCounts}
      />

      {/* Espace pédagogique : filet teal, fond blanc — la famille de surfaces
          qui se lit, par opposition au navy qui appelle à agir. */}
      <section className="case-panel">
        <div className="case-panel-body">
          <span className="section-label">Mini-cas · espace pédagogique</span>
          <h2>{model.miniCase.title}</h2>
          <p>{model.miniCase.context}</p>
          <p className="case-meta">
            <strong>{model.miniCase.steps.length}</strong> étapes ·{" "}
            <strong>{model.miniCase.documents.length}</strong> pièces · corrigées avec preuves citées
          </p>
        </div>
        <Link
          className="secondary-action action-lg inline-link"
          href={`${COMPTA_MODULE_BASE}/cas-pratique`}
        >
          Ouvrir le cas
        </Link>
      </section>

      <SourceReference sources={comptaGeneraleV1Sources} />

      {/* PR-12a : les deux case studies des niveaux 3 et 4 — la clôture
          mensuelle, puis l'arrêté annuel avec grand livre, balance, feuille de
          contrôle et export du dossier. */}
      {model.caseStudies.map((caseStudy) => (
        <section key={caseStudy.id} className="case-panel">
          <div className="case-panel-body">
            <span className="section-label">Case study</span>
            <h2>{caseStudy.title}</h2>
            <p>{caseStudy.context}</p>
            <p className="case-meta">
              <strong>{caseStudy.steps.length}</strong> étapes ·{" "}
              <strong>{caseStudy.documents.length}</strong> pièces · checklist de clôture incluse
            </p>
          </div>
          <Link
            className="secondary-action action-lg inline-link"
            href={`${COMPTA_MODULE_BASE}/cas/${caseStudy.slug}`}
          >
            Ouvrir le cas
          </Link>
        </section>
      ))}
    </div>
  );
}
