import { getSourcePacks, recordManifest } from "@finance/db";
import { createSourcePackManifest } from "@finance/ingest";
import { z } from "zod";

const importRequestSchema = z.object({
  path: z.string().min(1)
});

export async function GET() {
  const sourcePacks = await getSourcePacks();
  return Response.json({ sourcePacks });
}

export async function POST(request: Request) {
  const body = importRequestSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid import path", details: body.error.flatten() }, { status: 400 });
  }

  try {
    const manifest = await createSourcePackManifest(body.data.path);
    const sourcePack = await recordManifest(manifest);

    return Response.json({ manifest, sourcePack });
  } catch (error) {
    return Response.json(
      {
        error: "Unable to import source pack",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 422 }
    );
  }
}
