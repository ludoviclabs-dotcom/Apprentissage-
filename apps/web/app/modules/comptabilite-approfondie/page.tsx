import type { Metadata } from "next";
import Link from "next/link";
import { CHAPTER_PROGRESS_LABELS } from "@finance/content-publication";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  chapterUrl,
  loadChapterProgress,
  loadModuleOverview,
  type ChapterOverview
} from "@/lib/publication/chapter";

export const metadata: Metadata = {
  title: "Comptabilité approfondie",
  description:
    "Financement long terme, opérations sur le capital et travaux de clôture avancés : un parcours guidé, chapitre par chapitre."
};

/**
 * Page d'entrée du module.
 *
 * ELLE N'AFFICHE QUE CE QUI EST PUBLIÉ. Un chapitre inscrit à la taxonomie mais
 * dont rien n'est publié apparaît « à venir », sans lien, sans compteur et
 * surtout sans pourcentage : inventer « 0 % de maîtrise » sur un chapitre qui
 * n'existe pas encore reviendrait à mesurer le vide.
 *
 * Dynamique, et pas seulement par commodité : la progression affichée est celle
 * du lecteur. Une page de module mise en cache partagé servirait l'avancement du
 * visiteur précédent, ce que l'étape 17 interdit explicitement.
 */
export const dynamic = "force-dynamic";

function activityBreakdown(chapter: ChapterOverview): string {
  const parts: string[] = [];
  const labels: Array<[string, string, string]> = [
    ["smart_revision_sheet", "fiche", "fiches"],
    ["flashcard", "carte", "cartes"],
    ["calculation_exercise", "calcul", "calculs"],
    ["journal_entry_exercise", "écriture", "écritures"],
    ["error_diagnosis_exercise", "diagnostic", "diagnostics"],
    ["progressive_case", "mini-cas", "mini-cas"]
  ];

  for (const [key, singular, plural] of labels) {
    const count = chapter.counts[key] ?? 0;

    if (count > 0) {
      parts.push(`${count} ${count > 1 ? plural : singular}`);
    }
  }

  return parts.join(" · ");
}

export default async function ComptaApprofondiePage() {
  const overview = await loadModuleOverview();

  // La progression n'est chargée que pour les chapitres réellement publiés :
  // interroger la base pour un chapitre qui n'a rien à offrir serait une requête
  // dont la réponse est connue d'avance.
  const progressByChapter = new Map(
    await Promise.all(
      overview.availableChapters.map(
        async (chapter) => [chapter.definition.slug, await loadChapterProgress(chapter.definition.slug)] as const
      )
    )
  );

  const resumeTarget = overview.availableChapters.find((chapter) => {
    const state = progressByChapter.get(chapter.definition.slug);

    return state?.progress.status === "in-progress" || state?.progress.status === "to-review";
  });

  const lastActivityAt = [...progressByChapter.values()]
    .map((state) => state.progress.lastActivityAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);

  return (
    <div className="page-stack">
      <PageHeader
        label="Module"
        title={overview.module.label}
        description={overview.module.description}
        aside={
          <div className="hero-score">
            <span>Chapitres disponibles</span>
            <strong>
              {overview.availableChapters.length} / {overview.chapters.length}
            </strong>
          </div>
        }
      />

      <section className="panel">
        <h2 className="panel-heading">Objectifs</h2>
        <ul className="bullet-list">
          {overview.module.objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>

        <h3>Prérequis</h3>
        <ul className="bullet-list">
          {overview.module.prerequisites.map((prerequisite) => (
            <li key={prerequisite}>{prerequisite}</li>
          ))}
        </ul>
      </section>

      {/*
        « Indisponible » et « rien de publié » sont deux écrans différents.
        Confondre les deux ferait passer une base injoignable pour un module en
        préparation — le visiteur repartirait rassuré et l'exploitant ne verrait
        rien.
      */}
      {overview.unavailable ? (
        <EmptyState
          title="Contenu momentanément indisponible"
          description="Les chapitres de ce module n'ont pas pu être chargés. Réessayez dans quelques instants."
        />
      ) : overview.availableChapters.length === 0 ? (
        <EmptyState
          title="Aucun chapitre publié"
          description="Ce module est en préparation. Les chapitres apparaîtront ici au fur et à mesure de leur publication."
        />
      ) : (
        <section className="panel">
          <h2 className="panel-heading">Chapitres disponibles</h2>

          {resumeTarget ? (
            <p>
              <Link className="primary-action" href={chapterUrl(resumeTarget.definition.slug)}>
                Reprendre «&nbsp;{resumeTarget.definition.label}&nbsp;»
              </Link>
              {lastActivityAt ? (
                <span className="muted">
                  {" "}
                  Dernière activité le {new Date(lastActivityAt).toLocaleDateString("fr-FR")}.
                </span>
              ) : null}
            </p>
          ) : null}

          <ul className="chapter-list">
            {overview.availableChapters.map((chapter) => {
              const state = progressByChapter.get(chapter.definition.slug);

              return (
                <li key={chapter.definition.slug} className="chapter-card">
                  <h3>
                    <Link href={chapterUrl(chapter.definition.slug)}>{chapter.definition.label}</Link>
                  </h3>
                  <p>{chapter.definition.summary}</p>
                  <p className="muted">
                    {chapter.totalActivities} activité{chapter.totalActivities > 1 ? "s" : ""} ·{" "}
                    environ {chapter.estimatedMinutes} min · {activityBreakdown(chapter)}
                  </p>
                  <p className="chapter-progress">
                    <span className={`status-token status-${state?.progress.status ?? "not-started"}`}>
                      {state?.unavailable
                        ? "Avancement indisponible"
                        : CHAPTER_PROGRESS_LABELS[state?.progress.status ?? "not-started"]}
                    </span>
                    {state?.personal && !state.unavailable && state.progress.availableDimensions > 0 ? (
                      <span className="muted">
                        {" "}
                        {state.progress.acquiredDimensions} / {state.progress.availableDimensions} objectifs
                        atteints
                      </span>
                    ) : null}
                    {state && !state.personal ? (
                      <span className="muted">
                        {" "}
                        — <Link href="/login">se connecter</Link> pour enregistrer sa progression
                      </span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {overview.upcomingChapters.length > 0 ? (
        <section className="panel">
          <h2 className="panel-heading">À venir</h2>
          <p className="muted">
            Ces chapitres font partie du programme mais ne sont pas encore publiés. Aucun avancement
            n&apos;est mesuré tant qu&apos;il n&apos;y a rien à travailler.
          </p>
          <ul className="chapter-list">
            {overview.upcomingChapters.map((chapter) => (
              <li key={chapter.definition.slug} className="chapter-card chapter-card-upcoming">
                <h3>{chapter.definition.label}</h3>
                <p>{chapter.definition.summary}</p>
                <p className="muted">À venir</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
