import type { NextConfig } from "next";

/**
 * The Content-Security-Policy is not here — it carries a per-request nonce and is set by
 * `src/middleware.ts`. These are the fixed headers, which have nothing to vary on.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // the app asks for none of these; saying so keeps a compromised page from asking either
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // the repo root also has a lockfile (the MCP server package), so pin the workspace
  turbopack: { root: import.meta.dirname },
  // emits .next/standalone — a self-contained server the runtime image copies in
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
