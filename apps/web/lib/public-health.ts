/**
 * Public health is deliberately tiny. It tells an uptime monitor whether the
 * deployment can serve its configured mode without revealing its database,
 * feature flags, migration state, or any error returned by infrastructure.
 */
export interface PublicHealthInput {
  publicDemo: boolean;
  databaseActive: boolean;
  databaseReachable: boolean;
}

export interface PublicHealthStatus {
  status: "ok" | "unavailable";
  mode: "public-demo" | "private";
  available: boolean;
}

export function resolvePublicHealth(input: PublicHealthInput): PublicHealthStatus {
  const available = !input.databaseActive || input.databaseReachable;

  return {
    status: available ? "ok" : "unavailable",
    mode: input.publicDemo ? "public-demo" : "private",
    available
  };
}
