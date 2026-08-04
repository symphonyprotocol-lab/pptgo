import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { McpServer } from "@modelcontextprotocol/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { deleteDeck } from "@/lib/decks"
import { SHARE_KEY_PARAM } from "@/lib/constants"
import { ownerFromPreviewKey } from "@/lib/share-link"
import { registerTools } from "./tools"

/**
 * The tools against a real database and bucket.
 *
 * The SDK validates arguments before a handler ever runs, so this drives the handlers
 * directly — what is under test is what they do to a deck, not whether zod works. The
 * conflict rules are the reason it exists: which writes are refused, which are rebased,
 * and whether a refusal says so plainly enough for a model to act on.
 *
 *   DATABASE_URL=… S3_ENDPOINT=… S3_BUCKET=pptgo S3_REGION=us-east-1 \
 *   S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx vitest run tools.integration
 */
const live = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT)

type Payload = Record<string, unknown>
type Handler = (args: Payload) => Promise<{
  content: { type: "text"; text: string }[]
  isError?: boolean
}>

/** Captures what `registerTools` registers, so the handlers can be called directly. */
function capture(ownerId: string) {
  const tools = new Map<string, Handler>()
  const server = {
    registerTool(name: string, _config: unknown, cb: Handler) {
      tools.set(name, cb)
      return {}
    },
  } as unknown as McpServer

  registerTools(server, { ownerId, origin: "https://pptgo.test" })

  return async (name: string, args: Payload = {}) => {
    const handler = tools.get(name)
    if (!handler) throw new Error(`no tool ${name}`)
    const result = await handler(args)
    return {
      failed: Boolean(result.isError),
      body: JSON.parse(result.content[0].text) as Payload,
    }
  }
}

describe.skipIf(!live)("the MCP tools against real storage", () => {
  const ownerId = `test-mcp-${crypto.randomUUID()}`
  const otherId = `test-mcp-other-${crypto.randomUUID()}`
  let call: ReturnType<typeof capture>
  let other: ReturnType<typeof capture>
  const created: string[] = []

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ownerId, name: "mcp test", email: `${ownerId}@test` },
      { id: otherId, name: "other", email: `${otherId}@test` },
    ])
    call = capture(ownerId)
    other = capture(otherId)
  })

  afterAll(async () => {
    for (const id of created) await deleteDeck(id, ownerId).catch(() => false)
    await db.delete(users).where(eq(users.id, ownerId))
    await db.delete(users).where(eq(users.id, otherId))
  })

  async function freshDeck() {
    const { body } = await call("deck_create", { title: "test deck" })
    created.push(body.deckId as string)
    return body as Payload & { deckId: string; version: number }
  }

  it("creates a deck at version 1 and hands back somewhere to watch it", async () => {
    const deck = await freshDeck()
    expect(deck.version).toBe(1)

    // the link carries its own read-only access, or the person it is handed to — who is
    // often signed in nowhere — could not open it
    const url = new URL(deck.previewUrl as string)
    expect(url.origin + url.pathname).toBe(`https://pptgo.test/preview/${deck.deckId}`)
    expect(await ownerFromPreviewKey(deck.deckId, url.searchParams.get(SHARE_KEY_PARAM) ?? "")).toBe(
      ownerId,
    )
  })

  it("appends a slide and says which one it wrote", async () => {
    const deck = await freshDeck()
    const { failed, body } = await call("slide_write", {
      deckId: deck.deckId,
      baseVersion: deck.version,
      slide: { elements: [{ type: "text", text: "hi", left: 10, top: 10, width: 200, height: 40 }] },
    })

    expect(failed).toBe(false)
    expect(body.version).toBe(2)
    expect(body.slideId).toBeTruthy()
    expect(body.slideCount).toBe(2)
  })

  /**
   * A page is a replacement, so replaying it onto a document that has moved would bury
   * whatever arrived in between. The model is told to read again rather than guess.
   */
  it("refuses a page written from a version that has moved on", async () => {
    const deck = await freshDeck()
    await call("slide_write", {
      deckId: deck.deckId,
      baseVersion: 1,
      slide: { elements: [] },
    })

    const { failed, body } = await call("slide_write", {
      deckId: deck.deckId,
      baseVersion: 1,
      slide: { elements: [] },
    })

    expect(failed).toBe(true)
    expect(body.version).toBe(2)
    expect(String(body.error)).toContain("moved on")
  })

  /**
   * One element's patch means the same thing against a newer document, so losing the race
   * is not worth a round trip — but the caller is told it happened rather than left to
   * believe it wrote what it thought it was writing.
   */
  it("rebases an element patch onto the current version, and says that it did", async () => {
    const deck = await freshDeck()
    const before = (await call("deck_outline", { deckId: deck.deckId })).body
    const blank = (before.slides as { id: string }[])[0]

    const written = await call("slide_write", {
      deckId: deck.deckId,
      baseVersion: deck.version,
      slideId: blank.id,
      slide: { elements: [{ type: "text", text: "title", left: 10, top: 10, width: 200, height: 40 }] },
    })
    expect(written.failed).toBe(false)

    const outline = (await call("deck_outline", { deckId: deck.deckId })).body
    const slide = (outline.slides as { id: string; elements: { id: string }[] }[])[0]

    const { failed, body } = await call("element_patch", {
      deckId: deck.deckId,
      slideId: slide.id,
      elementId: slide.elements[0].id,
      baseVersion: 1,
      patch: { text: "retitled" },
    })

    expect(failed).toBe(false)
    expect(body.rebasedFrom).toBe(1)
    expect(body.wasAt).toBe(outline.version)
  })

  it("will not leave a deck with no slides", async () => {
    const deck = await freshDeck()
    const outline = (await call("deck_outline", { deckId: deck.deckId })).body
    const only = (outline.slides as { id: string }[])[0]

    const { failed, body } = await call("slide_delete", {
      deckId: deck.deckId,
      slideId: only.id,
      baseVersion: outline.version,
    })

    expect(failed).toBe(true)
    expect(String(body.error)).toContain("only slide")
  })

  it("reflects a write in the next outline", async () => {
    const deck = await freshDeck()
    await call("slide_write", {
      deckId: deck.deckId,
      baseVersion: 1,
      slide: {
        section: "data",
        elements: [{ type: "text", text: "revenue", left: 10, top: 10, width: 200, height: 40 }],
      },
    })

    const outline = (await call("deck_outline", { deckId: deck.deckId })).body
    const slides = outline.slides as { section?: string; elements: { text?: string }[] }[]
    expect(slides).toHaveLength(2)
    expect(slides[1].section).toBe("data")
    expect(slides[1].elements[0].text).toBe("revenue")
  })

  it("publishes a share link, reads it back, and revokes it", async () => {
    const deck = await freshDeck()

    expect((await call("deck_share_read", { deckId: deck.deckId })).body.shared).toBe(false)

    const opened = (await call("deck_share", { deckId: deck.deckId })).body
    expect(opened.created).toBe(true)
    // read-only unless the caller asks otherwise: a link that lets strangers edit is not
    // something a default should hand out
    expect(opened.mode).toBe("read")
    expect(opened.hasPassword).toBe(false)
    expect(String(opened.url)).toContain("https://pptgo.test/s/")

    const read = (await call("deck_share_read", { deckId: deck.deckId })).body
    expect(read.shared).toBe(true)
    expect(read.url).toBe(opened.url)

    // an unstated mode leaves the link as permissive as it already was
    const locked = (await call("deck_share", { deckId: deck.deckId, password: "hunter2" })).body
    expect(locked.created).toBe(false)
    expect(locked.mode).toBe("read")
    expect(locked.hasPassword).toBe(true)
    expect(locked.url).toBe(opened.url)

    const widened = (await call("deck_share", { deckId: deck.deckId, mode: "edit" })).body
    expect(widened.mode).toBe("edit")
    // changing the mode leaves the password alone
    expect(widened.hasPassword).toBe(true)

    const dropped = (await call("deck_share", { deckId: deck.deckId, password: null })).body
    expect(dropped.hasPassword).toBe(false)

    expect((await call("deck_unshare", { deckId: deck.deckId })).body.revoked).toBe(true)
    expect((await call("deck_share_read", { deckId: deck.deckId })).body.shared).toBe(false)
  })

  /**
   * The tools close over one owner for the life of one request, and every query underneath
   * filters by that owner in the same statement — so another account's deck is not "denied",
   * it is indistinguishable from one that was never there.
   */
  it("hides another account's deck behind the same answer as one that does not exist", async () => {
    const deck = await freshDeck()

    const seen = await other("deck_outline", { deckId: deck.deckId })
    expect(seen.failed).toBe(true)
    expect(String(seen.body.error)).toContain("No deck with that id")

    const written = await other("slide_write", {
      deckId: deck.deckId,
      baseVersion: 1,
      slide: { elements: [] },
    })
    expect(written.failed).toBe(true)

    const listed = (await other("deck_list", {})).body.decks as { deckId: string }[]
    expect(listed.some((one) => one.deckId === deck.deckId)).toBe(false)

    // sharing is a deck operation, so it is scoped the same way — another account cannot
    // publish a link to a deck it cannot see
    const published = await other("deck_share", { deckId: deck.deckId })
    expect(published.failed).toBe(true)
    expect((await other("deck_share_read", { deckId: deck.deckId })).failed).toBe(true)
    expect((await other("deck_unshare", { deckId: deck.deckId })).failed).toBe(true)
  })

  /**
   * The design tools go through the same write path as everything else, which is the
   * point: a laid-out page is a page, so it takes a version, it can be refused, and what
   * lands is ordinary elements that the next `element_patch` can adjust.
   */
  describe("the design tools", () => {
    it("catalogues themes and page types without touching a deck", async () => {
      const { failed, body } = await call("design_catalog", {})
      expect(failed).toBe(false)
      expect((body.themes as unknown[]).length).toBeGreaterThan(0)
      expect((body.layouts as unknown[]).length).toBeGreaterThan(0)
      expect(body.grid).toMatchObject({ columns: 12, margin: 60 })
    })

    it("sets a whole look from one name, and reports what it resolved to", async () => {
      const deck = await freshDeck()
      const { failed, body } = await call("deck_theme_preset", {
        deckId: deck.deckId,
        baseVersion: deck.version,
        preset: "dark-tech",
      })

      expect(failed).toBe(false)
      expect(body.preset).toBe("dark-tech")
      expect((body.colors as Record<string, string>).background).toBe("#0b1020")
    })

    it("lays out a page whose elements the outline then has nothing to say about", async () => {
      const deck = await freshDeck()
      const themed = await call("deck_theme_preset", {
        deckId: deck.deckId,
        baseVersion: deck.version,
        preset: "editorial",
      })

      const written = await call("slide_layout", {
        deckId: deck.deckId,
        baseVersion: themed.body.version,
        layout: {
          layout: "bullets",
          title: "Three changes we shipped",
          points: ["Invitations carry the workspace", "SSO resolves from the domain", "Five steps, not eleven"],
        },
        notes: "the middle one is the expensive one",
      })

      expect(written.failed).toBe(false)
      expect(written.body.layout).toBe("bullets")

      const outline = (await call("deck_outline", { deckId: deck.deckId })).body
      const slide = (outline.slides as { id: string; notes?: string; warnings?: string[] }[]).at(-1)!
      expect(slide.warnings).toBeUndefined()
      expect(slide.notes).toContain("expensive")
    })

    it("leaves behind elements that element_patch can still adjust", async () => {
      const deck = await freshDeck()
      const written = await call("slide_layout", {
        deckId: deck.deckId,
        baseVersion: deck.version,
        layout: { layout: "statement", text: "We shipped it." },
      })

      const outline = (await call("deck_outline", { deckId: deck.deckId })).body
      const slide = (outline.slides as { id: string; elements: { id: string; text?: string }[] }[]).at(-1)!
      const statement = slide.elements.find((one) => one.text?.includes("shipped"))!

      const patched = await call("element_patch", {
        deckId: deck.deckId,
        slideId: written.body.slideId,
        elementId: statement.id,
        baseVersion: written.body.version,
        patch: { text: "We shipped it early." },
      })
      expect(patched.failed).toBe(false)
    })

    it("is refused from a stale version like every other write", async () => {
      const deck = await freshDeck()
      await call("slide_layout", {
        deckId: deck.deckId,
        baseVersion: 1,
        layout: { layout: "closing", title: "Thank you" },
      })

      const { failed, body } = await call("slide_layout", {
        deckId: deck.deckId,
        baseVersion: 1,
        layout: { layout: "closing", title: "Thank you" },
      })
      expect(failed).toBe(true)
      expect(String(body.error)).toContain("moved on")
    })
  })
})
