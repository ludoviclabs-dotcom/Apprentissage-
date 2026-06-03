export interface RuntimeFlags {
  authEnabled: boolean;
  databaseConfigured: boolean;
  databaseActive: boolean;
  publicDemo: boolean;
  vercelEnv?: string;
}

export function getRuntimeFlags(): RuntimeFlags {
  const authEnabled = process.env.LEARNING_HUB_AUTH_ENABLED === "true";
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const databaseActive = process.env.FINANCE_HUB_USE_DATABASE === "true" && databaseConfigured;
  const vercelEnv = process.env.VERCEL_ENV;
  const publicDemo =
    process.env.FINANCE_HUB_PUBLIC_DEMO === "true" || (vercelEnv === "production" && !authEnabled);

  return {
    authEnabled,
    databaseConfigured,
    databaseActive,
    publicDemo,
    vercelEnv
  };
}

export function getPublicDemoWriteResponse() {
  return Response.json(
    {
      error: "Demo publique en lecture seule",
      details:
        "Active LEARNING_HUB_AUTH_ENABLED=true et une base privée avant d'autoriser les imports ou uploads en production."
    },
    { status: 403 }
  );
}
