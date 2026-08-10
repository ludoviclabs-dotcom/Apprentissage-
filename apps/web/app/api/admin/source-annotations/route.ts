import {
  AnnotationDecisionRefusedError,
  InvalidAnnotationTransitionError,
  MINIMUM_REJECTION_REASON_LENGTH,
  structuredFactSchema
} from "@finance/content-generation";
import { z } from "zod";
import { correct, decide, requireAnnotationApiAccess } from "@/lib/source-annotations/service";
import { getRuntimeFlags, getPublicDemoWriteResponse } from "@/lib/runtime-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Décisions humaines sur les annotations de sources visuelles.
 *
 * Comme pour la relecture de contenu, la décision est prise côté serveur à
 * partir de l'état **lu sur l'annotation**, jamais de celui que le navigateur
 * prétend, et l'acteur vient de la couche d'authentification — il n'existe
 * aucun champ « reviewedBy » dans la requête.
 *
 * Il n'y a volontairement aucune action de lot : approuver dix-neuf
 * transcriptions d'un clic reviendrait à ne les avoir regardées d'aucun.
 */

const correctSchema = z.object({
  action: z.literal("correctAnnotation"),
  annotationId: z.string().min(1),
  transcription: z.string().nullable().optional(),
  structuredFacts: z.array(structuredFactSchema).optional(),
  confidence: z.enum(["high", "medium", "low"]).nullable().optional()
});

const approveSchema = z.object({
  action: z.literal("approveAnnotation"),
  annotationId: z.string().min(1)
});

const rejectSchema = z.object({
  action: z.literal("rejectAnnotation"),
  annotationId: z.string().min(1),
  reason: z.string().trim().min(MINIMUM_REJECTION_REASON_LENGTH).max(2000)
});

const reopenSchema = z.object({
  action: z.literal("reopenAnnotation"),
  annotationId: z.string().min(1)
});

const requestSchema = z.discriminatedUnion("action", [
  correctSchema,
  approveSchema,
  rejectSchema,
  reopenSchema
]);

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const caller = await requireAnnotationApiAccess();

  if (caller.response) {
    return caller.response;
  }

  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = requestSchema.safeParse(raw);

  if (!body.success) {
    return Response.json(
      { error: "Action d'annotation invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (body.data.action === "correctAnnotation") {
      const { action: _action, ...changes } = body.data;
      const updated = await correct(changes);

      return Response.json({ reviewStatus: updated.reviewStatus, confidence: updated.confidence });
    }

    const updated = await decide({
      annotationId: body.data.annotationId,
      to:
        body.data.action === "approveAnnotation"
          ? "approved"
          : body.data.action === "rejectAnnotation"
            ? "rejected"
            : "needs_human_review",
      actor: caller.actor,
      reason: body.data.action === "rejectAnnotation" ? body.data.reason : undefined
    });

    return Response.json({
      reviewStatus: updated.reviewStatus,
      reviewedBy: updated.reviewedBy,
      reviewedAt: updated.reviewedAt
    });
  } catch (error) {
    if (error instanceof InvalidAnnotationTransitionError) {
      return Response.json({ error: "Transition refusée", details: error.message }, { status: 409 });
    }

    if (error instanceof AnnotationDecisionRefusedError) {
      return Response.json(
        { error: "Décision impossible", code: error.code, details: error.message },
        { status: 409 }
      );
    }

    console.error("[source-annotations]", error);
    return Response.json({ error: "Action impossible" }, { status: 500 });
  }
}
