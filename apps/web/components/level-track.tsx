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
  "in-progress": "needs-review",
  acquired: "ready"
};

export function LevelTrack({
  levels,
  snapshots,
  passingScore,
  rulesLabel
}: {
  levels: ModuleLevelDefinition[];
  snapshots: LevelSnapshot[];
  passingScore: number;
  rulesLabel: string;
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

          return (
            <li key={level.id} className={`level-row ${status}`} data-level-status={status}>
              <div className="level-row-head">
                <span className="level-index" aria-hidden="true">
                  N{level.level}
                </span>
                <div>
                  <strong>{level.title}</strong>
                  <p className="muted">{level.objective}</p>
                </div>
                <span className={`state-token ${STATUS_TOKEN[status]}`}>{getLevelStatusLabel(status)}</span>
              </div>

              {status === "locked" ? (
                <LockedState
                  title="Niveau verrouillé"
                  condition={`Termine le niveau ${level.level - 1} pour ouvrir celui-ci.`}
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

              {/* A learner must never have to guess what is missing. */}
              {snapshot && snapshot.blockers.length > 0 && status !== "acquired" ? (
                <ul className="level-blockers">
                  {snapshot.blockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.detail}</li>
                  ))}
                </ul>
              ) : null}

              {status === "acquired" ? (
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
