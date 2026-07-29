import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const PUBLIC_DEMO_PORT = PORT + 1;
const externallyManagedBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externallyManagedBaseURL ?? `http://127.0.0.1:${PORT}`;
const publicDemoBaseURL = `http://127.0.0.1:${PUBLIC_DEMO_PORT}`;

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], baseURL }
  }
];

if (!externallyManagedBaseURL) {
  projects.push({
    name: "public-demo",
    use: { ...devices["Desktop Chrome"], baseURL: publicDemoBaseURL }
  });
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
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
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
            AI_PROVIDER: "none"
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
        }
      ]
});
