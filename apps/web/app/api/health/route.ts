import { checkDatabaseConnection } from "@finance/db";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import { resolvePublicHealth } from "@/lib/public-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getRuntimeFlags();
  const connection = runtime.databaseActive
    ? await checkDatabaseConnection()
    : { reachable: true };
  const health = resolvePublicHealth({
    publicDemo: runtime.publicDemo,
    databaseActive: runtime.databaseActive,
    databaseReachable: connection.reachable
  });

  return Response.json(health, { status: health.available ? 200 : 503 });
}
