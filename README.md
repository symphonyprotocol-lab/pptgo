# pptgo

An online slide editor — **PPTist-style, in the browser**, built with Next.js + shadcn/ui.

> **改版说明.** pptgo started as an MCP App that only ran *inside Claude Desktop*: Claude
> authored slides as SVG, you edited them in an iframe in the chat, and a Python pipeline
> turned them into `.pptx`. That half is gone — commit `24af4ce` deleted the MCP server, and
> `0a92f6b` is the snapshot taken right before it, if you want to read the old code. What is
> left is a standalone web app in [`web/`](web): open a page, edit slides directly, export a
> native `.pptx`. No MCP host, no Python, no Claude required.

The whole thing self-hosts with one command — Next.js, PostgreSQL and an S3-compatible
object store, no third-party service in the loop:

```bash
./scripts/gen-secrets.sh   # writes .env and generates the three secrets in it
docker compose up -d --build
```

`gen-secrets.sh` only fills blanks, so it is safe to re-run. Sign-in additionally needs a
Google OAuth client — without one the stack still comes up, with the landing page and the
browser-local editor.

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
| **Language** | 中文 / English, switchable from the landing page header; the choice is a cookie, so the server renders the first byte in the right language instead of swapping after hydration |

| Path | What lives there |
|---|---|
| [`web/src/types/slides.ts`](web/src/types/slides.ts) | slide + element data model |
| [`web/src/store/editor.ts`](web/src/store/editor.ts) | zustand store: slides, selection, history, clipboard, tables, animations |
| [`web/src/lib/`](web/src/lib) | canvas constants, shape library, geometry, snapping, HTML sanitizing, colour, rich text, storage |
| [`web/src/lib/export.ts`](web/src/lib/export.ts) · [`import-pptx.ts`](web/src/lib/import-pptx.ts) | PPTX out and in |
| [`web/src/components/editor/`](web/src/components/editor) | toolbar, slide list, canvas, property panel, layer panel, present view |
| [`web/src/auth.ts`](web/src/auth.ts) · [`src/db/`](web/src/db) | Auth.js v5 (Google only) and the Drizzle schema |
| [`web/src/lib/decks.ts`](web/src/lib/decks.ts) · [`s3.ts`](web/src/lib/s3.ts) | deck data access with ownership checks, object-storage client |
| [`web/src/lib/i18n/`](web/src/lib/i18n) | the zh/en message tables, checked against each other by type |

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

**Two rooms, one token set.** The landing page, sign-in, dashboard and editor all read the
same shadcn variables — one hue axis, tight corners, and a single scarce lime accent spent
only on buttons, focus rings and selected states. Daylight (`:root`) and Darkroom (`.dark`)
are that same design in different light; only the direction of the ramp flips, and the
accent walks down the ramp in daylight because an electric lime on white paper is invisible
as text and glaring as a fill. Which one is live is settled before first paint by a boot
script in `layout.tsx` — system preference by default, overridable by the toggle in the
landing page header, with the raw choice on `<html>` as `data-theme-pref` so the control
renders the right segment without client state. Retheming touches no component. Two things are deliberately
exempt: the canvas floor gets its own `--stage`, a shade below every panel, so the slide
sits in its own pool of light, and everything drawn *inside* a slide uses fixed colours
rather than tokens, because a slide is the user's document rather than a surface the app is
entitled to repaint.

`npm test` runs the vitest suite — 188 cases covering sanitizing, geometry, rich-text runs,
deck migration, locale negotiation, the store, plus PPTX export, PPTX import, and an
export→import round trip that generates and re-parses a real file.

More detail in [`web/README.md`](web/README.md).

## Accounts, storage, deployment

A deck with embedded images runs to megabytes, so a deck is split between the two stores
that suit it: the document is one JSON object in the bucket, and the fields the dashboard
sorts and displays are a row in Postgres.

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
`<AUTH_URL>/api/auth/callback/google`. The session key, the database password and the
object-store secret have no defaults and compose refuses to start without them —
[`scripts/gen-secrets.sh`](scripts/gen-secrets.sh) generates all three. Postgres and rustfs
publish to `127.0.0.1` only; they are exposed at all just so a `npm run dev` outside Docker
can reach them, and `POSTGRES_BIND` / `RUSTFS_BIND` widen that if you mean to. The image
build needs network access beyond the base
image: `next/font` downloads Geist, Geist Mono and Fraunces at build time and inlines them,
so the running container needs no font CDN, but the builder does.

### Continuous deployment

[`ci.yml`](.github/workflows/ci.yml) runs types, lint, tests and the Next build on every
pull request. [`deploy.yml`](.github/workflows/deploy.yml) takes over on merge to `main`:
it builds the web image, pushes it to GHCR tagged with the commit, then over SSH pins that
tag into the server's `.env`, pulls it and restarts the stack. Migrations need no step of
their own — the image runs them before it listens.

The server is never sent a source tree, only a compose file and a tag, so it needs no
toolchain and no checkout, and what serves is what CI built. A rollback is one line: set
`WEB_IMAGE` in the server's `.env` to an earlier tag and `docker compose up -d`.

What the server has to have before the first deploy: Docker, a directory (`/srv/pptgo` by
default) and a `.env` in it with the secrets. The workflow refuses rather than creating
one, because a box with no secrets is a box that was never set up.

Two nginx server blocks are in [`deploy/nginx/`](deploy/nginx) — `pptgo.dev` in front of
the web container, `s3.pptgo.dev` in front of rustfs's API port for anything outside the
compose network that needs the bucket. They listen on 80 and leave TLS to certbot. Both
carry a line that is easy to leave out and hard to diagnose: `/api/mcp` is proxied
unbuffered, because MCP holds a response open and writes to it as the exchange goes on,
and the S3 vhost forwards the client's own `Host`, because SigV4 signs that header and
nginx's default is to replace it — which turns every request into a 403.

What the repository has to have:

| Secret | |
|---|---|
| `SSH_HOST` · `SSH_USER` | where to connect, and as whom |
| `SSH_KEY` | the private half of a key that user accepts |
| `SSH_KNOWN_HOSTS` | the server's public host key — `ssh-keyscan -H <host>`. Pinned rather than accepted on sight, or the deploy key goes to whatever answers on that address |

| Variable | Default |
|---|---|
| `DEPLOY_PATH` | `/srv/pptgo` |
| `PUBLIC_URL` | `https://pptgo.dev` — what the post-deploy check asks for a 200 |
| `SSH_PORT` | `22` |

---

## Repo layout

| Path | What it is |
|---|---|
| [`web/`](web) | the editor — a Next.js app with its own `package.json`, and where all the code lives |
| [`docker-compose.yml`](docker-compose.yml) · [`.env.example`](.env.example) | the self-hosted stack: web, PostgreSQL, rustfs |
| [`package.json`](package.json) | a shell with no dependencies of its own |

The root `package.json` declares no dependencies and holds no code: `dev`, `build`, `start`,
`lint`, `typecheck` and `test` each forward to `web/`, so running any of them from the repo
root and from `web/` does the same thing. Install with `npm install --prefix web`.
