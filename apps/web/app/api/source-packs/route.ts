import { getSourcePacks } from "@finance/db";

export async function GET() {
  try {
    const sourcePacks = await getSourcePacks();
    return Response.json({ sourcePacks });
  } catch (error) {
    console.error("Unable to load source packs", error);
    return Response.json({ error: "Sources indisponibles" }, { status: 503 });
  }
}

export async function POST() {
  // Source packs are deliberately imported from the operator's machine through
  // `pnpm ingest <path>`. A public HTTP endpoint accepting filesystem paths
  // would turn a local-only workflow into a server-side file-read surface.
  return Response.json(
    { error: "Import indisponible via HTTP", details: "Utilise la commande locale pnpm ingest <chemin>." },
    { status: 403 }
  );
}
