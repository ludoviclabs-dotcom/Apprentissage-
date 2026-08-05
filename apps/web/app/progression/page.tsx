import type { Metadata } from "next";
import Link from "next/link";
import { getWeakestCompetencies } from "@finance/domain";
import { CompetencyMatrix } from "@/components/competency-matrix";
import { DomainBadge } from "@/components/domain-badge";
import { MasteryRing } from "@/components/mastery-ring";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";
import { statusLabel } from "@/lib/status-labels";
import { getProgressModel } from "@/lib/view-model";

export const metadata: Metadata = {
  title: "Progression — Compétences",
  description:
    "Maîtrise par compétence : notions fragiles, badges attribués dans le temps et analyse des erreurs."
};

/** Une compétence sous ce seuil est « fragile » — même seuil que `CompetencyMap`. */
const FRAGILE_BELOW = 55;
/** Au-dessus, elle compte comme acquise et peut porter un badge. */
const MASTERED_FROM = 75;

export default async function ProgressionPage() {
  const user = await getCurrentUser();
  const [model, progression] = await Promise.all([
    getProgressModel(user?.id),
    getCanonicalLearningProgression(user?.id)
  ]);

  const personal = user !== null;
  const weakest = getWeakestCompetencies(model.competencies, 6);

  // En démonstration, `getCompetencies` renvoie le jeu seedé : seul le VOLUME
  // du catalogue est un fait partageable. Les forces, elles, appartiendraient
  // à quelqu'un — et ce quelqu'un n'existe pas encore (ADR-011).
  const acquired = personal
    ? model.competencies.filter((competency) => competency.strength >= MASTERED_FROM).length
    : null;
  const fragile = personal
    ? model.competencies.filter((competency) => competency.strength < FRAGILE_BELOW).length
    : null;

  const caption = `${model.competencies.length} compétences`;

  /**
   * Un badge se mérite dans la durée : `status === "mastered"` est le badge
   * attribué, une force élevée sans ce statut est un badge en cours. Les deux
   * apparaissent, distingués par leur glyphe — sinon la page ne dirait pas au
   * lecteur qu'il est à deux semaines d'en obtenir un.
   */
  const badgeable = personal
    ? model.competencies.filter((competency) => competency.strength >= MASTERED_FROM)
    : [];

  return (
    <div className="page-stack">
      <PageHeader
        label="Progression"
        title="Maîtrise par compétence, pas score global opaque"
        description="La progression met en avant les notions fragiles, les erreurs récurrentes et la prochaine action utile."
      />

      <div className="progression-bento">
        <section className="cta-panel ring-panel" aria-labelledby="anneau-titre">
          <span className="section-label" id="anneau-titre">
            Anneau de maîtrise
          </span>

          <MasteryRing score={progression.score} caption={caption} />

          {personal ? (
            <div className="ring-figures">
              <div>
                <strong>{acquired}</strong>
                <span>acquises</span>
              </div>
              <div>
                <strong>{fragile}</strong>
                <span>fragiles</span>
              </div>
            </div>
          ) : null}

          <p className="ring-note">
            {personal
              ? "Calculé sur les niveaux publiés de tes parcours, à partir des exercices corrigés."
              : "Exemple neutre — aucun score personnel n'est calculé en mode découverte."}
          </p>
        </section>

        <CompetencyMatrix tracks={progression.tracks} personal={personal} />
      </div>

      {personal ? (
        <div className="two-column align-start">
          <section className="panel fragile-panel" aria-labelledby="fragiles-titre">
            <div>
              <span className="section-label section-label--warning">Notions fragiles</span>
              <h2 id="fragiles-titre">À consolider en priorité</h2>
            </div>
            <div className="fragile-list">
              {weakest.map((competency) => (
                <article key={competency.id} className="fragile-row">
                  <div>
                    <strong>{competency.name}</strong>
                    <span>{competency.focus}</span>
                  </div>
                  <span className="fragile-score">{competency.strength} %</span>
                  <Link className="secondary-action action-sm inline-link" href="/revisions">
                    Retravailler
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="panel" id="badges" aria-labelledby="badges-titre">
            <div>
              <span className="section-label">Badges de maîtrise</span>
              <h2 id="badges-titre">Attribués seulement dans le temps</h2>
            </div>
            {badgeable.length === 0 ? (
              <p className="muted">
                Aucun badge encore. Une compétence en gagne un lorsqu'elle tient {MASTERED_FROM} %
                sur plusieurs semaines — c'est la stabilité qui est récompensée, pas un bon jour.
              </p>
            ) : null}
            <div className="badge-list">
              {badgeable.map((competency) => {
                const earned = competency.status === "mastered";

                return (
                  <article
                    key={competency.id}
                    className={earned ? "badge-row earned" : "badge-row pending"}
                  >
                    {/* Le glyphe double l'état porté par le fond : « ✓ » pour un
                        badge attribué, « ◔ » pour un badge en cours. */}
                    <span className="badge-mark" aria-hidden="true">
                      {earned ? "✓" : "◔"}
                    </span>
                    <div>
                      <strong>{competency.name}</strong>
                      <span>
                        force {competency.strength} % · {statusLabel(competency.status)}
                      </span>
                    </div>
                    <DomainBadge domainId={competency.domainId} />
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <section className="panel">
          <span className="section-label">Exemple de parcours</span>
          <h2>Aucune maîtrise personnelle simulée</h2>
          <p className="muted">
            La matrice ci-dessus montre la structure des parcours, pas un niveau atteint. Les
            notions fragiles, les badges et l'analyse des erreurs se construisent à partir
            d'exercices réellement corrigés sous un compte.
          </p>
          <Link className="primary-action inline-link" href="/exercices/session-decouverte">
            Essayer la session découverte
          </Link>
        </section>
      )}

      {personal ? (
        <section className="panel error-analysis" aria-labelledby="erreurs-titre">
          <div>
            <span className="section-label">Analyse des erreurs</span>
            <h2 id="erreurs-titre">Actions recommandées</h2>
          </div>
          {model.errorJournal.length === 0 ? (
            <p className="muted">
              Aucune erreur relevée pour le moment. Le carnet se remplit à partir des corrections.
            </p>
          ) : (
            <div className="error-grid">
              {model.errorJournal.map((entry) => (
                <article key={entry.id} className="error-row">
                  <span className="state-token needs-review">{entry.category}</span>
                  <div>
                    <strong>{entry.summary}</strong>
                    <span>
                      {entry.nextAction} · {entry.createdAt.slice(0, 10)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          <Link className="secondary-action inline-link" href="/revisions/carnet-erreurs">
            Ouvrir le carnet d'erreurs
          </Link>
        </section>
      ) : null}
    </div>
  );
}
