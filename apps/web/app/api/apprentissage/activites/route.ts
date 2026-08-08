import {
  CHAPTER_ACTIVITY_KINDS,
  COMPTA_APPROFONDIE_MODULE,
  errorCategoryLabels,
  gradeCalculation,
  gradeCaseStep,
  gradeErrorDiagnosis,
  gradeJournalEntry,
  getPublicChapter,
  isGradedVersion,
  normativeContextOf,
  revealFlashcard,
  revealHint,
  type ChapterActivityKind
} from "@finance/content-publication";
import { REVIEW_INTERVAL_DAYS, addDays, type ReviewRating } from "@finance/domain";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordActivity, recordCardReview, recordFailure } from "@/lib/publication/activity";
import {
  loadPublishedVersion,
  PublicationStoreUnavailableError,
  PublishedContentUnavailableError
} from "@/lib/publication/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les activités d'un chapitre publié : révéler, noter, enregistrer.
 *
 * TOUT PASSE PAR LE SERVEUR, ET C'EST LA CONDITION DE LA NOTATION DÉTERMINISTE.
 * La réponse attendue d'un exercice n'atteint jamais le navigateur avant la
 * tentative ; elle ne pouvait donc pas y être comparée. Le corollaire est que
 * deux apprenants obtiennent la même correction pour la même réponse, et qu'un
 * apprenant ne peut pas lire la réponse dans le source de la page.
 *
 * AUCUN APPEL DE MODÈLE. Chaque correction rendue ici sort de
 * `@finance/content-publication`, qui délègue aux évaluateurs typés du domaine.
 * La justification libre d'un diagnostic est enregistrée sans être notée.
 *
 * UNE VERSION ARCHIVÉE NE RÉPOND PLUS. `loadPublishedVersion` lit l'instantané,
 * mais la vérification du statut est faite ici : un identifiant récupéré avant
 * un archivage ne doit pas rester une porte ouverte sur du contenu retiré.
 */

const chapterField = z.string().min(1).max(120);
const artifactField = z.string().min(1).max(200);

const recordSchema = z.object({
  action: z.literal("record"),
  chapter: chapterField,
  kind: z.enum(CHAPTER_ACTIVITY_KINDS),
  artifactId: artifactField,
  succeeded: z.boolean()
});

const revealSchema = z.object({
  action: z.literal("reveal"),
  chapter: chapterField,
  artifactId: artifactField
});

const rateSchema = z.object({
  action: z.literal("rateFlashcard"),
  chapter: chapterField,
  artifactId: artifactField,
  rating: z.enum(["forgotten", "partial", "correct", "mastered"])
});

const calculationSchema = z.object({
  action: z.literal("gradeCalculation"),
  chapter: chapterField,
  artifactId: artifactField,
  answer: z.string().max(60)
});

const journalLineSchema = z.object({
  account: z.string().max(20),
  debit: z.number().finite().min(0).optional(),
  credit: z.number().finite().min(0).optional()
});

const journalSchema = z.object({
  action: z.literal("gradeJournalEntry"),
  chapter: chapterField,
  artifactId: artifactField,
  // Une écriture de plus de cinquante lignes n'est pas un exercice de ce
  // chapitre : la borne protège la notation d'une charge utile absurde.
  lines: z.array(journalLineSchema).min(1).max(50)
});

const diagnosisSchema = z.object({
  action: z.literal("gradeDiagnosis"),
  chapter: chapterField,
  artifactId: artifactField,
  category: z.enum(
    Object.keys(errorCategoryLabels) as [keyof typeof errorCategoryLabels, ...Array<keyof typeof errorCategoryLabels>]
  ),
  justification: z.string().max(2000).optional()
});

const caseStepSchema = z.object({
  action: z.literal("gradeCaseStep"),
  chapter: chapterField,
  artifactId: artifactField,
  stepId: z.string().min(1).max(120),
  submission: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("calculation"), raw: z.string().max(60) }),
    z.object({ kind: z.literal("journal_entry"), lines: z.array(journalLineSchema).min(1).max(50) }),
    z.object({
      kind: z.literal("error_diagnosis"),
      category: z.enum(
        Object.keys(errorCategoryLabels) as [
          keyof typeof errorCategoryLabels,
          ...Array<keyof typeof errorCategoryLabels>
        ]
      ),
      justification: z.string().max(2000).optional()
    }),
    z.object({ kind: z.literal("short_answer"), text: z.string().max(4000) })
  ])
});

const hintSchema = z.object({
  action: z.literal("revealHint"),
  chapter: chapterField,
  artifactId: artifactField,
  stepId: z.string().min(1).max(120),
  level: z.number().int().min(1).max(3)
});

const requestSchema = z.discriminatedUnion("action", [
  recordSchema,
  revealSchema,
  rateSchema,
  calculationSchema,
  journalSchema,
  diagnosisSchema,
  caseStepSchema,
  hintSchema
]);

/**
 * Charge une version *active* du chapitre demandé.
 *
 * Trois issues distinctes, et c'est nécessaire : « ce contenu n'existe pas »,
 * « le magasin est injoignable » et « une erreur est survenue » demandent trois
 * réponses différentes. Les confondre en 500 — ce que faisait la première
 * version — exposait un état de configuration sous forme d'erreur interne.
 */
async function loadActive(
  chapter: string,
  artifactId: string
): Promise<
  | { outcome: "found"; version: Awaited<ReturnType<typeof loadPublishedVersion>> & object }
  | { outcome: "missing" }
  | { outcome: "unavailable" }
> {
  if (!getPublicChapter(chapter)) {
    return { outcome: "missing" };
  }

  let version: Awaited<ReturnType<typeof loadPublishedVersion>>;

  try {
    version = await loadPublishedVersion(artifactId);
  } catch (error) {
    if (
      error instanceof PublicationStoreUnavailableError ||
      error instanceof PublishedContentUnavailableError
    ) {
      // Journalisé sans détail d'infrastructure : ni chaîne de connexion, ni
      // message de pilote.
      console.error("[apprentissage/activites] magasin indisponible", { name: error.name });
      return { outcome: "unavailable" };
    }

    throw error;
  }

  if (!version || version.status !== "published" || version.chapter !== chapter) {
    return { outcome: "missing" };
  }

  return { outcome: "found", version };
}

/**
 * Des fabriques, pas des constantes.
 *
 * Une `Response` porte un corps qui est un flux **à usage unique** : renvoyer la
 * même instance à deux requêtes fait lire un flux déjà consommé à la seconde,
 * qui reçoit alors un corps vide ou une erreur d'envoi. Le coût d'une nouvelle
 * instance par requête est nul ; celui du partage est un bogue qui n'apparaît
 * qu'en charge.
 */
function notFound(): Response {
  return Response.json({ error: "Contenu introuvable ou retiré" }, { status: 404 });
}

function unavailable(): Response {
  return Response.json(
    {
      error: "Contenu momentanément indisponible",
      details: "Le contenu publié n'est pas joignable pour l'instant. Réessayez dans quelques instants."
    },
    { status: 503 }
  );
}

/**
 * Les actions qui engagent la progression de l'apprenant.
 *
 * Elles corrigent une tentative, écrivent un événement de chapitre ou déplacent
 * une carte dans la file de révision espacée. Les autres — révéler un verso,
 * demander un indice — ne font que lire, et un contenu de comparaison a
 * précisément vocation à être lu.
 */
const SCORING_ACTIONS = new Set([
  "record",
  "rateFlashcard",
  "gradeCalculation",
  "gradeJournalEntry",
  "gradeDiagnosis",
  "gradeCaseStep"
]);

/**
 * Une réponse d'hier ne vaut pas correction aujourd'hui.
 *
 * C'EST ICI QUE LA RÈGLE DEVIENT VRAIE, PAS DANS LES ÉCRANS. Les chargeurs de
 * chapitre écartent déjà les contenus de comparaison des files notées, mais un
 * écran qui filtre est une convention : il suffit d'un identifiant recopié dans
 * une requête pour la contourner. Ce refus-ci porte sur l'acte lui-même, donc
 * sur le seul chemin par lequel un score peut naître.
 */
function notGradable(version: { title: string }, profile: string): Response {
  return Response.json(
    {
      error: "Ce contenu n'est pas noté",
      details:
        `«\u00a0${version.title}\u00a0» relève du profil normatif «\u00a0${profile}\u00a0» et n'est publié que pour comparaison : ` +
        "il ne corrige aucune tentative et ne compte dans aucun score."
    },
    { status: 409 }
  );
}

export async function POST(request: Request) {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = requestSchema.safeParse(raw);

  if (!body.success) {
    return Response.json(
      { error: "Requête invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  const loaded = await loadActive(body.data.chapter, body.data.artifactId);

  if (loaded.outcome === "unavailable") {
    return unavailable();
  }

  if (loaded.outcome === "missing") {
    return notFound();
  }

  const version = loaded.version;

  if (SCORING_ACTIONS.has(body.data.action) && !isGradedVersion(version)) {
    return notGradable(version, normativeContextOf(version).profile);
  }

  const user = await getCurrentUser();

  try {
    switch (body.data.action) {
      case "record": {
        const written = await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: body.data.kind,
          artifactId: body.data.artifactId,
          succeeded: body.data.succeeded,
          score: null,
          // Une consultation est dédoublonnée ; une tentative ne l'est pas.
          once: body.data.kind === "sheet_viewed"
        });

        return Response.json({ recorded: written });
      }

      case "reveal": {
        return Response.json(revealFlashcard(version));
      }

      case "rateFlashcard": {
        const rating = body.data.rating as ReviewRating;
        const intervalDays = REVIEW_INTERVAL_DAYS[rating];
        const reviewedAt = new Date();
        const nextDueAt = addDays(reviewedAt, intervalDays);

        // La planification est *écrite*, pas seulement calculée : c'est elle qui
        // décide de ce que la prochaine session propose.
        const scheduled = await recordCardReview({
          userId: user?.id ?? null,
          artifactId: body.data.artifactId,
          rating,
          reviewedAt: reviewedAt.toISOString(),
          dueAt: nextDueAt,
          intervalDays
        });

        const recorded = await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: "flashcard_reviewed",
          artifactId: body.data.artifactId,
          // « Pas su » est le seul échec : `isFailedReview` du domaine, appliqué
          // à la lettre plutôt que réinterprété ici.
          succeeded: rating !== "forgotten",
          score: null
        });

        if (rating === "forgotten") {
          await recordFailure({
            userId: user?.id ?? null,
            chapter: body.data.chapter,
            artifactId: body.data.artifactId,
            title: version.title,
            category: "reasoning",
            summary: `Carte non sue : ${version.title}`,
            nextAction: "Relire la règle et son exemple, puis réécrire la réponse de mémoire avant le retest.",
            competencyIds: []
          });
        }

        return Response.json({
          intervalDays,
          nextDueAt,
          // Distingue « noté et planifié » de « noté sans compte » : l'écran ne
          // doit annoncer une reprogrammation que lorsqu'elle a réellement eu
          // lieu.
          recorded,
          scheduled
        });
      }

      case "gradeCalculation": {
        const graded = gradeCalculation(version, { raw: body.data.answer });

        await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: "calculation_attempt",
          artifactId: body.data.artifactId,
          succeeded: graded.passed,
          score: graded.result.score
        });

        if (!graded.passed) {
          await recordFailure({
            userId: user?.id ?? null,
            chapter: body.data.chapter,
            artifactId: body.data.artifactId,
            title: version.title,
            category: graded.errorKind === "signe" ? "accounting-treatment" : "calculation",
            summary: `${version.title} — ${graded.hint ?? "résultat incorrect"}`,
            nextAction:
              graded.hint ?? "Reprendre les données de l'énoncé une à une avant de recalculer.",
            competencyIds:
              version.contentSnapshot.contentType === "calculation_exercise"
                ? version.contentSnapshot.content.competencyTags
                : []
          });
        }

        return Response.json({
          score: graded.result.score,
          maxScore: graded.result.maxScore,
          passed: graded.passed,
          errorKind: graded.errorKind,
          hint: graded.hint,
          feedback: graded.result.feedback,
          criteria: graded.result.criteria,
          correction: graded.correction
        });
      }

      case "gradeJournalEntry": {
        const graded = gradeJournalEntry(version, body.data.lines);

        await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: "journal_entry_attempt",
          artifactId: body.data.artifactId,
          succeeded: graded.passed,
          score: graded.result.score
        });

        if (!graded.passed) {
          await recordFailure({
            userId: user?.id ?? null,
            chapter: body.data.chapter,
            artifactId: body.data.artifactId,
            title: version.title,
            category: "accounting-treatment",
            summary: `${version.title} — écriture incorrecte`,
            nextAction:
              "Reprendre le sens de chaque ligne, puis vérifier l'équilibre avant de valider.",
            competencyIds:
              version.contentSnapshot.contentType === "journal_entry_exercise"
                ? version.contentSnapshot.content.competencyTags
                : []
          });
        }

        return Response.json({
          score: graded.result.score,
          maxScore: graded.result.maxScore,
          passed: graded.passed,
          feedback: graded.result.feedback,
          criteria: graded.result.criteria,
          correction: graded.correction
        });
      }

      case "gradeDiagnosis": {
        const graded = gradeErrorDiagnosis(version, {
          category: body.data.category,
          justification: body.data.justification
        });

        await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: "diagnosis_attempt",
          artifactId: body.data.artifactId,
          succeeded: graded.passed,
          score: graded.result.score
        });

        if (!graded.passed) {
          await recordFailure({
            userId: user?.id ?? null,
            chapter: body.data.chapter,
            artifactId: body.data.artifactId,
            title: version.title,
            category: "reasoning",
            summary: `${version.title} — nature de l'erreur mal identifiée`,
            nextAction: "Reprendre la typologie des erreurs, puis réexaminer l'écriture ligne à ligne.",
            competencyIds:
              version.contentSnapshot.contentType === "error_diagnosis_exercise"
                ? version.contentSnapshot.content.competencyTags
                : []
          });
        }

        return Response.json({
          score: graded.result.score,
          maxScore: graded.result.maxScore,
          passed: graded.passed,
          feedback: graded.result.feedback,
          criteria: graded.result.criteria,
          correction: graded.correction,
          // La justification libre n'est pas notée : le dire explicitement évite
          // de laisser croire à une évaluation qui n'existe pas.
          justificationGraded: false
        });
      }

      case "gradeCaseStep": {
        const graded = gradeCaseStep(version, body.data.stepId, body.data.submission);

        await recordActivity({
          userId: user?.id ?? null,
          chapter: body.data.chapter,
          kind: "case_step_attempt",
          artifactId: `${body.data.artifactId}#${body.data.stepId}`,
          succeeded: graded.passed,
          score: graded.result.score
        });

        return Response.json({
          stepId: graded.stepId,
          score: graded.result.score,
          maxScore: graded.result.maxScore,
          passed: graded.passed,
          gradable: body.data.submission.kind !== "short_answer",
          feedback: graded.result.feedback,
          criteria: graded.result.criteria,
          correction: graded.correction
        });
      }

      case "revealHint": {
        const hint = revealHint(version, body.data.stepId, body.data.level);

        return hint
          ? Response.json(hint)
          : Response.json({ error: "Indice introuvable" }, { status: 404 });
      }
    }
  } catch (error) {
    console.error("[apprentissage/activites]", error);
    return Response.json({ error: "Action impossible" }, { status: 500 });
  }
}

/** Réexporté pour les tests : la liste des types d'activité acceptés. */
export const ACCEPTED_KINDS: readonly ChapterActivityKind[] = CHAPTER_ACTIVITY_KINDS;
export const ACTIVITY_MODULE = COMPTA_APPROFONDIE_MODULE;
