import { checkDatabaseConnection, getDbHealth } from "@finance/db";
import { getRuntimeFlags } from "@/lib/runtime-flags";

export async function GET() {
  const runtime = getRuntimeFlags();
  const connection = await checkDatabaseConnection();

  return Response.json({
    app: "Finance Learning Hub",
    status: "ok",
    mode: runtime.publicDemo ? "public-demo" : "private",
    database: {
      configured: runtime.databaseConfigured,
      active: runtime.databaseActive,
      reachable: connection.reachable,
      reason: connection.reason,
      ...getDbHealth()
    },
    auth: {
      enabled: runtime.authEnabled
    },
    safeguards: {
      writesBlocked: runtime.publicDemo
    }
  });
}
