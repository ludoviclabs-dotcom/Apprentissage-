import Link from "next/link";
import { LevelTrack } from "@/components/level-track";
import { PaywallNotice } from "@/components/paywall-notice";
import { SourceReference } from "@/components/source-reference";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import {
  EXCEL_LAB_BASE,
  LAB_ASSUMPTIONS_FILE,
  getExcelLabModel,
  labOpeningCash
} from "@/lib/excel-lab";
import { excelLabSources } from "@finance/domain";

/**
 * The lab's front door: what it is, what it is not, and the datasets it runs on.
 *
 * Saying plainly that this is not a spreadsheet is part of the product, not a
 * disclaimer. A learner who expects Excel and finds a grid that will not
 * recalculate would reasonably conclude the thing is broken.
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
        <div className="hero-score">
          <span>Seuil</span>
          <strong>{model.passingScore}%</strong>
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
          <span>Correction</span>
          <strong>Valeur + formule</strong>
        </article>
      </section>

      <section className="panel">
        <span className="section-label">Ce que fait ce lab</span>
        <h2>Un tableur qui ne calcule pas à votre place</h2>
        <p>
          La grille affiche les données en lecture seule et vous laisse saisir le résultat, ainsi que la
          formule que vous écririez dans Excel. Rien n'est recalculé ici : aucune formule n'est
          interprétée, il n'y a ni moteur de calcul ni dépendances entre cellules.
        </p>
        <p className="muted">
          C'est délibéré. Un tableur à moitié fonctionnel serait pire que pas de tableur du tout : face à
          un chiffre inattendu, vous ne sauriez pas si l'erreur vient de vous ou de l'outil. Ici, le
          résultat et la méthode sont vérifiés séparément — saisir 600 000 en dur donne les points du
          résultat, pas ceux de la formule.
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

              return (
                <article key={level.id} className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">Niveau {level.level}</span>
                      <h2>{level.title}</h2>
                      <p>{level.objective}</p>
                    </div>
                    <Link className="primary-action" href={`${EXCEL_LAB_BASE}/${level.level}`}>
                      Ouvrir le niveau {level.level}
                    </Link>
                  </div>
                  <div className="module-meta">
                    <span>{exercises.length} exercices</span>
                    <span>{level.estimatedMinutes} min</span>
                  </div>
                </article>
              );
            })}
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
        <SourceReference sources={excelLabSources} />
      </section>
    </div>
  );
}
