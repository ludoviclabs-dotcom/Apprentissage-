import { getEnv } from "@/lib/env";
import { getFeatures, isDatabaseActive, isPublicDemo, type FeatureSet } from "@/lib/features";

export interface RuntimeFlags {
  authEnabled: boolean;
  databaseConfigured: boolean;
  databaseActive: boolean;
  publicDemo: boolean;
  vercelEnv?: string;
  features: FeatureSet;
}

export function getRuntimeFlags(): RuntimeFlags {
  const env = getEnv();

  return {
    authEnabled: env.LEARNING_HUB_AUTH_ENABLED,
    databaseConfigured: Boolean(env.DATABASE_URL),
    databaseActive: isDatabaseActive(env),
    publicDemo: isPublicDemo(env),
    vercelEnv: env.VERCEL_ENV,
    features: getFeatures()
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
