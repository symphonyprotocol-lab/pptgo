// Dev-only harness: serves the fake host page and exposes the pptgo MCP server
// over streamable HTTP so a browser can talk to it. Not used by Claude Desktop.
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { build } from "esbuild";

import { resolveConfig } from "../dist/lib/config.js";
import { createPptgoServer } from "../dist/lib/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4321);
const cfg = resolveConfig();

const bundle = await build({
  entryPoints: [join(root, "dev/host.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  write: false,
});

const page = `<!doctype html><html><head><meta charset="utf-8"><title>pptgo dev host</title>
<style>
  body{margin:0;font:13px ui-sans-serif,system-ui;background:#f2f2f4;color:#1c1c1e}
  header{padding:8px 12px;background:#fff;border-bottom:1px solid #e2e2e5;font-weight:600}
  #frame{padding:12px}
  iframe{width:100%;height:680px;border:1px solid #d8d8dc;border-radius:10px;background:#fff}
  body.fullscreen iframe{height:calc(100vh - 60px)}
  #log{padding:8px 12px;font-family:ui-monospace,monospace;font-size:11px;color:#555;max-height:180px;overflow:auto}
</style></head><body>
<header>pptgo dev host — fake MCP Apps host</header>
<div id="frame"></div><div id="log"></div>
<script type="module">${bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;

createServer(async (req, res) => {
  if (req.url?.startsWith("/mcp")) {
    // Stateless: one server + transport per request keeps the harness simple.
    const server = createPptgoServer(cfg);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    let body = "";
    for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(port, () => {
  console.log(`dev host: http://localhost:${port}/?project=<name>`);
  console.log(`workspace: ${cfg.workspace}`);
});
