import type { Metadata } from "next";
import Link from "next/link";
import { CompetencyMap } from "@/components/competency-map";
import { CorrectionSummary } from "@/components/correction-summary";
import { DomainBadge } from "@/components/domain-badge";
import { ExercisePanel } from "@/components/exercise-panel";
import { LearningCard } from "@/components/learning-card";
import { MasteryRing } from "@/components/mastery-ring";
import { ProgressMeter } from "@/components/progress-meter";
import { NextActionCard } from "@/components/ui/next-action-card";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import { getDashboardModel } from "@/lib/view-model";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";

export const metadata: Metadata = {
  title: "Tableau de bord",
  description:
    "Reprendre le parcours là où il s'est arrêté : prochaine action, révisions dues et niveau par domaine."
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [model, progression] = await Promise.all([
    getDashboardModel(user?.id),
    getCanonicalLearningProgression(user?.id)
  ]);
  const runtime = getRuntimeFlags();
  const totalDocuments = model.sourcePacks.reduce((sum, pack) => sum + pack.documentsCount, 0);
  const totalChunks = model.sourcePacks.reduce((sum, pack) => sum + pack.chunksCount, 0);

  // Un score n'est « le tien » que si un compte le porte. Les moyennes et
  // priorités du socle seedé ne sont même pas rendues sans compte : les appeler
  // « exemples » laisserait encore croire à un historique personnel.
  const personal = user !== null;

  // `latestCorrection` est volontairement exclu de cette porte : un compte qui
  // vient d'être créé n'a encore soumis aucune correction, et ce n'est pas une
  // absence de catalogue. Le CTA « Continuer » doit rester visible dès la
  // première connexion, pas seulement après une première soumission.
  if (!model.currentDay || !model.currentLesson || !model.currentExercise) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Tableau de bord</span>
            <h1>Aucune donnée d'apprentissage à afficher</h1>
            <p>
              {runtime.databaseActive
                ? "La base est active mais ne contient pas encore de parcours, d'exercice ou de correction. Lance `pnpm db:seed` pour charger le socle."
                : "Le socle seedé n'a pas pu être chargé. Vérifie l'installation des dépendances puis relance `pnpm dev`."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  // Les compteurs de l'anneau viennent des niveaux publiés, pas des
  // compétences seedées : un niveau acquis est un fait enregistré, une force de
  // compétence sans compte appartiendrait à quelqu'un qui n'existe pas encore.
  const publishedLevels = progression.tracks.flatMap((track) => track.publishedLevels);
  const acquired = publishedLevels.filter((level) => level.snapshot.status === "passed").length;
  const inProgress = publishedLevels.filter(
    (level) => level.snapshot.status === "in_progress"
  ).length;
  const remaining = Math.max(0, publishedLevels.length - acquired - inProgress);
  const share = (count: number) =>
    publishedLevels.length === 0 ? 0 : (count / publishedLevels.length) * 100;

  return (
    <div className="page-stack home-page">
      <div className="home-hero-grid">
        <section className="home-hero">
          {/* Halo décoratif : purement ornemental, donc masqué à l'assistance. */}
          <span className="home-hero-glow" aria-hidden="true" />

          <span className="section-label">{personal ? "Tableau de bord" : "Démonstration"}</span>
          <h1>
            {personal
              ? "Remise à niveau pilotée par compétences"
              : "Découvre le cockpit d'apprentissage"}
          </h1>
          <p>
            {personal
              ? "Ton état vient du curriculum versionné, des corrections et des révisions réellement enregistrées."
              : "Exemple de parcours en lecture neutre : aucun score, statut ou travail seedé n'est présenté comme personnel."}
          </p>

          {progression.nextAction ? (
            <NextActionCard
              href={progression.nextAction.href}
              label={progression.nextAction.label}
              title={progression.nextAction.title}
              meta={personal ? "État canonique du curriculum" : "Correction sans écriture en base"}
            />
          ) : null}

          {personal ? null : <span className="state-token">Jeu de démonstration</span>}
        </section>

        <section className="home-ring" aria-labelledby="anneau-titre">
          <span className="section-label" id="anneau-titre">
            Maîtrise du parcours
          </span>

          <MasteryRing
            figure={personal && progression.score !== null ? `${Math.round(progression.score)}%` : null}
            caption={personal ? "maîtrise" : "exemple neutre"}
            segments={[
              { tone: "acquired", percent: share(acquired) },
              { tone: "in-progress", percent: share(inProgress) }
            ]}
            label={
              personal && progression.score !== null
                ? `Maîtrise globale ${Math.round(progression.score)} pour cent, sur ${publishedLevels.length} niveaux publiés.`
                : `Aucun score personnel. ${publishedLevels.length} niveaux publiés au catalogue.`
            }
          />

          {/* La légende chiffrée porte l'information que l'anneau ne peut pas
              porter quand il est vide, et double la couleur par un libellé. */}
          <ul className="home-ring-legend">
            <li>
              <span className="home-ring-dot acquired" aria-hidden="true" />
              Acquis <strong>{acquired}</strong>
            </li>
            <li>
              <span className="home-ring-dot in-progress" aria-hidden="true" />
              En cours <strong>{inProgress}</strong>
            </li>
            <li>
              <span className="home-ring-dot remaining" aria-hidden="true" />
              Restant <strong>{remaining}</strong>
            </li>
          </ul>
        </section>
      </div>

      <section className="demo-proof-grid" aria-label="Garanties de la démonstration">
        <article>
          <span>Mode</span>
          <strong>{runtime.publicDemo ? "Lecture seule" : "Privé local"}</strong>
          <p>Imports, uploads et données personnelles restent bloqués en démo publique.</p>
        </article>
        <article>
          <span>Sources</span>
          <strong>{totalDocuments} documents</strong>
          <p>{model.sourcePacks.length} packs · {totalChunks} extraits indexés alimentent les citations.</p>
        </article>
        <article>
          <span>Correction</span>
          <strong>
            {personal && model.latestCorrection
              ? `${model.latestCorrection.rubricScores.length} critères`
              : "À essayer"}
          </strong>
          <p>
            {personal && model.latestCorrection
              ? "Le score sépare barème, erreurs, remédiation et preuves citées."
              : "S'affiche dès la première correction : barème, erreurs, remédiation et preuves citées."}
          </p>
        </article>
      </section>

      {/* Espace pédagogique : filet teal, comme sur la page module. */}
      <section className="panel home-review">
        <div className="panel-heading">
          <div>
            <span className="section-label">Révision active</span>
            <h2>
              {personal
                ? model.reviewQueue.dueCount === 0
                  ? "Rien n'est dû aujourd'hui"
                  : `${model.reviewQueue.dueCount} item(s) à revoir`
                : "Exemple de session, sans historique"}
            </h2>
          </div>
          <Link className="primary-action" href="/revisions">
            Réviser 5 min
          </Link>
        </div>
        <p className="muted">
          {personal && model.remediations.length > 0
            ? `${model.remediations.length} remédiation(s) ouverte(s) : chaque oubli programme un retest daté.`
            : personal
              ? "La file remonte les items dus, réponse masquée jusqu'à la révélation."
              : "Les cartes illustrent le rappel actif, sans date ni statut attribué au visiteur."}
        </p>
      </section>

      <section className="panel corpus-search home-search">
        <div className="panel-heading">
          <div>
            <span className="section-label">Recherche corpus</span>
            <h2>Interroger le corpus documentaire</h2>
          </div>
        </div>
        <form action="/recherche" method="get" className="search-form">
          <input
            type="search"
            name="q"
            placeholder="Rechercher une notion, une règle, une écriture..."
            aria-label="Rechercher dans le corpus"
          />
          <button type="submit">Rechercher</button>
        </form>
        <p className="muted">Recherche locale sur {totalChunks} extraits dérivés et cités.</p>
      </section>

      {personal ? (
        <section className="domain-overview" aria-label="Niveau par domaine">
          {model.domains.map((domain) => (
            <article key={domain.id} className="domain-card">
              <div className="domain-card-title">
                <span style={{ backgroundColor: domain.softAccent, color: domain.accent }}>{domain.shortName}</span>
                <strong>{domain.average}%</strong>
              </div>
              <p>{domain.description}</p>
              <ProgressMeter value={domain.average} color={domain.accent} label={`Progression ${domain.name}`} />
            </article>
          ))}
        </section>
      ) : null}

      <section className="dashboard-grid">
        {personal ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Priorités</span>
                <h2>À traiter cette semaine</h2>
              </div>
            </div>
            <div className="priority-list">
              {model.priorities.map((priority) => (
                <article key={priority.id} className="priority-row">
                  <DomainBadge domainId={priority.domainId} />
                  <div>
                    <strong>{priority.title}</strong>
                    <p>{priority.reason}</p>
                    <small>{priority.action}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel">
          <span className="section-label">Curricula publiés</span>
          <h2>Une progression, deux tracks cohérents</h2>
          <div className="priority-list">
            {progression.tracks.map((track) => (
              <article
                key={track.track.trackId}
                className="priority-row"
                data-canonical-track={track.track.trackId}
                data-canonical-score={track.score ?? "neutral"}
              >
                <span className="state-token processing">
                  {track.score === null ? "Exemple" : `${Math.round(track.score)} %`}
                </span>
                <div>
                  <strong>{track.track.title}</strong>
                  <p>{track.nextAction?.title ?? "Parcours terminé"}</p>
                  <small>{track.sourceLabel}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <div className="two-column">
        <LearningCard lesson={model.currentLesson} />
        <ExercisePanel exercise={model.currentExercise} />
      </div>

      <div className="two-column align-start">
        {personal && model.latestCorrection ? (
          <CorrectionSummary correction={model.latestCorrection} />
        ) : (
          <section className="panel">
            <span className="section-label">Dernière correction</span>
            <h2>Aucune correction pour l'instant</h2>
            <p className="muted">
              Réponds à un exercice pour voir apparaître ici le barème, les erreurs et la remédiation.
            </p>
          </section>
        )}
        {personal ? (
          <CompetencyMap competencies={model.weakestCompetencies} />
        ) : (
          <section className="panel">
            <span className="section-label">État neutre</span>
            <h2>Aucune faiblesse personnelle simulée</h2>
            <p className="muted">
              Les priorités et compétences apparaîtront après des réponses corrigées et enregistrées.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
