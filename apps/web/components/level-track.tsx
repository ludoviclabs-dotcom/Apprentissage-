import Link from "next/link";
import type { LevelSnapshot, ModuleLevelDefinition } from "@finance/domain";
import { ACTIVITY_KINDS, getLevelStatusLabel } from "@finance/domain";
import { ProgressMeter } from "@/components/progress-meter";
import { LockedState } from "@/components/ui/locked-state";

/**
 * Renders a gated track. Presentation only: every status, score and blocker is
 * computed server-side by `evaluateTrack`, so no unlock decision is taken here.
 * That is deliberate — a level that looks unlocked in the browser but is refused
 * by the server would be exactly the kind of dishonest control PR-00 removed.
 */

const ACTIVITY_LABELS: Record<(typeof ACTIVITY_KINDS)[number], string> = {
  direct: "Exercices directs",
  retention: "Rétention",
  caseStudy: "Cas pratique",
  explanation: "Justification"
};

const STATUS_TOKEN: Record<LevelSnapshot["status"], string> = {
  locked: "locked",
  available: "processing",
  in_progress: "needs-review",
  passed: "ready",
  planned: "processing"
};

/**
 * `openHrefs` et `exerciseCounts` replient dans ce rail ce que la page module
 * affichait une seconde fois plus bas : le bouton d'ouverture et le volume
 * d'exercices, sur les mêmes niveaux, dans le même ordre. Deux listes
 * identiques laissaient au lecteur le soin de faire le rapprochement.
 *
 * Les deux sont OPTIONNELS : /parcours et le lab Excel appellent ce composant
 * sans eux et rendent exactement comme avant.
 */
export function LevelTrack({
  levels,
  snapshots,
  passingScore,
  rulesLabel,
  openHrefs,
  exerciseCounts
}: {
  levels: ModuleLevelDefinition[];
  snapshots: LevelSnapshot[];
  passingScore: number;
  rulesLabel: string;
  /** `levelId` → route d'ouverture. Absent ou null = niveau non ouvrable. */
  openHrefs?: Map<string, string | null>;
  exerciseCounts?: Map<string, number>;
}) {
  const byLevelId = new Map(snapshots.map((snapshot) => [snapshot.levelId, snapshot]));

  return (
    <section className="panel level-track" aria-label="Progression par niveau">
      <div className="panel-heading">
        <div>
          <span className="section-label">Niveaux</span>
          <h2>Déblocage au score de {passingScore} %</h2>
        </div>
        <span className="source-chip">{rulesLabel}</span>
      </div>

      <ol className="level-list">
        {levels.map((level) => {
          const snapshot = byLevelId.get(level.id);
          const status = snapshot?.status ?? "locked";
          const score = snapshot?.score ?? 0;
          const openHref = openHrefs?.get(level.id) ?? null;
          const exercises = exerciseCounts?.get(level.id);

          return (
            <li key={level.id} className={`level-row ${status}`} data-level-status={status}>
              <div className="level-row-head">
                <span className="level-index" aria-hidden="true">
                  N{level.level}
                </span>
                <div>
                  <strong>{level.title}</strong>
                  <p className="muted">{level.objective}</p>
                  {exercises === undefined ? null : (
                    <p className="level-meta">
                      <strong>{exercises}</strong> exercice{exercises > 1 ? "s" : ""} ·{" "}
                      <strong>{level.estimatedMinutes}</strong> min
                      {level.criticalCompetencyIds.length > 0
                        ? ` · critique : ${level.criticalCompetencyIds.join(", ")}`
                        : ""}
                    </p>
                  )}
                </div>
                {/* Le bouton n'apparaît que si le serveur a réellement ouvert le
                    niveau : `openHrefs` vient de `evaluateTrack`, jamais d'une
                    décision prise ici. */}
                {openHref ? (
                  <Link className="primary-action action-sm inline-link" href={openHref}>
                    Ouvrir le niveau {level.level}
                  </Link>
                ) : (
                  <span className={`state-token ${STATUS_TOKEN[status]}`}>
                    {getLevelStatusLabel(status)}
                  </span>
                )}
              </div>

              {status === "locked" || status === "planned" ? (
                <LockedState
                  title={status === "planned" ? "Niveau planifié" : "Niveau verrouillé"}
                  condition={
                    status === "planned"
                      ? "Ce niveau n'est pas encore publié et aucun score ne peut l'ouvrir."
                      : snapshot?.blockers.find(
                            (blocker) => blocker.code === "previous-level-not-acquired"
                          )?.detail ?? "Le niveau précédent doit d'abord être acquis."
                  }
                />
              ) : (
                <>
                  <ProgressMeter value={Math.round(score)} label={`Score niveau ${level.level}`} />
                  <div className="level-components">
                    {ACTIVITY_KINDS.map((kind) => {
                      const value = snapshot?.components[kind] ?? 0;
                      const missing = snapshot?.missingKinds.includes(kind) ?? true;

                      return (
                        <span key={kind} className={missing ? "level-component missing" : "level-component"}>
                          {ACTIVITY_LABELS[kind]} : {missing ? "non commencé" : `${Math.round(value)} %`}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {/* A learner must never have to guess what is missing.
                  `LockedState` énonce déjà le blocage principal juste au-dessus ;
                  le répéter ici faisait lire deux fois la même phrase. */}
              {snapshot && status !== "passed"
                ? (() => {
                    const remaining =
                      status === "locked" || status === "planned"
                        ? snapshot.blockers.filter(
                            (blocker) => blocker.code !== "previous-level-not-acquired"
                          )
                        : snapshot.blockers;

                    return remaining.length > 0 ? (
                      <ul className="level-blockers">
                        {remaining.map((blocker) => (
                          <li key={blocker.code}>{blocker.detail}</li>
                        ))}
                      </ul>
                    ) : null;
                  })()
                : null}

              {status === "passed" ? (
                <p className="muted">
                  Niveau acquis. Il reste acquis même si un score baisse ensuite.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
