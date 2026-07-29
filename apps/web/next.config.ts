import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Several pnpm workspaces exist above this checkout (git worktrees, parent
// folders), and Next.js otherwise infers the wrong root for output tracing.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@finance/domain", "@finance/db", "@finance/ai", "@finance/ingest"]
};

export default nextConfig;
