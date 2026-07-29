import { getRevisionSession } from "@finance/db";
import { resolveReadUser } from "@/lib/auth/current-user";

export async function GET() {
  const reader = await resolveReadUser();

  if (reader.response) {
    return reader.response;
  }

  const session = await getRevisionSession(reader.userId);

  return Response.json({ session });
}
