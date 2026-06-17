import { getProgressSnapshot } from "@finance/db";

export async function GET() {
  const progress = await getProgressSnapshot();

  return Response.json({ progress });
}
