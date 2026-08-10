import { findAnnotation, readImage, requireAnnotationApiAccess } from "@/lib/source-annotations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le rendu d'une page, servi à l'administrateur et à personne d'autre.
 *
 * LE FICHIER N'EST JAMAIS DÉSIGNÉ PAR LA REQUÊTE. L'URL porte un identifiant
 * d'annotation ; le chemin est reconstruit côté serveur à partir du document et
 * de la page que l'annotation déclare. Une requête ne peut donc pas demander
 * « ../../.env » : le nom de fichier ne vient pas d'elle.
 *
 * La réponse ne comporte aucun chemin, aucun nom d'origine, aucune indication
 * d'arborescence — ni dans le corps, ni dans les en-têtes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ annotationId: string }> }
) {
  const caller = await requireAnnotationApiAccess();

  if (caller.response) {
    return caller.response;
  }

  const { annotationId } = await params;
  const annotation = await findAnnotation(annotationId);

  if (!annotation) {
    return Response.json({ error: "Ressource introuvable" }, { status: 404 });
  }

  const image = await readImage(annotation);

  if (!image) {
    return Response.json({ error: "Rendu indisponible" }, { status: 404 });
  }

  return new Response(image as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      // Un rendu privé ne doit pas séjourner dans un cache partagé, et la page
      // qui le montre est déjà derrière la garde d'administration.
      "cache-control": "private, no-store",
      "content-disposition": "inline"
    }
  });
}
