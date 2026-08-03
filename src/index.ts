#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveConfig } from "./config.js";
import { createPptgoServer } from "./server.js";

async function main(): Promise<void> {
  const cfg = resolveConfig();
  const server = createPptgoServer(cfg);
  // stdout is the MCP channel; diagnostics must go to stderr.
  console.error(
    `pptgo: workspace=${cfg.workspace} ppt-master=${cfg.pptMasterHome ?? "(not configured)"}`,
  );
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("pptgo failed to start:", err);
  process.exit(1);
});
