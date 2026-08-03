import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the repo root also has a lockfile (the MCP server package), so pin the workspace
  turbopack: { root: import.meta.dirname },
  // emits .next/standalone — a self-contained server the runtime image copies in
  output: "standalone",
};

export default nextConfig;
