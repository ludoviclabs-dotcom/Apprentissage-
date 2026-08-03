import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Several pnpm workspaces exist above this checkout (git worktrees, parent
// folders), and Next.js otherwise infers the wrong root for output tracing.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@finance/domain", "@finance/db", "@finance/ai", "@finance/ingest"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
        ]
      }
    ];
  }
};

export default nextConfig;
