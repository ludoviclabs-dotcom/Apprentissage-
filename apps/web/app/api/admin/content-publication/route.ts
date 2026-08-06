import { UnknownChapterError } from "@finance/content-publication";
import { z } from "zod";
import { requireReviewApiAccess } from "@/lib/content-review/service";
import {
  archivePublishedVersion,
  DraftNotFoundError,
  previewPublication,
  publishDraft,
  PublicationRefused
} from "@/lib/publication/service";
import { PublicationStoreUnavailableError } from "@/lib/publication/store";
import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";

/**
 * `23505` est le code PostgreSQL d'une violation d'unicité.
 *
 * Reconnu par son code plutôt que par son message : le message est localisé et
 * dépend de la version du serveur, le code non.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actions de publication.
 *
 * ELLES SONT SÉPARÉES DES ACTIONS DE RELECTURE, ET C'EST VOULU. `/api/admin/content-review`
 * fait avancer une machine à états éditoriale ; celle-ci fait franchir à un
 * contenu la frontière du site public. Les mélanger aurait fait de « publier »
 * une action de plus dans un `switch` où l'oubli d'une garde passe inaperçu ;
 * séparées, la seule route qui écrit dans le magasin public est celle-ci, et elle
 * ne sait rien faire d'autre.
 *
 * AUCUNE PUBLICATION AUTOMATIQUE. Approuver n'appelle pas cette route ; rien ne
 * l'appelle qu'un clic humain sur « Publier », après une boîte de confirmation
 * qui montre ce qui va être publié et où.
 */

const previewSchema = z.object({
  action: z.literal("preview"),
  draftId: z.string().min(1)
});

const publishSchema = z.object({
  action: z.literal("publish"),
  draftId: z.string().min(1),
  comment: z.string().trim().max(2000).optional(),
  /**
   * Le relecteur confirme avoir lu la boîte de confirmation. Un client qui
   * poste sans ce drapeau se voit refuser : la confirmation n'est pas une
   * politesse d'interface, c'est une étape du protocole.
   */
  confirmed: z.literal(true)
});

const archiveSchema = z.object({
  action: z.literal("archive"),
  versionId: z.string().min(1),
  comment: z.string().trim().max(2000).optional(),
  confirmed: z.literal(true)
});

const requestSchema = z.discriminatedUnion("action", [previewSchema, publishSchema, archiveSchema]);

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
      { error: "Action de publication invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  try {
    switch (body.data.action) {
      case "preview": {
        const preview = await previewPublication(body.data.draftId);

        return Response.json({
          report: preview.report,
          target: preview.target,
          currentActive: preview.currentActive,
          draft: {
            title: preview.draft.draft.title,
            contentType: preview.draft.draft.contentType,
            status: preview.draft.draft.status,
            mode: preview.draft.draft.generationMetadata.mode
          }
        });
      }

      case "publish": {
        const outcome = await publishDraft({
          draftId: body.data.draftId,
          actor: caller.actor,
          comment: body.data.comment
        });

        return Response.json({
          versionId: outcome.published.id,
          publicationVersion: outcome.published.publicationVersion,
          contentHash: outcome.published.contentHash,
          publicUrl: `/modules/comptabilite-approfondie/${outcome.published.chapter}`,
          archivedVersionId: outcome.archived?.id ?? null,
          auditRecorded: outcome.auditRecorded,
          // Le contenu *est* publié : un défaut de traçabilité ne doit pas être
          // rapporté comme un échec de publication, mais il doit être visible.
          auditWarning: outcome.auditRecorded
            ? undefined
            : `Contenu publié, acte non enregistré en base : ${outcome.auditReason ?? "raison inconnue"}`
        });
      }

      case "archive": {
        const outcome = await archivePublishedVersion({
          versionId: body.data.versionId,
          actor: caller.actor,
          comment: body.data.comment
        });

        return Response.json({
          versionId: outcome.archivedVersionId,
          archivedAt: outcome.archivedAt,
          auditRecorded: outcome.auditRecorded,
          auditWarning: outcome.auditRecorded
            ? undefined
            : `Version archivée, acte non enregistré en base : ${outcome.auditReason ?? "raison inconnue"}`
        });
      }
    }
  } catch (error) {
    if (error instanceof PublicationRefused) {
      return Response.json(
        {
          error: "Publication impossible",
          details:
            "Ce contenu ne passe pas les contrôles de publication. Ils ont été rejoués à l'instant.",
          report: error.report
        },
        { status: 409 }
      );
    }

    if (error instanceof DraftNotFoundError) {
      return Response.json({ error: "Brouillon introuvable" }, { status: 404 });
    }

    if (error instanceof UnknownChapterError) {
      return Response.json(
        {
          error: "Chapitre hors programme",
          details: error.message
        },
        { status: 409 }
      );
    }

    if (error instanceof PublicationStoreUnavailableError) {
      // Le magasin est injoignable ou non configuré. Rien n'a été publié, et le
      // message ne porte ni chaîne de connexion ni détail d'infrastructure.
      console.error("[content-publication] magasin indisponible", { name: error.name });

      return Response.json(
        {
          error: "Publication impossible",
          details:
            "Le magasin de contenu publié n'est pas disponible. Rien n'a été publié ; réessayez une fois la base joignable."
        },
        { status: 503 }
      );
    }

    // Violation de l'index unique partiel : une autre publication a pris la
    // version active entre la prévisualisation et le clic. C'est le
    // comportement voulu — la base refuse deux versions actives — et le
    // relecteur doit être invité à recommencer plutôt que de voir « erreur
    // interne ».
    if (isUniqueViolation(error)) {
      return Response.json(
        {
          error: "Publication concurrente",
          details:
            "Une autre version de ce contenu vient d'être publiée. Rechargez la fiche et relancez la prévisualisation."
        },
        { status: 409 }
      );
    }

    console.error("[content-publication]", error);
    return Response.json({ error: "Action impossible" }, { status: 500 });
  }
}
