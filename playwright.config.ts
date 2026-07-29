import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

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
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `corepack pnpm --filter @finance/web start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // Deterministic smoke environment: seeded data, no public-demo lockdown.
          FINANCE_HUB_USE_DATABASE: "false",
          FINANCE_HUB_PUBLIC_DEMO: "false",
          LEARNING_HUB_AUTH_ENABLED: "false",
          AI_PROVIDER: "none"
        }
      }
});
