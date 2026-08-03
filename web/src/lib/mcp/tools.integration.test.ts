import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { McpServer } from "@modelcontextprotocol/server"
import { db } from "@/db"
import { users } from "@/db/schema"
import { deleteDeck } from "@/lib/decks"
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
    expect(deck.previewUrl).toBe(`https://pptgo.test/preview/${deck.deckId}`)
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
  })
})
