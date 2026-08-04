import { getEnv } from "@/lib/env";
import type { AvailabilityReasonCode } from "@/lib/availability";
import {
  PUBLIC_DEMO_MESSAGE,
  PUBLIC_DEMO_TITLE,
  getFeatures,
  isDatabaseActive,
  isPublicDemo,
  type FeatureSet
} from "@/lib/features";

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

/**
 * La réponse d'un refus d'écriture en mode découverte.
 *
 * `details` est lu par un navigateur : il porte le message public, pas la
 * marche à suivre d'exploitation. Celle-ci reste dans
 * `availability-diagnostics.ts`, hors d'atteinte du client.
 */
export function getPublicDemoWriteResponse() {
  return Response.json(
    {
      error: PUBLIC_DEMO_TITLE,
      details: PUBLIC_DEMO_MESSAGE,
      reasonCode: "public-demo" satisfies AvailabilityReasonCode
    },
    { status: 403 }
  );
}
