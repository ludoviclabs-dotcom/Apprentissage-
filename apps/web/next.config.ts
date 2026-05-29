import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@finance/domain", "@finance/db", "@finance/ai", "@finance/ingest"]
};

export default nextConfig;
