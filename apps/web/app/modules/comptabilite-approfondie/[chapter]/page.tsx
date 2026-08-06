import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHAPTER_PROGRESS_LABELS } from "@finance/content-publication";
import { ChapterFlashcards } from "@/components/compta-approfondie/chapter-flashcards";
import { ChapterSources } from "@/components/compta-approfondie/chapter-sources";
import { ChapterTraining } from "@/components/compta-approfondie/chapter-training";
import { RevisionSheetView } from "@/components/compta-approfondie/revision-sheet-view";
import { SheetViewTracker } from "@/components/compta-approfondie/sheet-view-tracker";
import { UnderstandView } from "@/components/compta-approfondie/understand-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  CHAPTER_SECTION_LABELS,
  CHAPTER_SECTIONS,
  chapterUrl,
  loadChapterFlashcards,
  loadChapterOverview,
  loadChapterProgress,
  loadChapterSheet,
  loadChapterSources,
  loadChapterTraining,
  parseSection,
  type ChapterSection
} from "@/lib/publication/chapter";

/**
 * Page d'un chapitre publié.
 *
 * LES ONGLETS SONT DES PARAMÈTRES DE RECHERCHE, PAS UN ÉTAT CLIENT. `?section=fiche`
 * est partageable, rechargeable et rendu côté serveur ; un état React aurait
 * ramené tout le monde sur « Comprendre » à chaque rafraîchissement et rendu
 * l'onglet impossible à envoyer à quelqu'un.
 *
 * ELLE NE LIT QUE DU CONTENU PUBLIÉ. Aucun import ne relie ce fichier au service
 * de relecture ni au magasin de brouillons : les données viennent de
 * `lib/publication/store.ts`, qui n'ouvre que `content/published/`. Un chapitre
 * sans version active répond 404 — jamais un brouillon en remplacement.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const overview = await loadChapterOverview(chapter);

  if (!overview) {
    return { title: "Chapitre indisponible" };
  }

  return {
    title: `${overview.definition.label} — Comptabilité approfondie`,
    description: overview.definition.summary
  };
}

export default async function ChapterPage({
  params,
  searchParams
}: {
  params: Promise<{ chapter: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { chapter } = await params;
  const overview = await loadChapterOverview(chapter);

  // Chapitre inconnu de la taxonomie, ou connu mais sans aucune version active :
  // dans les deux cas il n'y a rien de publié à montrer, et il n'est pas question
  // d'aller chercher un brouillon.
  //
  // Un magasin injoignable n'est PAS un 404 : répondre « ce chapitre n'existe
  // pas » à cause d'une base tombée serait faux, et durablement — un moteur de
  // recherche retiendrait l'absence. On rend un 503 explicite.
  if (!overview) {
    notFound();
  }

  if (overview.unavailable) {
    return <ChapterUnavailable label={overview.definition.label} />;
  }

  if (!overview.published) {
    notFound();
  }

  const section = parseSection((await searchParams).section);
  const progressView = await loadChapterProgress(chapter);

  return (
    <div className="page-stack chapter-page">
      <PageHeader
        label="Comptabilité approfondie"
        title={overview.definition.label}
        description={overview.definition.summary}
        aside={
          <div className="hero-score">
            <span>Avancement</span>
            <strong>
              {progressView.unavailable
                ? "Indisponible"
                : CHAPTER_PROGRESS_LABELS[progressView.progress.status]}
            </strong>
          </div>
        }
      >
        <p className="muted">
          <Link href="/modules/comptabilite-approfondie">← Tous les chapitres</Link> ·{" "}
          {overview.totalActivities} activité{overview.totalActivities > 1 ? "s" : ""} · environ{" "}
          {overview.estimatedMinutes} min
        </p>

        {progressView.unavailable ? (
          <p className="muted">
            L&apos;avancement n&apos;a pas pu être chargé. Le contenu du chapitre reste consultable.
          </p>
        ) : null}

        {!progressView.personal ? (
          <p className="muted">
            <Link href="/login">Se connecter</Link> pour enregistrer sa progression. La consultation
            ne l&apos;exige pas.
          </p>
        ) : null}
      </PageHeader>

      <nav className="chapter-tabs" aria-label="Sections du chapitre">
        <ul>
          {CHAPTER_SECTIONS.map((candidate) => (
            <li key={candidate}>
              <Link
                href={chapterUrl(chapter, candidate)}
                aria-current={candidate === section ? "page" : undefined}
                className={candidate === section ? "chapter-tab chapter-tab--active" : "chapter-tab"}
              >
                {CHAPTER_SECTION_LABELS[candidate]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ChapterSectionContent chapter={chapter} section={section} />
    </div>
  );
}

/**
 * Le chapitre existe, mais le magasin n'a pas répondu.
 *
 * Aucun détail technique n'est rendu : ni nom de base, ni message d'erreur, ni
 * chaîne de connexion. La cause est journalisée côté serveur, où elle sert à
 * quelqu'un.
 */
function ChapterUnavailable({ label }: { label: string }) {
  return (
    <div className="page-stack">
      <PageHeader
        label="Comptabilité approfondie"
        title={label}
        description="Ce chapitre n'a pas pu être chargé."
      />
      <EmptyState
        title="Contenu momentanément indisponible"
        description="Le contenu publié de ce chapitre n'est pas joignable pour l'instant. Réessayez dans quelques instants."
        action={<Link href="/modules/comptabilite-approfondie">Retour au module</Link>}
      />
    </div>
  );
}

async function ChapterSectionContent({
  chapter,
  section
}: {
  chapter: string;
  section: ChapterSection;
}) {
  if (section === "sources") {
    const sources = await loadChapterSources(chapter);

    return <ChapterSources sources={sources} />;
  }

  if (section === "reviser") {
    const cards = await loadChapterFlashcards(chapter);

    if (cards.length === 0) {
      return (
        <EmptyState
          title="Aucune carte publiée"
          description="Ce chapitre ne propose pas encore de flashcards. Les autres sections restent disponibles."
        />
      );
    }

    return <ChapterFlashcards chapter={chapter} cards={cards} />;
  }

  if (section === "entrainer") {
    const training = await loadChapterTraining(chapter);
    const total =
      training.calculations.length +
      training.journalEntries.length +
      training.diagnoses.length +
      training.cases.length;

    if (total === 0) {
      return (
        <EmptyState
          title="Aucun exercice publié"
          description="Ce chapitre ne propose pas encore d'activité notée. La fiche et les cartes restent disponibles."
        />
      );
    }

    return <ChapterTraining chapter={chapter} training={training} />;
  }

  const view = await loadChapterSheet(chapter);

  if (!view) {
    return (
      <EmptyState
        title="Aucune fiche publiée"
        description="Ce chapitre ne propose pas encore de fiche de révision. Les exercices et les cartes restent disponibles."
      />
    );
  }

  return (
    <>
      <SheetViewTracker chapter={chapter} artifactId={view.artifactId} />
      {section === "fiche" ? (
        <RevisionSheetView view={view} chapter={chapter} />
      ) : (
        <UnderstandView sheet={view.sheet} chapter={chapter} />
      )}
    </>
  );
}
