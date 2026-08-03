import Link from "next/link";
import { LevelTrack } from "@/components/level-track";
import { PaywallNotice } from "@/components/paywall-notice";
import { SourceReference } from "@/components/source-reference";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import {
  LAB_ASSUMPTIONS_FILE,
  excelCaseHref,
  getExcelLabModel,
  labOpeningCash
} from "@/lib/excel-lab";
import { excelLabAvanceSources, excelLabSources } from "@finance/domain";

/**
 * The lab's front door: what it is, what it is not, and the datasets it runs on.
 *
 * Saying plainly what the grid does — and what it will never do — is part of
 * the product, not a disclaimer. Since PR-12b the N3/N4 grids really
 * recalculate, through a bounded engine; the same honesty now applies to the
 * engine's limits: seven functions, no Power Query, no macro execution.
 */
export default async function ExcelFinanceLabPage() {
  const user = await getCurrentUser();
  // The front door stays readable when the lab is locked: what it is, what it is
  // not, and which datasets it runs on are the things somebody deciding whether
  // to subscribe needs. Only the levels and the exercises behind them close.
  const access = await resolveEntitlement("excel-finance-lab");
  const model = await getExcelLabModel(user?.id);
  const totalExercises = [...model.exercisesByLevel.values()].reduce(
    (sum, list) => sum + list.length,
    0
  );

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Module</span>
          <h1>Excel Finance Lab</h1>
          <p>
            {totalExercises} exercices sur des jeux de données réels : compte de résultat, prévision de
            trésorerie et écarts budgétaires. Chaque réponse est corrigée sur deux plans — le résultat
            et la formule.
          </p>
        </div>
        <div
          className="hero-score"
          data-canonical-track="track-excel-finance-lab"
          data-canonical-score={model.score ?? "neutral"}
        >
          <span>{model.score === null ? "Exemple de parcours" : "Progression"}</span>
          <strong>{model.score === null ? "État neutre" : `${Math.round(model.score)}%`}</strong>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Niveaux</span>
          <strong>{model.levels.length}</strong>
        </article>
        <article>
          <span>Exercices</span>
          <strong>{totalExercises}</strong>
        </article>
        <article>
          <span>Jeux de données</span>
          <strong>{model.datasets.length}</strong>
        </article>
        <article>
          <span>Seuil</span>
          <strong>{model.passingScore}%</strong>
        </article>
      </section>

      <section className="panel">
        <span className="section-label">Ce que fait ce lab</span>
        <h2>Un laboratoire de calcul contrôlé</h2>
        <p>
          Aux niveaux 1 et 2, la grille affiche les données en lecture seule et vous saisissez le
          résultat ainsi que la formule que vous écririez dans Excel — rien n'y est recalculé. Aux
          niveaux 3 et 4, vos formules sont réellement interprétées et recalculées par un moteur
          borné : opérations, parenthèses, références et plages, SOMME, MOYENNE, MIN, MAX, SI,
          SOMME.SI et SOMME.SI.ENS, avec graphe de dépendances et détection des références
          circulaires.
        </p>
        <p className="muted">
          Les limites sont assumées et documentées : sept fonctions, pas d'opérateur puissance, pas de
          Power Query exécuté (il est enseigné par diagnostics guidés), pas de macro exécutée (le VBA
          est affiché et téléchargeable, jamais lancé). La correction vérifie toujours deux plans —
          le résultat, et une méthode qui résiste au changement des données : un chiffre saisi en dur
          échoue sur des données perturbées.
        </p>
      </section>

      {access.allowed ? null : (
        <PaywallNotice reason={access.reason} feature={access.feature} moduleLabel="Excel Finance Lab" />
      )}

      {model.progressionTracked || !access.allowed ? null : (
        <p className="muted">
          Progression non suivie : connecte-toi avec une base active pour que chaque exercice corrigé
          alimente le niveau. Les exercices restent corrigés et notés.
        </p>
      )}

      {access.allowed ? (
        <>
          <LevelTrack
            levels={model.levels}
            snapshots={model.snapshots}
            passingScore={model.passingScore}
            rulesLabel={model.rulesLabel}
          />

          <section className="course-list">
            {model.levels.map((level) => {
              const exercises = model.exercisesByLevel.get(level.id) ?? [];
              const state = model.levelStates.find((candidate) => candidate.definition.id === level.id);

              return (
                <article key={level.id} className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">Niveau {level.level}</span>
                      <h2>{level.title}</h2>
                      <p>{level.objective}</p>
                    </div>
                    {state?.href ? (
                      <Link className="primary-action" href={state.href}>
                        Ouvrir le niveau {level.level}
                      </Link>
                    ) : (
                      <span className="secondary-action" aria-disabled="true">
                        Niveau verrouillé
                      </span>
                    )}
                  </div>
                  <div className="module-meta">
                    <span>{exercises.length} exercices</span>
                    <span>{level.estimatedMinutes} min</span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="panel" data-testid="excel-case-studies">
            <div className="panel-heading">
              <div>
                <span className="section-label">Cas pratiques</span>
                <h2>Deux dossiers complets, un par niveau avancé</h2>
              </div>
            </div>
            <div className="priority-list">
              {model.caseStudies.map((caseStudy) => (
                <article key={caseStudy.id} className="priority-row">
                  <span className="state-token processing">{caseStudy.steps.length} étapes</span>
                  <div>
                    <strong>{caseStudy.title}</strong>
                    <p>{caseStudy.context}</p>
                    <Link className="inline-link" href={excelCaseHref(caseStudy)}>
                      Ouvrir le dossier
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="panel">
        <span className="section-label">Jeux de données</span>
        <h2>Versionnés dans le dépôt</h2>
        <div className="priority-list">
          {model.datasets.map((dataset) => (
            <article key={dataset.id} className="priority-row">
              <span className="state-token processing">{dataset.rowCount} lignes</span>
              <div>
                <strong>{dataset.title}</strong>
                <p>{dataset.description}</p>
                <small>{dataset.file}</small>
              </div>
            </article>
          ))}
        </div>
        <p className="muted">
          Hypothèses communes ({LAB_ASSUMPTIONS_FILE}) : trésorerie à l'ouverture{" "}
          {labOpeningCash.toLocaleString("fr-FR")} EUR.
        </p>
      </section>

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={[...excelLabSources, ...excelLabAvanceSources]} />
      </section>
    </div>
  );
}
