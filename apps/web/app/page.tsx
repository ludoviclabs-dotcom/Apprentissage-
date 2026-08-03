import type { Metadata } from "next";
import Link from "next/link";
import { CompetencyMap } from "@/components/competency-map";
import { CorrectionSummary } from "@/components/correction-summary";
import { DomainBadge } from "@/components/domain-badge";
import { ExercisePanel } from "@/components/exercise-panel";
import { LearningCard } from "@/components/learning-card";
import { ProgressMeter } from "@/components/progress-meter";
import { NextActionCard } from "@/components/ui/next-action-card";
import { PageHeader } from "@/components/ui/page-header";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import { statusLabel } from "@/lib/status-labels";
import { getDashboardModel } from "@/lib/view-model";
import { getDomain } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Tableau de bord",
  description:
    "Reprendre le parcours là où il s'est arrêté : prochaine action, révisions dues et niveau par domaine."
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const model = await getDashboardModel(user?.id);
  const runtime = getRuntimeFlags();
  const totalDocuments = model.sourcePacks.reduce((sum, pack) => sum + pack.documentsCount, 0);
  const totalChunks = model.sourcePacks.reduce((sum, pack) => sum + pack.chunksCount, 0);

  // Un score n'est « le tien » que si un compte le porte. Sans compte, les
  // moyennes viennent du socle seedé et sont présentées comme démonstration,
  // jamais comme progression personnelle.
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

  return (
    <div className="page-stack">
      <PageHeader
        label={personal ? "Tableau de bord" : "Démonstration"}
        title={personal ? "Remise à niveau pilotée par compétences" : "Découvre le cockpit d'apprentissage"}
        description={
          personal
            ? `Aujourd'hui : jour ${model.currentDay.day} sur ${model.learningPath.durationDays}, avec une priorité sur la logique avant l'automatisme.`
            : "Parcours guidé, exercices corrigés et révision active. Les chiffres affichés viennent d'un jeu de démonstration, pas d'une progression personnelle."
        }
        aside={
          personal ? (
            <div className="hero-score">
              <span>Niveau global</span>
              <strong>{model.overallAverage}%</strong>
            </div>
          ) : (
            <span className="state-token">Jeu de démonstration</span>
          )
        }
      >
        {personal ? (
          <NextActionCard
            href={`/exercices/${model.currentExercise.id}`}
            label="Continuer"
            title={model.currentExercise.title}
            meta={`${model.currentDay.minutes} min · jour ${model.currentDay.day} du parcours`}
          />
        ) : (
          <NextActionCard
            href={`/exercices/${model.currentExercise.id}`}
            label="Découvrir"
            title="Un exercice guidé"
            meta="Correction structurée et sources citées"
          />
        )}
      </PageHeader>

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
            {model.latestCorrection ? `${model.latestCorrection.rubricScores.length} critères` : "À venir"}
          </strong>
          <p>
            {model.latestCorrection
              ? "Le score sépare barème, erreurs, remédiation et preuves citées."
              : "S'affiche dès la première correction : barème, erreurs, remédiation et preuves citées."}
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Révision active</span>
            <h2>
              {model.reviewQueue.dueCount === 0
                ? "Rien n'est dû aujourd'hui"
                : `${model.reviewQueue.dueCount} item(s) à revoir`}
            </h2>
          </div>
          <Link className="primary-action" href="/revisions">
            Réviser 5 min
          </Link>
        </div>
        <p className="muted">
          {model.remediations.length > 0
            ? `${model.remediations.length} remédiation(s) ouverte(s) : chaque oubli programme un retest daté.`
            : "La file remonte les items dus, réponse masquée jusqu'à la révélation."}
        </p>
      </section>

      <section className="panel corpus-search">
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

      <section className="dashboard-grid">
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

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Parcours 30 jours</span>
              <h2>{model.learningPath.name}</h2>
            </div>
          </div>
          <div className="timeline-list">
            {model.learningPath.days.map((day) => {
              const domain = getDomain(day.domainId);

              return (
                <article key={day.day} className={`timeline-row ${day.status}`}>
                  <span style={{ borderColor: domain.accent }}>{day.day}</span>
                  <div>
                    <strong>{day.title}</strong>
                    <small>
                      {domain.shortName} · {day.minutes} min · {statusLabel(day.status)}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <div className="two-column">
        <LearningCard lesson={model.currentLesson} />
        <ExercisePanel exercise={model.currentExercise} />
      </div>

      <div className="two-column align-start">
        {model.latestCorrection ? (
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
        <CompetencyMap competencies={model.weakestCompetencies} />
      </div>
    </div>
  );
}
