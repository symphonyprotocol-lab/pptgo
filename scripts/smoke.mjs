// End-to-end check over a real stdio transport: create a deck, write a slide,
// read it back the way the editor iframe does, and patch text in place.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "pptgo-smoke-"));

const SLIDE = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#101014"/>
  <text x="80" y="300" font-size="72" fill="#ffffff">Hello &amp; welcome</text>
  <text x="80" y="380" font-size="32" fill="#c96442"><tspan>subtitle one</tspan><tspan x="80" dy="44">subtitle two</tspan></text>
</svg>`;

const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) console.log(`  ok  ${name}`);
  else {
    console.log(`FAIL  ${name} ${detail}`);
    failures.push(name);
  }
};

const data = (result) => {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

const client = new Client({ name: "pptgo-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist/index.js")],
  env: { ...process.env, PPTGO_WORKSPACE: workspace },
  stderr: "inherit",
});

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check("tools registered", names.length >= 8, names.join(","));
  const open = tools.find((t) => t.name === "deck_open");
  check("deck_open declares its UI resource", open?._meta?.ui?.resourceUri === "ui://pptgo/editor.html");
  check(
    "legacy resourceUri key populated for older hosts",
    open?._meta?.["ui/resourceUri"] === "ui://pptgo/editor.html",
  );
  check(
    "editor-only tools are hidden from the model",
    tools.find((t) => t.name === "slide_svg")?._meta?.ui?.visibility?.join() === "app",
  );

  const fallback = tools.find((t) => t.name === "pptgo");
  check("pptgo workflow also reachable as a tool", Boolean(fallback), "hosts that ignore prompts need this");
  const started = await client.callTool({
    name: "pptgo",
    arguments: { request: "给 Q3 复盘做 8 页" },
  });
  check(
    "workflow tool returns the guide",
    String(started.content[0].text).includes("deck_open") && String(started.content[0].text).includes("给 Q3 复盘做 8 页"),
  );

  const { prompts } = await client.listPrompts();
  const slash = prompts.find((p) => p.name === "pptgo");
  check("pptgo prompt exposed as a slash command", Boolean(slash), prompts.map((p) => p.name).join(","));
  check(
    "prompt takes a free-form request",
    slash?.arguments?.some((a) => a.name === "request" && a.required),
    JSON.stringify(slash?.arguments),
  );

  const filled = await client.getPrompt({
    name: "pptgo",
    arguments: { request: "给 Q3 复盘做 8 页", project: "smoke-deck" },
  });
  const promptText = filled.messages[0]?.content?.text ?? "";
  check("prompt carries the workflow guide", promptText.includes("deck_open") && promptText.includes("1280x720"));
  check("prompt carries the request and project", promptText.includes("给 Q3 复盘做 8 页") && promptText.includes("smoke-deck"));

  const { resources } = await client.listResources();
  check("editor resource listed", resources.some((r) => r.uri === "ui://pptgo/editor.html"));

  const read = await client.readResource({ uri: "ui://pptgo/editor.html" });
  const item = read.contents[0];
  check("editor served as an MCP App", item.mimeType === "text/html;profile=mcp-app", item.mimeType);
  check("editor html is self-contained", !/src=["']https?:/i.test(item.text), "external script tag found");
  check("editor bundle carries the app runtime", item.text.includes("ui/initialize"));

  await client.callTool({ name: "deck_new", arguments: { name: "smoke-deck" } });
  await client.callTool({ name: "slide_write", arguments: { project: "smoke-deck", page: "P01", svg: SLIDE } });

  const state = data(await client.callTool({ name: "deck_state", arguments: { project: "smoke-deck" } }));
  check("deck_state lists the new slide", state.slides?.[0]?.id === "P01", JSON.stringify(state.slides));

  const runs = data(await client.callTool({ name: "slide_read", arguments: { project: "smoke-deck", page: "P01" } }));
  check("text runs enumerated in document order", runs.runs?.map((r) => r.text).join("|") === "Hello & welcome|subtitle one|subtitle two", JSON.stringify(runs.runs));

  const patched = data(
    await client.callTool({
      name: "slide_patch_text",
      arguments: { project: "smoke-deck", page: "P01", index: 2, text: "改过的副标题 <b>" },
    }),
  );
  check("patch replaces only the targeted run", patched.svg?.includes("改过的副标题 &lt;b&gt;") && patched.svg.includes("subtitle one"));
  check("patch keeps slide structure intact", (patched.svg.match(/<tspan/g) || []).length === 2);

  const reread = data(await client.callTool({ name: "slide_read", arguments: { project: "smoke-deck", page: "P01" } }));
  check("patch persisted to disk", reread.runs?.[2]?.text === "改过的副标题 <b>");

  const exported = await client.callTool({ name: "deck_export", arguments: { project: "smoke-deck" } });
  check("export reports missing ppt-master clearly", exported.isError === true && /PPT_MASTER_HOME/.test(exported.content[0].text));
} finally {
  await client.close().catch(() => {});
  await rm(workspace, { recursive: true, force: true });
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
