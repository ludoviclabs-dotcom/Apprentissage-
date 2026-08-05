import { getSourcePacks } from "@finance/db";

/**
 * Lecture des packs de sources.
 *
 * L'import, lui, n'est pas une opération HTTP et ne l'a jamais été : il lit des
 * fichiers sur la machine de l'opérateur, ce à quoi une instance déployée n'a
 * aucun accès, et ce qu'un serveur ne doit de toute façon pas faire sur ordre
 * d'un navigateur. Il se lance depuis le terminal — voir
 * `docs/content-pipeline.md`.
 */

export async function GET() {
  try {
    const sourcePacks = await getSourcePacks();
    return Response.json({ sourcePacks });
  } catch (error) {
    console.error("Unable to load source packs", error);
    return Response.json({ error: "Sources indisponibles" }, { status: 503 });
  }
}

/**
 * POST répondait 403, ce qui décrivait mal la situation : l'import n'est pas
 * une action interdite à cet appelant, c'est une méthode que cette ressource
 * n'expose pas. 405 le dit correctement, et l'en-tête `Allow` annonce ce
 * qu'elle expose réellement.
 *
 * Plus aucun code client n'appelle cette méthode : la page des source packs
 * fournit désormais un assistant qui compose la commande locale à exécuter.
 * Le handler est conservé pour que la réponse reste explicite plutôt que d'être
 * le 405 générique de Next.js, sans corps ni message.
 */
export async function POST() {
  return Response.json(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Les source packs sont importés depuis le terminal local."
      }
    },
    { status: 405, headers: { Allow: "GET" } }
  );
}
