import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL("./apps/web", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": webRoot,
      // `server-only` throws on import outside a React Server Component, which
      // is the point of it: the billing modules that hold Stripe secrets and
      // price ids import it so a client component that reaches for them fails
      // the build. Vitest is neither, so it resolves to the package's own empty
      // module — the same file Next.js uses on the server — rather than the one
      // that throws. The build-time guarantee is unaffected; only the test
      // runner's resolution changes.
      "server-only": fileURLToPath(new URL("./apps/web/node_modules/server-only/empty.js", import.meta.url))
    }
  },
  test: {
    // Unit tests only. Playwright specs under `tests/e2e` run via `pnpm test:e2e`.
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"]
  }
});
