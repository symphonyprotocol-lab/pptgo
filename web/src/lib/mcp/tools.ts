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
import { buildElement, elementSpec } from "./element-schema"
import { outlineDeck } from "./outline"
import { toStoredHtml } from "./text"
import type { Deck, Slide, SlideElement } from "@/types/slides"

/**
 * The ten tools.
 *
 * Granularity is a page for writing and an element for adjusting, which is how the work
 * actually arrives: a deck is composed a slide at a time, and revised one box at a time.
 * There is deliberately no tool that writes a whole deck — it would let a model buffer
 * everything and emit it at the end, and the point of the preview page is that a person
 * watches the deck appear. It would also mean re-uploading megabytes to fix a typo.
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
  const previewUrl = (deckId: string) => `${origin}/preview/${deckId}`

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
          previewUrl: previewUrl(deckId),
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
        ...outlineDeck(deckId, found.deck, found.summary.version, previewUrl(deckId)),
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
        "The URL where a person can watch this deck, updating as you write. Give it to the user early — they see the deck take shape while you work.",
      inputSchema: z.object({ deckId: z.string() }),
    },
    async ({ deckId }) => {
      const found = await readDeck(deckId, ownerId)
      if (!found) return fail(DECK_NOT_FOUND)
      return ok({
        deckId,
        title: found.deck.title,
        version: found.summary.version,
        previewUrl: previewUrl(deckId),
        editorUrl: `${origin}/editor/${deckId}`,
      })
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
        previewUrl: previewUrl(summary.id),
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

        const existing = slideId ? findSlide(deck, slideId) : -1
        if (slideId && existing < 0) return `No slide ${slideId} in this deck.`

        const previous: Slide | undefined = existing >= 0 ? deck.slides[existing] : undefined
        const written = createSlide({
          ...previous,
          id: previous?.id ?? newId(),
          elements,
          ...(slide.notes === undefined ? {} : { notes: slide.notes }),
          ...(slide.section === undefined ? {} : { section: slide.section }),
          ...(slide.transition === undefined ? {} : { transition: slide.transition }),
          ...(slide.background === undefined
            ? {}
            : {
                background: {
                  ...(previous?.background ?? { type: "solid" as const, color: "#ffffff" }),
                  ...slide.background,
                },
              }),
        })

        writtenId = written.id
        const slides = [...deck.slides]
        if (existing >= 0) slides[existing] = written
        else slides.splice(index ?? slides.length, 0, written)
        return { ...deck, slides }
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
