import { getDbHealth } from "@finance/db";

export async function GET() {
  return Response.json({
    app: "Finance Learning Hub",
    status: "ok",
    database: {
      configured: Boolean(process.env.DATABASE_URL),
      active: process.env.FINANCE_HUB_USE_DATABASE === "true",
      ...getDbHealth()
    },
    auth: {
      enabled: process.env.LEARNING_HUB_AUTH_ENABLED === "true"
    }
  });
}
