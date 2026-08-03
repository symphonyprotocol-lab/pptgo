# pptgo

An online slide editor — **PPTist-style, in the browser**, built with Next.js + shadcn/ui.

> **改版说明.** pptgo started as an MCP App that only ran *inside Claude Desktop*. It is now
> primarily a standalone web app in [`web/`](web): open a page, edit slides directly, export a
> native `.pptx`. No MCP host, no Python, no Claude required. The original MCP server is still
> in this repo and still works — see [MCP server](#mcp-server-claude-desktop) below — but it is
> no longer the front door.

The whole thing self-hosts with one command — Next.js, PostgreSQL and an S3-compatible
object store, no third-party service in the loop:

```bash
cp .env.example .env   # fill in AUTH_SECRET and the Google OAuth client
docker compose up -d --build
```

Or run just the editor, with no database and no sign-in:

```bash
npm install --prefix web
npm run dev        # http://localhost:3000
```

| Route | What it is | Sign-in |
|---|---|---|
| `/` | landing page | no |
| `/login` | Google sign-in | no |
| `/dashboard` | your decks — new, rename, duplicate, delete | yes |
| `/editor` | the editor, deck kept in the browser's IndexedDB | no |
| `/editor/[id]` | the editor, deck kept in object storage | yes |

## The web editor

| | |
|---|---|
| **Elements** | text, image, shape (28 preset geometries + freehand), line, table, chart (bar / column / line / area / scatter / pie / doughnut / radar), video, audio, LaTeX formula |
| **Canvas** | drag, 8-way resize with rotation compensation, rotate, marquee + multi-select, group/ungroup — groups scale and rotate as a unit — snap guides, grid, ruler, zoom, right-click menu, lock, double-click to edit text or table cells in place |
| **Slides** | thumbnail rail, reorder by drag, duplicate/delete, sections, background (solid / gradient / image, applicable to all), speaker notes, transitions, per-element animations |
| **Editing** | property panel per element type, layer panel, z-order, align, distribute, format painter, hyperlinks, inline rich text (bold / colour / highlight / lists / links / sub-superscript), image crop and tint, shape gradients, shadows, table merge/split, chart data editing, undo/redo, system clipboard, find & replace, keyboard shortcuts |
| **Present** | animation stepping, transitions, pen / highlighter / eraser / laser / blackboard, timer, autoplay, thumbnail navigation, notes, fullscreen, media playback |
| **Mobile** | the canvas runs on pointer events throughout, so mouse, touch and stylus share one path; pinch to zoom, side panels fold into drawers, swipe to page in present mode |
| **Persistence** | IndexedDB autosave, import `.pptx` and JSON, export `.pptx` / PNG / PDF / JSON |
| **Accounts** | Google sign-in, decks autosaved to object storage, dashboard with thumbnails |

| Path | What lives there |
|---|---|
| [`web/src/types/slides.ts`](web/src/types/slides.ts) | slide + element data model |
| [`web/src/store/editor.ts`](web/src/store/editor.ts) | zustand store: slides, selection, history, clipboard, tables, animations |
| [`web/src/lib/`](web/src/lib) | canvas constants, shape library, geometry, snapping, HTML sanitizing, colour, rich text, storage |
| [`web/src/lib/export.ts`](web/src/lib/export.ts) · [`import-pptx.ts`](web/src/lib/import-pptx.ts) | PPTX out and in |
| [`web/src/components/editor/`](web/src/components/editor) | toolbar, slide list, canvas, property panel, layer panel, present view |
| [`web/src/auth.ts`](web/src/auth.ts) · [`src/db/`](web/src/db) | Auth.js v5 (Google only) and the Drizzle schema |
| [`web/src/lib/decks.ts`](web/src/lib/decks.ts) · [`s3.ts`](web/src/lib/s3.ts) | deck data access with ownership checks, object-storage client |

The canvas is a fixed 1000 × 562.5 coordinate space (16:9), CSS-scaled to fit. Export maps
1000 units to 10 inches, so a 24px font becomes ~17pt in PowerPoint. Importing a deck that is not
16:9 scales it uniformly and centres it rather than stretching it.

Two things worth knowing: the editor is loaded with `next/dynamic({ ssr: false })` — element ids
are generated at runtime, so server rendering would always mismatch on hydration. And gradients
have no pptxgenjs equivalent, so they export as the average of their stops — the shape stays a
native, recolourable shape instead of being flattened to an image. Image filters, freehand
strokes and formulas *are* rasterised on export, because OOXML has no way to express them.

**The logo is a 16:9 frame with a resize handle on its corner.** The proportion is the
app's own coordinate space, so the outline reads as a slide rather than a generic box, and
the handle is the one glyph no static slide viewer would ever draw — together, "a slide you
can grab". Two shapes is all it is, which is why it still reads at 16px in a browser tab
and can be the editor toolbar's entire wordmark. One source in
[`logo.tsx`](web/src/components/site/logo.tsx), redrawn for the tab icon and the iOS icon.

**The landing page's first screen is a working canvas**, not a picture of one: the headline
is a text element you can drag, resize from eight handles (with the same rotation
compensation the real canvas uses) and rotate, with a status bar reporting the selection's
geometry live. Claiming "drag to position, pull to resize" over a screenshot is the part
that always rings false. Below it there are no feature cards — six equal tiles with a
numeral, a bold line and three lines of body *is* a slide layout, which is a strange thing
for a slide tool's homepage to be — just a ruled spec sheet.

**One theme, one token set.** The landing page, sign-in, dashboard and editor all read the
same shadcn variables: graphite chrome, bone text, and a single electric-lime accent spent
only on buttons, focus rings and selected states. `:root` *is* the dark theme — there is no
`.dark` block, and `<html>` carries the `dark` class purely so shadcn's own `dark:` branches
apply. Retheming touches no component. Two things are deliberately exempt: the canvas floor
gets its own deeper `--stage` so the slide floats in a pool of light, and everything drawn
*inside* a slide uses fixed colours rather than tokens, because a slide is the user's
document rather than a surface the app is entitled to repaint.

`npm test` (in `web/`) runs the vitest suite — 174 cases covering sanitizing, geometry,
rich-text runs, deck migration, the store, plus PPTX export, PPTX import, and an
export→import round trip that generates and re-parses a real file.

More detail in [`web/README.md`](web/README.md).

## Accounts, storage, deployment

A deck with embedded images runs to megabytes, so the two halves are stored where each
belongs: the document is one JSON object in the bucket, and the fields the dashboard sorts
and displays are a row in Postgres.

| | PostgreSQL | rustfs (S3-compatible) |
|---|---|---|
| holds | `user`, `account`, `session`, `verificationToken`, `deck` | `decks/<id>/deck.json`, `decks/<id>/thumbnail.png` |

Sessions are database rows rather than a self-contained JWT, so signing out takes effect
at once. Every deck read and write filters by owner *in the same statement* — someone
else's id and a nonexistent id return the same 404, and no code path loads a row and
checks ownership afterwards. The bucket is created on first write, so there is nothing to
provision.

[`docker-compose.yml`](docker-compose.yml) brings up all three services. The web image is
Next's standalone output and migrates the database on start; because standalone bundles
drizzle-orm into the server chunks rather than shipping it in `node_modules`,
[`web/scripts/migrate.mjs`](web/scripts/migrate.mjs) reimplements drizzle's migration
bookkeeping against `pg` alone — same `drizzle.__drizzle_migrations` table, so
`drizzle-kit migrate` stays interchangeable with it.

Sign-in needs a Google OAuth client whose authorised redirect URI is
`<AUTH_URL>/api/auth/callback/google`. Everything else has a working default in
[`.env.example`](.env.example). The image build needs network access beyond the base
image: `next/font` downloads Geist and Bricolage Grotesque at build time and inlines them,
so the running container needs no font CDN, but the builder does.

---

## MCP server (Claude Desktop)

The original pptgo: a visual slide editor that lives **inside Claude Desktop**, built as an
[MCP App](https://modelcontextprotocol.io/extensions/apps/overview) (the standard
behind [MCP-UI](https://mcpui.dev)) on top of the
[ppt-master](https://github.com/hugohe3/ppt-master) pipeline.

Claude authors slides as SVG; you see them rendered in the chat, click any text to
retype it, and export a **native, editable .pptx** — without leaving the conversation.

```
Claude Desktop  ──ui:// iframe──►  pptgo editor  (thumbnails, click-to-edit, export)
       │                                │
       │ tools/call                     │ tools/call (app-initiated)
       ▼                                ▼
   pptgo MCP server (stdio, local)  ──►  ppt-master scripts (Python)
                              finalize_svg → svg_quality_checker → svg_to_pptx → .pptx
```

### Why Claude Desktop

MCP Apps render only in hosts with a UI. **Claude Code and Codex CLI do not render
them.** Claude.ai in the browser renders them but can only reach remote MCP servers,
so it cannot touch your local files or run Python. Claude Desktop is the one host
that does both: renders the iframe *and* runs a local stdio server.

The server still works headlessly in Claude Code — every tool is callable, you just
get no visual editor.

### Setup

```bash
npm install && npm run build
```

#### Every Claude Code session (all projects)

```bash
claude mcp add --scope user pptgo \
  -e PPT_MASTER_HOME=$PWD/vendor/ppt-master \
  -e PPTGO_PYTHON=$PWD/vendor/venv/bin/python \
  -- node $PWD/dist/index.js
npm run install-command
```

`--scope user` writes to the top-level `mcpServers` in `~/.claude.json`, and
`install-command` copies `/pptgo` into `~/.claude/commands/`. Both are global; the
repo-local `.claude/commands/pptgo.md` only ever covers sessions opened here. Re-run
`npm run install-command` after editing `prompts/pptgo.md`.

#### Claude Desktop chat

Point Claude Desktop at it too. Edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pptgo": {
      "command": "node",
      "args": ["/absolute/path/to/pptgo/dist/index.js"],
      "env": {
        "PPT_MASTER_HOME": "/absolute/path/to/ppt-master"
      }
    }
  }
}
```

Restart Claude Desktop, then type `/pptgo` — or just ask it to *"用 pptgo 新建一个 deck"*.

### The `/pptgo` command

The server registers an MCP prompt named `pptgo`. Where a host renders MCP prompts,
it shows up as a slash command — `/mcp__pptgo__pptgo` in Claude Code. It takes the
request as a free-form argument plus an optional existing project:

```
/pptgo 给 Q3 复盘做 8 页，深色科技风
```

It expands into the workflow guide in [`prompts/pptgo.md`](prompts/pptgo.md) — pick a
project, agree on an outline, write each page with `slide_write`, run `deck_check`,
open the editor, export on request — followed by the ppt-master SVG conventions
(1280×720 canvas, `data-pptx-page-role`, `<text>`/`<tspan>` only, uppercase hex,
PPT-safe fonts, no external references).

`npm run build` also generates `.claude/commands/pptgo.md` from that same file, which
gives Claude Code a literal `/pptgo` in this repo. Edit `prompts/pptgo.md` — never the
generated copies.

**Host support varies.** Claude Desktop's chat announces tools but not prompts
(`[localMcpBridge] announcing pptgo: 7 tool(s)` in `~/Library/Logs/Claude/mcp.log`),
and claude.ai in a browser cannot see local servers at all. So the same workflow is
also registered as a **tool** named `pptgo`: typing `/pptgo 给 Q3 复盘做 8 页` where the
host has no such command just sends it as text, and the model routes it to that tool.
Three surfaces, one guide.

### ppt-master (needed for PPTX export only)

```bash
git clone https://github.com/hugohe3/ppt-master vendor/ppt-master
python3 -m venv vendor/venv
vendor/venv/bin/pip install -r vendor/ppt-master/requirements.txt
```

Then set `PPT_MASTER_HOME=<repo>/vendor/ppt-master` and
`PPTGO_PYTHON=<repo>/vendor/venv/bin/python`. The venv keeps ppt-master's
dependencies out of your global Python; verified on Python 3.13.

Without `PPT_MASTER_HOME`, everything works except export, and decks live in
`~/.pptgo/projects`. With it, decks live in `<ppt-master>/projects` so both tools
see the same workspace.

| Variable | Default | Purpose |
|---|---|---|
| `PPT_MASTER_HOME` | — | ppt-master checkout; enables PPTX export |
| `PPTGO_PYTHON` | `python3` | Interpreter for ppt-master scripts (point at a venv) |
| `PPTGO_WORKSPACE` | `<ppt-master>/projects` or `~/.pptgo/projects` | Where decks live |

### Tools and prompts

| Name | Who calls it | What it does |
|---|---|---|
| `pptgo` (prompt) | user | The slash command, where the host renders MCP prompts |
| `pptgo` (tool) | model | Same guide, for hosts that only announce tools |
| `deck_open` | model | Opens the deck in the visual editor (this is the MCP App) |
| `deck_list` / `deck_new` | model | List / create projects |
| `slide_write` | model | Write one complete SVG page — this is how Claude authors |
| `slide_read` | model | Read a page's text runs (or full SVG with `full: true`) |
| `deck_check` | model | ppt-master's SVG quality checker — run it after authoring |
| `deck_export` | model + editor | finalize → quality gate → native .pptx |
| `deck_state`, `slide_svg`, `slide_patch_text` | editor only | Data + edits for the iframe |

The editor-only tools are marked `_meta.ui.visibility: ["app"]` so whole SVG
documents never enter the conversation's context.

### Development

```bash
npm run dev      # the web editor at http://localhost:3000
npm run dev:mcp  # fake MCP Apps host at http://localhost:4321/?project=<name>
npm run smoke    # end-to-end check over a real stdio transport
npm run typecheck
```

The two halves of this repo run separately. `npm run dev` starts the Next.js editor
with hot reload and nothing else — no build step, no MCP server — which is what you
want for almost all work on the editor itself.

`npm run dev:mcp` is for the MCP side: it builds the server and serves a minimal host
page that does what Claude Desktop does — reads the `ui://` resource, renders it in a
sandboxed iframe, bridges JSON-RPC, and proxies tool calls — so the in-conversation
experience can be exercised in a normal browser.

### Design notes

- **SVG is the editing surface.** A .pptx cannot render in an iframe, but
  ppt-master's intermediate SVG can, and it round-trips back to native DrawingML.
  `pptx_to_svg.py` also exists, so importing an existing deck is a natural next step.
- **The App SDK is inlined** into the UI resource at build time, so the iframe needs
  no CSP allowance for a CDN and works offline.
- **Text edits are surgical.** `slide_patch_text` replaces the characters of one text
  run and touches nothing else — no re-layout, no restyling.
- **Export uses ppt-master's quick-generate path.** The release path requires a full
  planning workspace (`design_spec.md` + `spec_lock.md`) that pptgo does not produce,
  so `deck_export` runs the SVG quality gate instead and passes `--quick-generate`.

### Status / known gaps

- Text runs are located with a source scan rather than a full XML parse. It handles
  `<text>` and `<tspan>` including entities; exotic markup (CDATA, `<switch>`) is untested.
- Editing is text-only so far. Moving, resizing, restyling, adding and deleting
  elements all still go through Claude.
- `deck_export` runs `finalize_svg.py` every time; on large decks that is the slow part.
- Not yet verified inside Claude Desktop itself. Verified so far: the stdio smoke test,
  the full editor loop through the dev host (render → click text → edit → written to
  disk), and a real export producing a 2-slide .pptx with native editable text.

---

## Repo layout

| Path | What it is |
|---|---|
| [`web/`](web) | the web editor (Next.js) — the main project now |
| [`docker-compose.yml`](docker-compose.yml) · [`.env.example`](.env.example) | the self-hosted stack: web, PostgreSQL, rustfs |
| [`src/`](src) | the MCP server (TypeScript, stdio) |
| [`prompts/`](prompts) | the `/pptgo` workflow guide, source of the generated slash commands |
| [`dev/`](dev), [`scripts/`](scripts) | fake MCP Apps host, build + smoke scripts |

The two halves share a name and a goal but no code: `web/` has its own `package.json`,
and the root `npm run build` does not touch it.
