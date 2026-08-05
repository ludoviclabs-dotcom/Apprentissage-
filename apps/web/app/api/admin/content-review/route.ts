import { InvalidTransitionError, contentPayloadSchema, type ContentDraft } from "@finance/content-generation";
import { z } from "zod";
import {
  applyTransition,
  findDraft,
  persistDraft,
  requireReviewApiAccess,
  revalidateDraft
} from "@/lib/content-review/service";
import { getRuntimeFlags, getPublicDemoWriteResponse } from "@/lib/runtime-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actions de revue : enregistrer, revalider, approuver, rejeter, rouvrir.
 *
 * Toutes les décisions sont prises côté serveur à partir du statut **lu sur le
 * brouillon**, jamais de celui que le navigateur prétend. Un contenu qui ne
 * passe pas les contrôles ne peut pas être approuvé, quelle que soit la requête.
 *
 * Il n'existe volontairement aucune action « publier » : la publication est
 * hors périmètre de ce lot, et la machine à états n'a pas d'état correspondant.
 */

const saveDraftSchema = z.object({
  action: z.literal("saveDraft"),
  draftId: z.string().min(1),
  /** Contenu réécrit par le relecteur, revalidé avant écriture. */
  content: z.unknown()
});

const simpleActionSchema = z.object({
  action: z.enum(["validateDraft", "approveDraft", "reopenDraft"]),
  draftId: z.string().min(1)
});

const rejectSchema = z.object({
  action: z.literal("rejectDraft"),
  draftId: z.string().min(1),
  // Un rejet sans motif est inexploitable pour celui qui reprendra le contenu.
  reason: z.string().trim().min(10).max(2000)
});

const requestSchema = z.discriminatedUnion("action", [
  saveDraftSchema,
  simpleActionSchema,
  rejectSchema
]);

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const caller = await requireReviewApiAccess();

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
      { error: "Action de revue invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  const entry = await findDraft(body.data.draftId);

  if (!entry) {
    return Response.json({ error: "Brouillon introuvable" }, { status: 404 });
  }

  const now = new Date().toISOString();

  try {
    switch (body.data.action) {
      case "saveDraft": {
        // Un contenu approuvé ne se modifie pas : il faut d'abord le rouvrir,
        // ce que la machine à états interdit. Le refus est donc explicite.
        if (entry.draft.status === "approved") {
          return Response.json(
            {
              error: "Contenu approuvé",
              details:
                "Un contenu approuvé ne peut plus être modifié. Régénérez-le pour produire une nouvelle révision."
            },
            { status: 409 }
          );
        }

        const payload = contentPayloadSchema.safeParse({
          contentType: entry.draft.contentType,
          content: body.data.content
        });

        if (!payload.success) {
          return Response.json(
            {
              error: "Contenu invalide",
              details: payload.error.issues.map(
                (issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`
              )
            },
            { status: 400 }
          );
        }

        const edited = { ...entry.draft, content: payload.data.content, updatedAt: now } as ContentDraft;
        const revalidated = await revalidateDraft({ ...entry, draft: edited }, now);
        await persistDraft(entry, revalidated.draft);

        return Response.json({
          status: revalidated.draft.status,
          passed: revalidated.passed,
          validation: revalidated.draft.validationMetadata
        });
      }

      case "validateDraft": {
        const revalidated = await revalidateDraft(entry, now);
        await persistDraft(entry, revalidated.draft);

        return Response.json({
          status: revalidated.draft.status,
          passed: revalidated.passed,
          validation: revalidated.draft.validationMetadata
        });
      }

      case "approveDraft": {
        // On revalide avant d'approuver : le corpus a pu bouger depuis la
        // génération, et une approbation doit porter sur l'état actuel.
        const revalidated = await revalidateDraft(entry, now);

        if (!revalidated.passed) {
          return Response.json(
            {
              error: "Approbation impossible",
              details:
                "Ce contenu ne passe pas les contrôles déterministes. Corrigez-le puis relancez la validation.",
              blockingReasons: revalidated.draft.validationMetadata?.blockingReasons ?? []
            },
            { status: 409 }
          );
        }

        // Une page dont l'extraction est dégradée reste citable pendant la
        // rédaction, mais elle ne peut pas fonder un contenu approuvé : le texte
        // qui l'étaye est justement celui dont on sait qu'il est incomplet.
        const degraded = (revalidated.draft.validationMetadata?.warnings ?? []).filter(
          (issue) => issue.code === "page-degradee"
        );

        if (degraded.length > 0) {
          return Response.json(
            {
              error: "Approbation impossible",
              details:
                "Ce contenu s'appuie sur une page dont l'extraction est dégradée. Corrigez la source ou citez une autre page.",
              blockingReasons: degraded.map((issue) => issue.message)
            },
            { status: 409 }
          );
        }

        const approved = applyTransition({
          draft: revalidated.draft,
          to: "approved",
          actor: caller.actor,
          occurredAt: now
        });
        await persistDraft(entry, approved);

        return Response.json({ status: approved.status, passed: true });
      }

      case "rejectDraft": {
        const rejected = applyTransition({
          draft: entry.draft,
          to: "rejected",
          actor: caller.actor,
          comment: body.data.reason,
          occurredAt: now
        });
        await persistDraft(entry, rejected);

        return Response.json({ status: rejected.status });
      }

      case "reopenDraft": {
        const reopened = applyTransition({
          draft: entry.draft,
          to: "draft",
          actor: caller.actor,
          occurredAt: now
        });
        await persistDraft(entry, reopened);

        return Response.json({ status: reopened.status });
      }
    }
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return Response.json({ error: "Transition refusée", details: error.message }, { status: 409 });
    }

    console.error("[content-review]", error);
    return Response.json({ error: "Action impossible" }, { status: 500 });
  }
}
