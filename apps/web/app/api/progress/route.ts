import { getProgressSnapshot } from "@finance/db";
import { resolveReadUser } from "@/lib/auth/current-user";

export async function GET() {
  const reader = await resolveReadUser();

  if (reader.response) {
    return reader.response;
  }

  const progress = await getProgressSnapshot(reader.userId);

  return Response.json({ progress });
}
