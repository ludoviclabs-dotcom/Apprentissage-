import "server-only";
import { COMPTA_APPROFONDIE_MODULE, type ChapterActivityKind } from "@finance/content-publication";
import {
  addErrorJournalEntry,
  hasChapterActivity,
  openChapterRemediation,
  recordChapterActivity
} from "@finance/db";
import { REVIEW_INTERVAL_DAYS, addDays, type ErrorCategory } from "@finance/domain";

/**
 * Enregistrement des activités et des erreurs d'un chapitre publié.
 *
 * SANS COMPTE, RIEN N'EST ÉCRIT, ET CE N'EST PAS UNE PANNE. Le contenu public se
 * consulte sans s'identifier ; ce qui exige un compte est la mémoire de ce qu'on
 * en a fait. Les fonctions rendent donc `false` plutôt que de lever : l'écran
 * continue de corriger l'exercice et d'afficher la correction, il annonce
 * simplement que l'avancement n'est pas conservé.
 *
 * LE CARNET D'ERREURS EXISTANT EST RÉUTILISÉ TEL QUEL. `error_journal` porte
 * déjà les colonnes dont le cahier des charges parle — catégorie, résumé,
 * compétences, action suivante — et sa page `/revisions/carnet-erreurs` sait les
 * afficher. Créer un second carnet propre au chapitre aurait donné à l'apprenant
 * deux listes d'erreurs à consulter, ce qui est une de trop.
 */

export interface RecordActivityInput {
  userId: string | null;
  chapter: string;
  kind: ChapterActivityKind;
  artifactId: string;
  succeeded: boolean;
  /** 0–20 pour une activité notée, null pour une consultation. */
  score: number | null;
  /** Quand vrai, n'écrit rien si l'activité a déjà été enregistrée. */
  once?: boolean;
}

export async function recordActivity(input: RecordActivityInput): Promise<boolean> {
  if (!input.userId) {
    return false;
  }

  try {
    if (input.once) {
      const already = await hasChapterActivity(
        input.userId,
        input.chapter,
        input.kind,
        input.artifactId
      );

      if (already) {
        return true;
      }
    }

    const result = await recordChapterActivity(input.userId, {
      module: COMPTA_APPROFONDIE_MODULE,
      chapter: input.chapter,
      kind: input.kind,
      artifactId: input.artifactId,
      succeeded: input.succeeded,
      score: input.score
    });

    return result.status === "written";
  } catch (error) {
    // Une progression non enregistrée ne doit pas faire échouer une correction :
    // l'apprenant a droit à son retour même si la base est indisponible.
    console.error("[chapter-activity]", error);
    return false;
  }
}

export interface RecordFailureInput {
  userId: string | null;
  chapter: string;
  artifactId: string;
  title: string;
  category: ErrorCategory;
  summary: string;
  nextAction: string;
  competencyIds: readonly string[];
}

/**
 * Inscrit un échec au carnet d'erreurs, avec la remédiation qui va avec.
 *
 * CIBLÉE, PAS GÉNÉRIQUE. `nextAction` désigne la reprise exacte — le sens d'une
 * ligne, une règle d'arrondi, la typologie des erreurs — et non « revoir le
 * chapitre » : renvoyer systématiquement vers l'ensemble du chapitre est
 * précisément ce que le cahier des charges refuse, et c'est aussi ce qui décourage
 * de rouvrir le carnet.
 *
 * AUCUNE DONNÉE SENSIBLE. Ni la réponse saisie, ni la moindre note libre :
 * seulement quelle notion a manqué et quoi faire ensuite.
 */
export async function recordFailure(input: RecordFailureInput): Promise<boolean> {
  if (!input.userId) {
    return false;
  }

  const nextAction = input.nextAction.slice(0, 500);

  try {
    const written = await addErrorJournalEntry(input.userId, {
      exerciseId: input.artifactId,
      correctionId: `${input.artifactId}:${input.chapter}`,
      category: input.category,
      summary: input.summary.slice(0, 500),
      competencyIds: [...input.competencyIds],
      nextAction
    });

    // La remédiation est datée du retest de l'échelle du domaine : un échec vaut
    // `forgotten`, donc un jour. Choisir une autre date ici ferait diverger la
    // remédiation de la file de révision, et l'apprenant croiserait la même
    // notion deux jours de suite pour la même raison.
    await openChapterRemediation(input.userId, {
      artifactId: input.artifactId,
      competencyId: input.competencyIds[0] ?? null,
      microLesson: `Reprendre avant de réessayer : ${input.title}`,
      nextAction,
      dueAt: addDays(new Date(), REVIEW_INTERVAL_DAYS.forgotten)
    });

    return written;
  } catch (error) {
    console.error("[chapter-error-journal]", error);
    return false;
  }
}
