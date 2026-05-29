import { searchKnowledge } from "@finance/db";
import { z } from "zod";

const librarianSchema = z.object({
  query: z.string().min(3),
  limit: z.coerce.number().min(1).max(12).default(5)
});

export async function POST(request: Request) {
  const body = librarianSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid search", details: body.error.flatten() }, { status: 400 });
  }

  const hits = await searchKnowledge(body.data.query, body.data.limit);

  return Response.json({
    query: body.data.query,
    hits,
    sourcePolicy: "Chaque résultat doit conserver pack, document, page et date lorsque disponibles."
  });
}
