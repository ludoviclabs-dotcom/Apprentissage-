import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const PUBLIC_DEMO_PORT = PORT + 1;
const AUTH_PORT = PORT + 2;
const externallyManagedBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externallyManagedBaseURL ?? `http://127.0.0.1:${PORT}`;
const publicDemoBaseURL = `http://127.0.0.1:${PUBLIC_DEMO_PORT}`;
const authBaseURL = `http://127.0.0.1:${AUTH_PORT}`;

/**
 * Accounts need PostgreSQL, so the `authenticated` project only exists when a
 * database is supplied. Absent it, the auth specs skip rather than fail — and CI
 * always supplies one, so the flow is genuinely covered there.
 */
const authDatabaseUrl = process.env.PLAYWRIGHT_AUTH_DATABASE_URL;

/**
 * Specs that need accounts and a database. The `*-enabled.spec.ts` suffix is the
 * convention: any project without a database must ignore them, and the
 * `authenticated` project runs nothing else.
 */
const AUTH_ENABLED_SPEC = /-enabled\.spec\.ts$/;

const projects = [
  {
    name: "chromium",
    testIgnore: AUTH_ENABLED_SPEC,
    use: { ...devices["Desktop Chrome"], baseURL }
  }
];

if (!externallyManagedBaseURL) {
  projects.push({
    name: "public-demo",
    testIgnore: AUTH_ENABLED_SPEC,
    use: { ...devices["Desktop Chrome"], baseURL: publicDemoBaseURL }
  });

  if (authDatabaseUrl) {
    projects.push({
      name: "authenticated",
      testMatch: AUTH_ENABLED_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: authBaseURL }
    } as (typeof projects)[number]);
  }
}

/**
 * Smoke coverage only. The suite boots the production build on a dedicated port
 * so it never collides with a `pnpm dev` session already running on 3000.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The HTML report is produced in CI too. With the list reporter alone no
  // `playwright-report/` directory existed, so the workflow's upload-on-failure
  // step had nothing to archive and a CI-only failure could not be inspected.
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "on-first-retry" },
  projects,
  webServer: externallyManagedBaseURL
    ? undefined
    : [
        {
          command: `corepack pnpm --filter @finance/web start --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            FINANCE_HUB_USE_DATABASE: "false",
            FINANCE_HUB_PUBLIC_DEMO: "false",
            LEARNING_HUB_AUTH_ENABLED: "false",
            AI_PROVIDER: "none",
            // Ouvre l'espace de relecture pour l'exercer en e2e. Sans comptes,
            // le propriétaire de l'installation privée est administrateur : le
            // serveur public-demo, lui, laisse le drapeau absent, ce qui permet
            // de vérifier que l'espace est fermé par défaut.
            CONTENT_REVIEW_ENABLED: "true",
            // `next start` tourne en NODE_ENV=production : sans cet aveu
            // explicite, le garde de `lib/env.ts` refuserait de démarrer — ce
            // qui est précisément son rôle sur un hôte joignable par d'autres.
            CONTENT_REVIEW_ALLOW_UNAUTHENTICATED: "true"
          }
        },
        {
          command: `corepack pnpm --filter @finance/web start --port ${PUBLIC_DEMO_PORT}`,
          url: publicDemoBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            FINANCE_HUB_USE_DATABASE: "false",
            FINANCE_HUB_PUBLIC_DEMO: "true",
            LEARNING_HUB_AUTH_ENABLED: "false",
            AI_PROVIDER: "none"
          }
        },
        ...(authDatabaseUrl
          ? [
              {
                command: `corepack pnpm --filter @finance/web start --port ${AUTH_PORT}`,
                url: authBaseURL,
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
                env: {
                  DATABASE_URL: authDatabaseUrl,
                  FINANCE_HUB_USE_DATABASE: "true",
                  FINANCE_HUB_PUBLIC_DEMO: "false",
                  LEARNING_HUB_AUTH_ENABLED: "true",
                  // Personne ne s'inscrit avec cette adresse : tout compte créé
                  // par la suite est non-administrateur, ce que les specs de
                  // navigation utilisent pour vérifier le masquage de
                  // l'espace Administration.
                  LEARNING_HUB_ADMIN_EMAILS: "admin-owner@example.test",
                  AI_PROVIDER: "none"
                }
              }
            ]
          : [])
      ]
});
