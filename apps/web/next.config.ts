import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agentbank/core", "@agentbank/db", "@agentbank/mcp", "@agentbank/sdk"],
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
