import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createUIResource } from "@mcp-ui/server";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { NO_PPT_MASTER_HINT, resolveConfig, type Config } from "./config.js";
import {
  createProject,
  listProjects,
  listTextRuns,
  patchTextRun,
  projectDir,
  readDeck,
  readSlide,
  writeSlide,
  SLIDES_SUBDIR,
} from "./deck.js";
import { runScript, tail } from "./pptmaster.js";

const EDITOR_URI = "ui://pptgo/editor.html";

const here = dirname(fileURLToPath(import.meta.url));

/** Resolves a build artifact whether we run bundled, transpiled, or from src. */
function loadAsset(...relative: string[]): string {
  for (const base of [here, join(here, ".."), join(here, "..", "dist")]) {
    const candidate = join(base, ...relative);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  throw new Error(`Missing build artifact ${relative.join("/")} — run \`npm run build\` first`);
}

export function loadEditorHtml(): string {
  return loadAsset("ui", "index.html");
}

/** The /pptgo workflow guide, shared with the generated Claude Code command. */
export function loadWorkflowGuide(): string {
  return loadAsset("prompts", "pptgo.md");
}

function ok(data: Record<string, unknown>, summary?: string) {
  return {
    content: [{ type: "text" as const, text: summary ?? JSON.stringify(data) }],
    structuredContent: data,
  };
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Newest .pptx written under a directory tree after `since`. */
async function newestPptx(dir: string, since: number): Promise<string | null> {
  if (!existsSync(dir)) return null;
  let best: { path: string; mtime: number } | null = null;
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
      } else if (entry.name.toLowerCase().endsWith(".pptx")) {
        const info = await stat(path);
        if (info.mtimeMs >= since && (!best || info.mtimeMs > best.mtime)) {
          best = { path, mtime: info.mtimeMs };
        }
      }
    }
  };
  await walk(dir, 0);
  return best ? (best as { path: string }).path : null;
}

export function createPptgoServer(cfg: Config = resolveConfig()): McpServer {
  const server = new McpServer(
    { name: "pptgo", version: "0.1.0" },
    {
      instructions:
        "pptgo edits slide decks as SVG and exports them to native PPTX via the ppt-master pipeline. " +
        "Author or revise a slide with slide_write (one complete SVG per page, 1280x720 unless the deck says otherwise), " +
        "then call deck_open to show the visual editor. Never paste slide SVG into chat — write it with slide_write.",
    },
  );

  const editor = createUIResource({
    uri: EDITOR_URI,
    content: { type: "rawHtml", htmlString: loadEditorHtml() },
    encoding: "text",
    uiMetadata: { "preferred-frame-size": ["960px", "640px"] },
  });

  registerAppResource(
    server,
    "pptgo editor",
    EDITOR_URI,
    { _meta: { ui: { prefersBorder: false } } },
    async () => ({ contents: [editor.resource] }),
  );

  // Hosts surface prompts as slash commands: `/pptgo` in Claude Desktop,
  // `/mcp__pptgo__pptgo` in Claude Code.
  server.registerPrompt(
    "pptgo",
    {
      title: "pptgo — 做一份 PPT",
      description: "Author or revise a deck with pptgo, preview it, and export native PPTX.",
      argsSchema: {
        request: z.string().describe("What to make or change, e.g. 给 Q3 复盘做 8 页"),
        project: z.string().optional().describe("Existing project name, if you already have one"),
      },
    },
    ({ request, project }) => {
      const target = project?.trim()
        ? `Work in the existing project "${project.trim()}".`
        : "Choose or create the project as step 1 describes.";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${loadWorkflowGuide()}\n---\n\n${target}\n\nRequest: ${request}`,
            },
          },
        ],
      };
    },
  );

  // Not every host renders MCP prompts (Claude Desktop's chat announces tools
  // only), so the same workflow is reachable as a tool. That keeps "/pptgo"
  // working even where the host just sends it as plain text.
  server.registerTool(
    "pptgo",
    {
      title: "Start the pptgo deck workflow",
      description:
        "Start or resume the pptgo slide workflow. Call this whenever the user types /pptgo, says 用 pptgo, or asks to make, revise, or export a slide deck. " +
        "Returns the authoring steps and the SVG conventions to follow — read them before writing any slide.",
      inputSchema: {
        request: z.string().describe("What the user wants to make or change"),
        project: z.string().optional().describe("Existing project name, if known"),
      },
    },
    async ({ request, project }) => {
      const target = project?.trim()
        ? `Work in the existing project "${project.trim()}".`
        : "Choose or create the project as step 1 describes.";
      return {
        content: [
          { type: "text" as const, text: `${loadWorkflowGuide()}\n---\n\n${target}\n\nRequest: ${request}` },
        ],
      };
    },
  );

  // --- model-facing tools ---------------------------------------------------

  registerAppTool(
    server,
    "deck_open",
    {
      title: "Open deck in the visual editor",
      description:
        "Open a slide project in the pptgo visual editor so the user can see every page, retype text directly, and export to PPTX.",
      inputSchema: { project: z.string().describe("Project name, e.g. quarterly-review") },
      _meta: { ui: { resourceUri: EDITOR_URI } },
    },
    async ({ project }) => {
      const deck = await readDeck(cfg, project);
      if (!existsSync(deck.projectDir)) return fail(`Project "${project}" not found under ${cfg.workspace}`);
      return ok(
        { project: deck.project, slides: deck.slides.length },
        `Opened "${deck.project}" (${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}) in the editor.`,
      );
    },
  );

  server.registerTool(
    "deck_list",
    {
      title: "List decks",
      description: "List slide projects in the pptgo workspace.",
      inputSchema: {},
    },
    async () => {
      const projects = await listProjects(cfg);
      const lines = projects.map((p) => `- ${p.name} (${p.slides} slides)`);
      return ok(
        { workspace: cfg.workspace, projects },
        projects.length
          ? `Workspace ${cfg.workspace}\n${lines.join("\n")}`
          : `No projects yet in ${cfg.workspace}. Create one with deck_new.`,
      );
    },
  );

  server.registerTool(
    "deck_new",
    {
      title: "Create deck",
      description: "Create an empty slide project in the pptgo workspace.",
      inputSchema: { name: z.string().describe("Project name (letters, digits, - and _)") },
    },
    async ({ name }) => {
      try {
        const dir = await createProject(cfg, name);
        return ok({ project: name, projectDir: dir }, `Created ${dir}. Write slides with slide_write.`);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  server.registerTool(
    "slide_write",
    {
      title: "Write a slide",
      description:
        "Write one complete SVG slide into a project, creating or replacing that page. " +
        "Use ppt-master SVG conventions: a single root <svg> with an explicit canvas size, flat <text> elements, no external references.",
      inputSchema: {
        project: z.string(),
        page: z.string().describe("Page id such as P01 — determines slide order"),
        svg: z.string().describe("Complete SVG document for this page"),
      },
    },
    async ({ project, page, svg }) => {
      try {
        const path = await writeSlide(cfg, project, page, svg);
        return ok({ project, page, path }, `Wrote ${page} (${svg.length} bytes) to ${path}`);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  server.registerTool(
    "slide_read",
    {
      title: "Read a slide",
      description:
        "Read one slide back. Returns the text runs by default; pass full=true only when the whole SVG is needed, because slide SVGs are large.",
      inputSchema: {
        project: z.string(),
        page: z.string(),
        full: z.boolean().optional().describe("Return the complete SVG source"),
      },
    },
    async ({ project, page, full }) => {
      try {
        const svg = await readSlide(cfg, project, page);
        if (full) return ok({ project, page, svg }, svg);
        const runs = listTextRuns(svg).filter((r) => r.text.length > 0);
        return ok(
          { project, page, bytes: svg.length, runs },
          runs.map((r) => `${r.index}: ${r.text}`).join("\n") || "(no text on this slide)",
        );
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  // --- shared with the editor iframe ----------------------------------------

  server.registerTool(
    "deck_export",
    {
      title: "Export PPTX",
      description: "Run the ppt-master pipeline (finalize_svg + svg_to_pptx) and produce a native .pptx.",
      inputSchema: { project: z.string(), skipFinalize: z.boolean().optional() },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ project, skipFinalize }) => {
      if (!cfg.pptMasterHome) return fail(NO_PPT_MASTER_HINT);
      const dir = projectDir(cfg, project);
      if (!existsSync(join(dir, SLIDES_SUBDIR))) return fail(`Project "${project}" has no ${SLIDES_SUBDIR}/ directory`);
      const startedAt = Date.now() - 1000;

      // ppt-master's release path expects a full planning workspace
      // (design_spec.md + spec_lock.md). pptgo authors slides directly, so it
      // uses the quick-generate path, which gates on the SVG quality report
      // instead of the planning artifacts.
      if (!skipFinalize) {
        const finalize = await runScript(cfg, "finalize_svg.py", [dir]);
        if (!finalize.ok) return fail(`finalize_svg.py failed:\n${tail(finalize.stderr || finalize.stdout)}`);
      }
      const quality = await runScript(cfg, "svg_quality_checker.py", [
        dir,
        "--quick-generate",
        "--stage",
        "final",
        "--json",
      ]);
      if (!quality.ok) {
        return fail(
          `SVG quality gate failed — fix the slides and retry:\n${tail(quality.stdout || quality.stderr, 20)}`,
        );
      }
      const exported = await runScript(cfg, "svg_to_pptx.py", [dir, "--quick-generate"]);
      if (!exported.ok) return fail(`svg_to_pptx.py failed:\n${tail(exported.stderr || exported.stdout)}`);

      const pptx =
        (await newestPptx(dir, startedAt)) ?? (await newestPptx(join(cfg.pptMasterHome, "exports"), startedAt));
      return ok(
        { project, pptx, log: tail(exported.stdout, 6) },
        pptx ? `Exported ${pptx}` : `Export finished:\n${tail(exported.stdout, 6)}`,
      );
    },
  );

  server.registerTool(
    "deck_check",
    {
      title: "Check slide quality",
      description:
        "Run ppt-master's SVG quality checker on a project. Use it after writing slides to catch anything that would break the PPTX export.",
      inputSchema: { project: z.string() },
    },
    async ({ project }) => {
      if (!cfg.pptMasterHome) return fail(NO_PPT_MASTER_HINT);
      const result = await runScript(cfg, "svg_quality_checker.py", [
        projectDir(cfg, project),
        "--quick-generate",
        "--stage",
        "final",
        "--json",
      ]);
      const report = tail(result.stdout || result.stderr, 30);
      return result.ok ? ok({ project, passed: true, report }, report) : fail(report);
    },
  );

  // --- editor-only tools ----------------------------------------------------
  // visibility ["app"] keeps these out of the model's tool list: they move
  // whole SVG documents, which would waste the conversation's context.

  server.registerTool(
    "deck_state",
    {
      description: "Editor data source: slide list for a project.",
      inputSchema: { project: z.string() },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ project }) => {
      const deck = await readDeck(cfg, project);
      return ok({
        project: deck.project,
        projectDir: deck.projectDir,
        slides: deck.slides,
        canExport: deck.canExport,
      });
    },
  );

  server.registerTool(
    "slide_svg",
    {
      description: "Editor data source: full SVG for one page.",
      inputSchema: { project: z.string(), page: z.string() },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ project, page }) => {
      try {
        return ok({ project, page, svg: await readSlide(cfg, project, page) });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  server.registerTool(
    "slide_patch_text",
    {
      description: "Editor action: replace the text of one run on a slide, keeping all styling intact.",
      inputSchema: {
        project: z.string(),
        page: z.string(),
        index: z.number().int().min(0),
        text: z.string(),
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ project, page, index, text }) => {
      try {
        const svg = await readSlide(cfg, project, page);
        const patched = patchTextRun(svg, index, text);
        await writeSlide(cfg, project, page, patched);
        return ok({ project, page, index, svg: patched });
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  return server;
}
