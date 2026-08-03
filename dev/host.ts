/**
 * Development host: a minimal MCP Apps host so the editor can be exercised in a
 * normal browser, without going through Claude Desktop. It does exactly what a
 * real host does — read the ui:// resource, render it in a sandboxed iframe,
 * bridge JSON-RPC, and proxy tool calls to the MCP server.
 */
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const log = (message: string) => {
  const line = document.createElement("div");
  line.textContent = message;
  document.getElementById("log")!.prepend(line);
};

const client = new Client({ name: "pptgo-dev-host", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.href)));
log("connected to pptgo over streamable http");

const params = new URLSearchParams(location.search);
const project = params.get("project") ?? "dev-deck";

const { contents } = await client.readResource({ uri: "ui://pptgo/editor.html" });
const html = String(contents[0]?.text ?? "");

const iframe = document.createElement("iframe");
iframe.id = "view";
// Dev-only: same-origin lets us inspect the view from the console. Real hosts
// grant allow-scripts alone.
iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
document.getElementById("frame")!.appendChild(iframe);

// The view sends `ui/initialize` as soon as its script runs, which is before we
// can attach a transport. Real hosts avoid the race with the sandbox-proxy
// handshake; here we simply buffer early messages and replay them after connect.
const early: MessageEvent[] = [];
window.addEventListener("message", (event) => {
  if (event.source === iframe.contentWindow) early.push(event);
});

iframe.srcdoc = html;
await new Promise<void>((resolve) => iframe.addEventListener("load", () => resolve(), { once: true }));

const bridge = new AppBridge(
  client,
  { name: "pptgo-dev-host", version: "0.1.0" },
  { tools: { call: {} }, message: {}, displayMode: {}, sizeChange: {} },
);

bridge.oncalltool = async (callParams) => {
  log(`tools/call ${callParams.name} ${JSON.stringify(callParams.arguments ?? {}).slice(0, 120)}`);
  return (await client.callTool(callParams)) as never;
};
bridge.onmessage = async ({ content }) => {
  const text = content.map((c) => ("text" in c ? c.text : c.type)).join(" ");
  log(`ui/message -> "${text}"`);
  return { isError: false };
};
bridge.onrequestdisplaymode = async ({ mode }) => {
  document.body.classList.toggle("fullscreen", mode === "fullscreen");
  log(`display mode -> ${mode}`);
  return { mode };
};
bridge.addEventListener("sizechange", ({ params: size }) => {
  if (size.height) iframe.style.height = `${Math.max(420, size.height)}px`;
});

bridge.oninitialized = () => {
  log("view initialized, sending tool input");
  void bridge.sendToolInput({ arguments: { project } });
};

await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
for (const event of early.splice(0)) {
  window.dispatchEvent(
    new MessageEvent("message", { data: event.data, source: event.source, origin: event.origin }),
  );
}
log(`bridged; project=${project}`);
