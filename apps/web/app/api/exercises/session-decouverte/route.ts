import { gradeExercise, gradeSubmission, getExerciseById, renderSubmission } from "@finance/db";
import { z } from "zod";
import { isDiscoveryExercise } from "@/lib/discovery-session";

/**
 * Correction d'une étape de la session découverte. Elle ne persiste rien.
 *
 * POURQUOI UNE ROUTE À PART plutôt que `/api/exercises/attempts` : cette
 * dernière corrige *et* enregistre — tentative, `mastery_event`, file de
 * révision, progression de niveau — dans une seule transaction, délibérément.
 * La session découverte doit corriger sans enregistrer. Ajouter un drapeau
 * « ne rien écrire » à la route d'écriture aurait mis les deux comportements
 * sous le même contrôle d'accès, et le jour où le drapeau se serait mal résolu,
 * la démonstration aurait écrit dans la base d'un installateur privé.
 *
 * Ici, il n'y a rien à mal résoudre : `gradeSubmission` est la fonction pure de
 * notation, ce fichier n'importe aucun dépôt d'écriture, et il n'y a pas de
 * `userId` à passer. Aucune écriture n'est possible depuis ce chemin.
 *
 * LA LISTE BLANCHE N'EST PAS DÉCORATIVE. Une notation sans authentification
 * ouverte à tout le catalogue contournerait la barrière d'entitlement du lab
 * Excel — la correction étant précisément ce qui a de la valeur — et la
 * progression canonique qui verrouille les niveaux. La route ne connaît que les
 * cinq exercices de la session, tous libres et hors module.
 */

const journalLineSchema = z.object({
  account: z.string().min(1).max(40),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional()
});

/**
 * Les quatre familles de la session. Pas de `spreadsheet` : aucun exercice de
 * la liste blanche n'est noté par le moteur tableur, et un schéma qui accepte
 * plus que ce que la route sert est une porte qu'on oublie d'avoir ouverte.
 */
const submissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("numeric"), value: z.number().finite() }),
  z.object({ kind: z.literal("choice"), selectedOptionIds: z.array(z.string().min(1)).max(40) }),
  z.object({ kind: z.literal("journal"), lines: z.array(journalLineSchema).min(1).max(40) })
]);

const stepSchema = z.object({
  exerciseId: z.string().min(1).max(200),
  submission: submissionSchema
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = stepSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Réponse invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  if (!isDiscoveryExercise(body.data.exerciseId)) {
    return Response.json(
      {
        error: "Exercice hors session découverte",
        details: "Cette correction ne couvre que les exercices de la session découverte."
      },
      { status: 404 }
    );
  }

  const exercise = await getExerciseById(body.data.exerciseId);

  if (!exercise) {
    return Response.json({ error: "Exercice introuvable" }, { status: 404 });
  }

  // Mêmes sources et même plan de remédiation que la correction persistée : la
  // session découverte montre le vrai produit, pas une version allégée.
  const reference = gradeExercise(exercise, renderSubmission(body.data.submission));

  try {
    const graded = await gradeSubmission(exercise, body.data.submission, {
      // Identifiant stable et lisible : rien ne le stocke, et un `randomUUID`
      // suggérerait une trace persistée qui n'existe pas.
      id: `corr-decouverte-${exercise.id}`,
      sourceReferences: reference.sourceReferences,
      remediationPlan: reference.remediationPlan
    });

    return Response.json(
      {
        correction: graded.correction,
        evaluationType: graded.evaluationType,
        /** Explicite dans la charge utile : le client l'affiche, les tests le lisent. */
        persisted: false
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      {
        error: "Correction impossible",
        details:
          error instanceof Error && error.name === "UnsupportedSubmissionError"
            ? "Format de réponse inadapté à cet exercice."
            : "La correction n'a pas abouti."
      },
      { status: 400 }
    );
  }
}
