import "server-only"
import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import {
  MAX_DECKS_PER_OWNER,
  blankDeck,
  countDecks,
  createDeck,
  encodeDeck,
  listDecks,
  readDeck,
  writeDeck,
} from "@/lib/decks"
import { createSlide, newId } from "@/lib/factory"
import { DEFAULT_THEME } from "@/lib/constants"
import { SHARE_LINK_TTL_DAYS, previewLink } from "@/lib/share-link"
import { MAX_SHARE_PASSWORD, deleteShare, readShare, upsertShare } from "@/lib/shares"
import { buildElement, elementSpec } from "./element-schema"
import { LAYOUT_CATALOGUE, layoutSpec, renderLayout } from "./design/layouts"
import { THEME_PRESET_IDS, presetTheme, resolveTheme, themeCatalogue } from "./design/themes"
import {
  CONTENT_HEIGHT,
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
  COLUMN,
  COLUMNS,
  GUTTER,
  MARGIN,
  MIN_READABLE,
  asPoints,
} from "./design/tokens"
import { outlineDeck } from "./outline"
import { toStoredHtml } from "./text"
import type { Deck, Slide, SlideElement } from "@/types/slides"

/**
 * The sixteen tools.
 *
 * Granularity is a page for writing and an element for adjusting, which is how the work
 * actually arrives: a deck is composed a slide at a time, and revised one box at a time.
 * There is deliberately no tool that writes a whole deck — it would let a model buffer
 * everything and emit it at the end, and the point of the preview page is that a person
 * watches the deck appear. It would also mean re-uploading megabytes to fix a typo.
 *
 * Three of them work a level up from the rest. `slide_layout` takes the words and puts
 * them on a page type, doing the arithmetic here rather than asking the model to do it
 * blind; `deck_theme_preset` sets a whole look from one name; `design_catalog` is what
 * both are read from. They compose with the others rather than replacing them — a laid-out
 * slide is ordinary elements, so `element_patch` still adjusts one, and `slide_write`
 * still writes a page no layout covers.
 *
 * Every mutating tool takes `baseVersion` and every one of them can come back refused. The
 * refusal is a tool result rather than a thrown error: "someone else changed this" is
 * information the model should act on, not a transport failure.
 */

type Result = {
  content: { type: "text"; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

function ok(data: Record<string, unknown>): Result {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data }
}

function fail(message: string, extra: Record<string, unknown> = {}): Result {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message, ...extra }, null, 1) }],
    isError: true,
  }
}

const DECK_NOT_FOUND = "No deck with that id, or it belongs to someone else."

export interface ToolContext {
  ownerId: string
  /** public origin, for the preview links the tools hand back */
  origin: string
}

export function registerTools(server: McpServer, { ownerId, origin }: ToolContext): void {
  /**
   * Signed, so the link works for whoever it is handed to.
   *
   * The person an agent is writing for is on the other side of a chat window, not
   * necessarily signed in here — often without an account at all — and a preview link that
   * first demands a Google login is not a link, it is a detour. The signature says "read
   * this one deck, for a week"; see `lib/share-link.ts` for what that does and does not
   * authorise.
   */
  const previewUrl = (deckId: string) => previewLink(origin, deckId, ownerId)

  /**
   * Read, change, write — with the version the caller started from.
   *
   * `retry` re-reads and replays the change once when the write is refused. That is safe
   * for a targeted patch, which means the same thing applied to a newer document, and
   * unsafe for a whole-page replacement, which would silently bury whatever arrived in
   * between. Only `element_patch` asks for it.
   */
  async function mutate(
    deckId: string,
    baseVersion: number,
    change: (deck: Deck) => Deck | string,
    { retry = false, extra }: { retry?: boolean; extra?: () => Record<string, unknown> } = {},
  ): Promise<Result> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)

      const current = found.summary.version
      const stale = current !== baseVersion
      if (stale && !retry) {
        return fail(
          `The deck has moved on from version ${baseVersion} — it is now at ${current}. ` +
            `Read it again with deck_outline before writing, or your page would bury ` +
            `whatever arrived in between.`,
          { version: current },
        )
      }

      const changed = change(found.deck)
      if (typeof changed === "string") return fail(changed)

      const encoded = encodeDeck(changed)
      if (!encoded) return fail("The deck would be over the 25MB limit.")

      // `current` rather than `baseVersion`: they are equal unless this is a rebase, and
      // the write is still guarded — a third writer landing between the read above and
      // this line is refused exactly as it should be
      const written = await writeDeck(deckId, ownerId, changed, current, encoded)

      if (written.ok) {
        return ok({
          deckId,
          version: written.summary.version,
          slideCount: written.summary.slideCount,
          previewUrl: await previewUrl(deckId),
          // said out loud rather than hidden: the deck was not what the caller thought
          ...(stale ? { rebasedFrom: baseVersion, wasAt: current } : {}),
          ...(extra?.() ?? {}),
        })
      }
      if (written.reason === "not-found") return fail(DECK_NOT_FOUND)
      if (!retry) {
        return fail(
          `Another writer changed the deck first — it is now at version ${written.version}. ` +
            `Read it again and reapply.`,
          { version: written.version },
        )
      }
    }

    return fail(
      "The deck is being written continuously by something else — two attempts were both refused.",
    )
  }

  const findSlide = (deck: Deck, slideId: string) =>
    deck.slides.findIndex((slide) => slide.id === slideId)

  /**
   * Put a built page into the deck, replacing one or inserting one.
   *
   * Shared by `slide_write` and `slide_layout` because the difference between them is
   * entirely upstream — one is handed elements and the other computes them. Everything
   * from here down is the same operation, and having it once is what stops a laid-out
   * slide and a written one from being subtly different objects.
   */
  function placeSlide(
    deck: Deck,
    written: {
      slideId?: string
      index?: number
      elements: SlideElement[]
      background?: { type?: "solid" | "gradient" | "image"; color?: string; image?: string }
      notes?: string
      section?: string
      transition?: "none" | "fade" | "slideX" | "slideY" | "zoom"
    },
  ): { deck: Deck; slideId: string } | string {
    const existing = written.slideId ? findSlide(deck, written.slideId) : -1
    if (written.slideId && existing < 0) return `No slide ${written.slideId} in this deck.`

    const previous: Slide | undefined = existing >= 0 ? deck.slides[existing] : undefined
    const slide = createSlide({
      ...previous,
      id: previous?.id ?? newId(),
      elements: written.elements,
      ...(written.notes === undefined ? {} : { notes: written.notes }),
      ...(written.section === undefined ? {} : { section: written.section }),
      ...(written.transition === undefined ? {} : { transition: written.transition }),
      ...(written.background === undefined
        ? {}
        : {
            background: {
              ...(previous?.background ?? { type: "solid" as const, color: "#ffffff" }),
              ...written.background,
            },
          }),
    })

    const slides = [...deck.slides]
    if (existing >= 0) slides[existing] = slide
    else slides.splice(written.index ?? slides.length, 0, slide)
    return { deck: { ...deck, slides }, slideId: slide.id }
  }

  // ── reading ────────────────────────────────────────────────────────────────

  server.registerTool(
    "deck_list",
    {
      title: "List decks",
      description:
        "Every deck on this account, without its slides. Start here when the user names a deck rather than giving an id.",
      inputSchema: z.object({}),
    },
    async () => {
      const decks = await listDecks(ownerId)
      return ok({
        decks: decks.map((deck) => ({
          deckId: deck.id,
          title: deck.title,
          slideCount: deck.slideCount,
          version: deck.version,
          updatedAt: deck.updatedAt,
        })),
      })
    },
  )

  server.registerTool(
    "deck_outline",
    {
      title: "Read a deck's structure",
      description:
        "The structure of a deck: every slide, every element's position and a shortened version of what it says, plus geometry that looks wrong (elements off the canvas, blocks of text on top of each other). This is how you see a deck — read it before writing, and again afterwards to check the result. It omits colours, fonts and image data; use slide_read when you need those.",
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      return ok({
        ...outlineDeck(deckId, found.deck, found.summary.version, await previewUrl(deckId)),
      })
    },
  )

  server.registerTool(
    "slide_read",
    {
      title: "Read one slide in full",
      description:
        "One slide exactly as stored, with every field. Use it when you need a detail the outline leaves out — a colour, a font size, a table's cells.",
      inputSchema: z.object({ deckId: z.string(), slideId: z.string() }),
    },
    async ({ deckId, slideId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      const index = findSlide(found.deck, slideId)
      if (index < 0) return fail(`No slide ${slideId} in this deck.`)
      return ok({ version: found.summary.version, index, slide: found.deck.slides[index] })
    },
  )

  server.registerTool(
    "deck_preview",
    {
      title: "Link to the live preview",
      description:
        `The URL where a person can watch this deck, updating as you write. Give it to the user early — they see the deck take shape while you work. The link carries its own read-only access and needs no sign-in, so anyone it is forwarded to can view the deck for the next ${SHARE_LINK_TTL_DAYS} days; say so when you hand it over, and do not post it anywhere public. The editorUrl is for the owner and does ask for a sign-in.`,
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      return ok({
        deckId,
        title: found.deck.title,
        version: found.summary.version,
        previewUrl: await previewUrl(deckId),
        editorUrl: `${origin}/editor/${deckId}`,
      })
    },
  )

  // ── sharing ────────────────────────────────────────────────────────────────

  /*
    A share link is a different promise from the preview link above. The preview link is
    signed and expires; this one is a row, so it lasts until it is revoked, it can be read
    back tomorrow to copy again, and it can be opened for editing. That also makes it the
    more consequential of the two to hand out, which is why the descriptions say plainly
    what each call puts into the world.
  */

  server.registerTool(
    "deck_share_read",
    {
      title: "Check a deck's share link",
      description:
        "Whether this deck has a share link, and what it allows. Returns shared:false when there is none. Read this before offering to change a link — an owner may already have one out with people, and deck_share would replace its settings under them.",
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      const share = await readShare(deckId, ownerId)
      if (!share) return ok({ deckId, shared: false })
      return ok({
        deckId,
        shared: true,
        url: `${origin}${share.path}`,
        mode: share.mode,
        hasPassword: share.hasPassword,
        updatedAt: share.updatedAt,
      })
    },
  )

  server.registerTool(
    "deck_share",
    {
      title: "Publish a share link",
      description:
        "Turns on a public link for this deck and returns it, or changes the settings of the one already there. The link needs no sign-in: anyone it reaches — or anyone it is forwarded to — can open the deck, and it keeps working until deck_unshare revokes it. Ask the user before publishing, tell them what the link allows, and do not post it anywhere public. Default is read-only; mode:'edit' lets strangers change the slides, so only pass it when the user has asked for that. A password limits the link to people who also have the passphrase — pass one only if the user gave you one to use, and repeat it back to them, because it cannot be read out again afterwards.",
      inputSchema: z.object({
        deckId: z.string(),
        mode: z.enum(["read", "edit"]).optional(),
        /** omitted leaves any existing password alone; null removes it */
        password: z.string().min(1).max(MAX_SHARE_PASSWORD).nullable().optional(),
      }),
    },
    async ({ deckId, mode, password }) => {
      const existing = await readShare(deckId, ownerId)
      const share = await upsertShare(deckId, ownerId, {
        // an unstated mode keeps whatever the link already allows rather than quietly
        // widening or narrowing it
        mode: mode ?? existing?.mode ?? "read",
        ...(password === undefined ? {} : { password }),
      })
      if (!share) return fail(DECK_NOT_FOUND)
      return ok({
        deckId,
        url: `${origin}${share.path}`,
        mode: share.mode,
        hasPassword: share.hasPassword,
        created: !existing,
        note: share.hasPassword
          ? "Anyone with the link and the password can open this deck until it is revoked."
          : "Anyone with the link can open this deck, without signing in, until it is revoked.",
      })
    },
  )

  server.registerTool(
    "deck_unshare",
    {
      title: "Revoke a deck's share link",
      description:
        "Stops the share link. Every copy of it that has been sent out fails on the next request. The deck itself is untouched, and a later deck_share issues a different link rather than reviving this one.",
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      const revoked = await deleteShare(deckId, ownerId)
      return ok({ deckId, revoked, shared: false })
    },
  )

  // ── writing ────────────────────────────────────────────────────────────────

  server.registerTool(
    "deck_create",
    {
      title: "Create a deck",
      description:
        "A new empty deck. Returns its id and the preview URL — hand that to the user before you start writing slides.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        /** blank slides to start with; write into them with slide_write */
        slideCount: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ title, slideCount }) => {
      if ((await countDecks(ownerId)) >= MAX_DECKS_PER_OWNER) {
        return fail(`This account is at its limit of ${MAX_DECKS_PER_OWNER} decks.`)
      }

      const deck = blankDeck(title)
      for (let i = 1; i < (slideCount ?? 1); i++) deck.slides.push(createSlide())

      const encoded = encodeDeck(deck)
      if (!encoded) return fail("The deck would be over the 25MB limit.")

      const summary = await createDeck(ownerId, deck, encoded)
      return ok({
        deckId: summary.id,
        title: summary.title,
        version: summary.version,
        slideCount: summary.slideCount,
        previewUrl: await previewUrl(summary.id),
      })
    },
  )

  const slideBody = z.object({
    elements: z.array(elementSpec).max(200),
    background: z
      .object({
        type: z.enum(["solid", "gradient", "image"]).optional(),
        color: z.string().optional(),
        image: z.string().optional(),
      })
      .optional(),
    notes: z.string().max(10_000).optional(),
    section: z.string().max(200).optional(),
    transition: z.enum(["none", "fade", "slideX", "slideY", "zoom"]).optional(),
  })

  server.registerTool(
    "slide_write",
    {
      title: "Write one slide",
      description:
        "Replace a slide's contents, or append a new one by leaving slideId out. The elements you pass become the slide's entire contents — this is a replacement, not a merge, so include everything that should be on the page. Write one slide per call: the preview updates after each, which is what lets someone watch the deck being built.",
      inputSchema: z.object({
        deckId: z.string(),
        baseVersion: z.number().int().min(1),
        /** omit to append a new slide */
        slideId: z.string().optional(),
        /** where to insert a new slide; appended when omitted */
        index: z.number().int().min(0).optional(),
        slide: slideBody,
      }),
    },
    async ({ deckId, baseVersion, slideId, index, slide }) => {
      // the id of the slide that was written, so a caller who appended one can patch it
      let writtenId = ""
      return mutate(
        deckId,
        baseVersion,
        (deck) => {
          let elements: SlideElement[]
          try {
            elements = slide.elements.map(buildElement)
          } catch (error) {
            return `Could not build the slide: ${(error as Error).message}`
          }

          // `elements` last: `slide` still carries the unbuilt specs under that name
          const placed = placeSlide(deck, { slideId, index, ...slide, elements })
          if (typeof placed === "string") return placed
          writtenId = placed.slideId
          return placed.deck
        },
        { extra: () => ({ slideId: writtenId }) },
      )
    },
  )

  server.registerTool(
    "slide_delete",
    {
      title: "Delete a slide",
      description: "Remove a slide. A deck cannot be left with none.",
      inputSchema: z.object({
        deckId: z.string(),
        slideId: z.string(),
        baseVersion: z.number().int().min(1),
      }),
    },
    async ({ deckId, slideId, baseVersion }) =>
      mutate(deckId, baseVersion, (deck) => {
        const index = findSlide(deck, slideId)
        if (index < 0) return `No slide ${slideId} in this deck.`
        if (deck.slides.length === 1) return "This is the deck's only slide."
        return { ...deck, slides: deck.slides.filter((_, at) => at !== index) }
      }),
  )

  server.registerTool(
    "slide_move",
    {
      title: "Reorder a slide",
      description: "Move a slide to another position. Positions are zero-based.",
      inputSchema: z.object({
        deckId: z.string(),
        slideId: z.string(),
        toIndex: z.number().int().min(0),
        baseVersion: z.number().int().min(1),
      }),
    },
    async ({ deckId, slideId, toIndex, baseVersion }) =>
      mutate(deckId, baseVersion, (deck) => {
        const from = findSlide(deck, slideId)
        if (from < 0) return `No slide ${slideId} in this deck.`
        const slides = [...deck.slides]
        const [moved] = slides.splice(from, 1)
        slides.splice(Math.min(toIndex, slides.length), 0, moved)
        return { ...deck, slides }
      }),
  )

  const patchBody = z.object({
    left: z.number().optional(),
    top: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().min(0).optional(),
    rotate: z.number().min(-360).max(360).optional(),
    /** plain text, for a text box or a shape's label */
    text: z.string().max(20_000).optional(),
    color: z.string().optional(),
    fill: z.string().optional(),
    fontSize: z.number().min(4).max(400).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
  })

  server.registerTool(
    "element_patch",
    {
      title: "Adjust one element",
      description:
        "Change one element in place — move it, resize it, retype it, recolour it. Fields you leave out are untouched. This is the tool for 'make the title on slide 3 say X' and for nudging something that the outline's warnings say is off the canvas.",
      inputSchema: z.object({
        deckId: z.string(),
        slideId: z.string(),
        elementId: z.string(),
        baseVersion: z.number().int().min(1),
        patch: patchBody,
      }),
    },
    async ({ deckId, slideId, elementId, baseVersion, patch }) =>
      mutate(
        deckId,
        baseVersion,
        (deck) => {
          const slideIndex = findSlide(deck, slideId)
          if (slideIndex < 0) return `No slide ${slideId} in this deck.`
          const slide = deck.slides[slideIndex]
          const at = slide.elements.findIndex((element) => element.id === elementId)
          if (at < 0) return `No element ${elementId} on slide ${slideId}.`

          const patched = applyPatch(slide.elements[at], patch)
          if (typeof patched === "string") return patched

          const elements = [...slide.elements]
          elements[at] = patched
          const slides = [...deck.slides]
          slides[slideIndex] = { ...slide, elements }
          return { ...deck, slides }
        },
        // replaying one element's patch onto a newer document means the same thing it
        // meant against the old one, so losing the race once is not worth a round trip
        { retry: true },
      ),
  )

  // ── design ─────────────────────────────────────────────────────────────────

  /*
    The three above the others.

    A model writing `slide_write` calls is doing two jobs: deciding what the page says and
    deciding where every box goes. It can do the first and cannot check the second, because
    it never sees the render — `deck_outline` is a description, not a picture. So the second
    job moves here. The model sends words in named slots; the grid, the type sizes that make
    them fit, the contrast-checked colours and the alignment all happen on this side.

    What it costs is the layouts an agent could have invented. What it buys is that every
    deck built this way is on the same grid, and that a title three words longer than
    expected steps down a size instead of running off the page.
  */

  server.registerTool(
    "design_catalog",
    {
      title: "The themes, page types and grid",
      description:
        "Read this first when you are building a deck. It lists the theme presets deck_theme_preset accepts, the page types slide_layout accepts with the slots each one fills, and the grid every layout sits on. Nothing here touches a deck, so it costs one call and saves you guessing at coordinates.",
      inputSchema: z.object({}),
    },
    async () =>
      ok({
        canvas: { width: 1000, height: 562.5, note: "1 unit = 0.72pt on export; 16:9" },
        grid: {
          margin: MARGIN,
          columns: COLUMNS,
          columnWidth: COLUMN,
          gutter: GUTTER,
          contentBox: { left: CONTENT_LEFT, top: CONTENT_TOP, width: CONTENT_WIDTH, height: CONTENT_HEIGHT },
          note: "Titles sit above the content box; layouts place them for you.",
        },
        type: {
          floor: MIN_READABLE,
          floorInPoints: asPoints(MIN_READABLE),
          note: "Nothing readable from a room is smaller than this. Layouts step a size down rather than through it.",
        },
        themes: themeCatalogue(),
        layouts: LAYOUT_CATALOGUE,
        discipline: [
          "One claim per slide. If a page needs two, it is two pages.",
          "Six bullets is the ceiling — past that, split the slide rather than shrink the type.",
          "Colour comes from the theme. An off-palette accent reads as a mistake, not as emphasis.",
          "Say the conclusion, not the topic: 'Churn fell 30% after onboarding changed', not 'Churn'.",
          "Call deck_create then deck_preview and give the user the link before writing slides — they watch it fill in.",
          "Re-read deck_outline after writing. Its warnings are the only sight you have.",
        ],
      }),
  )

  server.registerTool(
    "deck_theme_preset",
    {
      title: "Set the deck's look from a preset",
      description:
        "A whole visual identity from one name — background, ink, palette and typeface together, chosen so text on the resulting colours is actually readable. Set it before writing slides: slide_layout reads it back and sizes and colours every page from it. `accent` overrides just the accent colour, which is what mono-brand is for. Existing slides keep the colours their elements were given; this changes the deck's defaults, not what is already on a page. Run design_catalog for the list.",
      inputSchema: z.object({
        deckId: z.string(),
        baseVersion: z.number().int().min(1),
        preset: z.enum(THEME_PRESET_IDS),
        /** hex, replaces the preset's accent only */
        accent: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
      }),
    },
    async ({ deckId, baseVersion, preset, accent }) => {
      let applied: ReturnType<typeof resolveTheme> | undefined
      return mutate(
        deckId,
        baseVersion,
        (deck) => {
          const theme = presetTheme(preset, accent)
          if (!theme) return `No theme preset called ${preset}.`
          applied = resolveTheme(theme)
          return { ...deck, theme }
        },
        {
          extra: () => ({
            preset,
            colors: applied?.colors,
            fonts: applied?.fonts,
          }),
        },
      )
    },
  )

  server.registerTool(
    "slide_layout",
    {
      title: "Write one slide onto a page type",
      description:
        "The tool to reach for first. You give the words in named slots — a title and up to six points, four cards, a chart and its takeaway — and the layout places them on the deck's grid at sizes that fit, in the deck's own colours. Long text steps down a size instead of overflowing, so you do not have to guess at coordinates you cannot see the result of. Replaces a slide when you pass slideId, appends one when you do not, exactly like slide_write. What it writes is ordinary elements: the user drags them around afterwards, and element_patch still adjusts any one of them. Use slide_write instead when the page is genuinely not one of these shapes. Call design_catalog for the page types and their slots.",
      inputSchema: z.object({
        deckId: z.string(),
        baseVersion: z.number().int().min(1),
        /** omit to append a new slide */
        slideId: z.string().optional(),
        /** where to insert a new slide; appended when omitted */
        index: z.number().int().min(0).optional(),
        layout: layoutSpec,
        /** what you would say out loud over this slide */
        notes: z.string().max(10_000).optional(),
        section: z.string().max(200).optional(),
        transition: z.enum(["none", "fade", "slideX", "slideY", "zoom"]).optional(),
      }),
    },
    async ({ deckId, baseVersion, slideId, index, layout, notes, section, transition }) => {
      let writtenId = ""
      return mutate(
        deckId,
        baseVersion,
        (deck) => {
          const built = renderLayout(layout, resolveTheme(deck.theme))

          let elements: SlideElement[]
          try {
            elements = built.elements.map(buildElement)
          } catch (error) {
            return `Could not build the slide: ${(error as Error).message}`
          }

          const placed = placeSlide(deck, {
            slideId,
            index,
            elements,
            background: built.background,
            notes,
            section,
            transition,
          })
          if (typeof placed === "string") return placed
          writtenId = placed.slideId
          return placed.deck
        },
        { extra: () => ({ slideId: writtenId, layout: layout.layout }) },
      )
    },
  )

  server.registerTool(
    "deck_theme",
    {
      title: "Set the deck theme",
      description:
        "The deck-wide defaults: body font, text colour, background, and the palette charts and shapes draw from. Existing elements keep the colours they were given.",
      inputSchema: z.object({
        deckId: z.string(),
        baseVersion: z.number().int().min(1),
        theme: z.object({
          fontFamily: z.string().max(80).optional(),
          fontColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          themeColors: z.array(z.string()).min(1).max(12).optional(),
        }),
      }),
    },
    async ({ deckId, baseVersion, theme }) =>
      mutate(deckId, baseVersion, (deck) => ({
        ...deck,
        theme: { ...DEFAULT_THEME, ...deck.theme, ...theme },
      })),
  )
}

/**
 * Apply a patch to whichever element type it landed on.
 *
 * `text` is the only field that means different things in different places — a text box
 * keeps its content at the top level and a shape keeps it under `text.content` — and the
 * types that have no text at all say so rather than accepting the field and dropping it.
 */
function applyPatch(
  element: SlideElement,
  patch: {
    left?: number
    top?: number
    width?: number
    height?: number
    rotate?: number
    text?: string
    color?: string
    fill?: string
    fontSize?: number
    bold?: boolean
    italic?: boolean
    align?: "left" | "center" | "right" | "justify"
  },
): SlideElement | string {
  const geometry = {
    ...(patch.left === undefined ? {} : { left: patch.left }),
    ...(patch.top === undefined ? {} : { top: patch.top }),
    ...(patch.width === undefined ? {} : { width: patch.width }),
    ...(patch.height === undefined ? {} : { height: patch.height }),
    ...(patch.rotate === undefined ? {} : { rotate: patch.rotate }),
  }

  const styling = {
    ...(patch.color === undefined ? {} : { color: patch.color }),
    ...(patch.fontSize === undefined ? {} : { fontSize: patch.fontSize }),
    ...(patch.bold === undefined ? {} : { bold: patch.bold }),
    ...(patch.italic === undefined ? {} : { italic: patch.italic }),
    ...(patch.align === undefined ? {} : { align: patch.align }),
  }

  switch (element.type) {
    case "text":
      return {
        ...element,
        ...geometry,
        ...styling,
        ...(patch.fill === undefined ? {} : { fill: patch.fill }),
        ...(patch.text === undefined ? {} : { content: toStoredHtml(patch.text) }),
      }

    case "shape":
      return {
        ...element,
        ...geometry,
        ...(patch.fill === undefined ? {} : { fill: patch.fill }),
        text: {
          ...element.text,
          ...styling,
          ...(patch.text === undefined ? {} : { content: toStoredHtml(patch.text) }),
        },
      }

    case "formula":
      if (patch.text !== undefined) {
        return "A formula's content is LaTeX — rewrite it with slide_write rather than patching text."
      }
      return { ...element, ...geometry, ...(patch.color === undefined ? {} : { color: patch.color }) }

    default:
      if (patch.text !== undefined) {
        return `A ${element.type} element has no text to set — use slide_write to rebuild it.`
      }
      return { ...element, ...geometry }
  }
}
