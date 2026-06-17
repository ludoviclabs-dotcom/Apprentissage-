import { getRevisionSession } from "@finance/db";

export async function GET() {
  const session = await getRevisionSession();

  return Response.json({ session });
}
