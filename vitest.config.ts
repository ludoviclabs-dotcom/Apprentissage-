import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL("./apps/web", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": webRoot
    }
  },
  test: {
    // Unit tests only. Playwright specs under `tests/e2e` run via `pnpm test:e2e`.
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"]
  }
});
