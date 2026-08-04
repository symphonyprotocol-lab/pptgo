import { afterEach, describe, expect, it, vi } from "vitest"
import { cloudDeckStorage, localDeckStorage } from "./deck-storage"
import { createDeck } from "./factory"
import { fallbackTranslate } from "./i18n/translate"
import type { DeckSummary } from "@/types/deck"

const DECK_ID = "deck-1"

const summary = (version: number): DeckSummary => ({
  id: DECK_ID,
  title: "t",
  slideCount: 1,
  byteSize: 10,
  version,
  hasThumbnail: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

/**
 * Stands in for the network. Requests are recorded so the assertions can be about what
 * the adapter *sent* — the version it claims to be writing from is the entire mechanism,
 * and it is invisible in the return value.
 */
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return Promise.resolve(handler(String(input), init))
  })
  return calls
}

const bodyOf = (init?: RequestInit) =>
  JSON.parse(String(init?.body)) as { baseVersion?: number }

afterEach(() => vi.unstubAllGlobals())

describe("cloudDeckStorage", () => {
  it("writes from the version it last read", async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ deck: summary(8) })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()
    await storage.save(createDeck())

    const put = calls.find((c) => c.init?.method === "PUT")
    expect(bodyOf(put?.init).baseVersion).toBe(7)
  })

  it("writes from the version its own last save returned", async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ deck: summary(8) })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()
    await storage.save(createDeck())
    await storage.save(createDeck())

    const puts = calls.filter((c) => c.init?.method === "PUT")
    expect(bodyOf(puts[1]?.init).baseVersion).toBe(8)
  })

  it("reports a refused write as a conflict rather than throwing", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ error: "conflict", version: 9 }, 409)
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()

    await expect(storage.save(createDeck())).resolves.toEqual({
      ok: false,
      reason: "conflict",
    })
  })

  /**
   * The version a conflict reports is the other writer's, and adopting it would make the
   * next poll answer "nothing has changed" about a document this editor has never seen.
   */
  it("keeps measuring against its own version after a conflict", async () => {
    mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ error: "conflict", version: 9 }, 409)
      if (url.endsWith("/version")) return json({ version: 9, updatedAt: "" })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()
    await storage.save(createDeck())

    await expect(storage.changedRemotely?.()).resolves.toBe(true)
  })

  it("only reports a change once the stored version is ahead", async () => {
    let stored = 7
    mockFetch((url) => {
      if (url.endsWith("/version")) return json({ version: stored, updatedAt: "" })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()

    await expect(storage.changedRemotely?.()).resolves.toBe(false)
    stored = 8
    await expect(storage.changedRemotely?.()).resolves.toBe(true)
  })

  it("re-reads the stored version before a forced write", async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ deck: summary(13) })
      if (url.endsWith("/version")) return json({ version: 12, updatedAt: "" })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.load()
    await storage.save(createDeck(), { force: true })

    const put = calls.find((c) => c.init?.method === "PUT")
    // 12, not the 7 it loaded: forcing means starting from whatever is stored now
    expect(bodyOf(put?.init).baseVersion).toBe(12)
  })

  it("reads the stored version when asked to save before anything was loaded", async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === "PUT") return json({ deck: summary(4) })
      if (url.endsWith("/version")) return json({ version: 3, updatedAt: "" })
      return json({ deck: createDeck(), summary: summary(7) })
    })

    const storage = cloudDeckStorage(DECK_ID, fallbackTranslate)
    await storage.save(createDeck())

    const put = calls.find((c) => c.init?.method === "PUT")
    expect(bodyOf(put?.init).baseVersion).toBe(3)
  })
})

describe("localDeckStorage", () => {
  it("offers no polling, because IndexedDB has no second writer", () => {
    expect(localDeckStorage(fallbackTranslate).changedRemotely).toBeNull()
  })

  it("keeps a library, because the browser-local editor has one deck slot to switch", () => {
    expect(localDeckStorage(fallbackTranslate).library).not.toBeNull()
  })

  it("keeps none in the cloud, where swapping decks would save one over another's id", () => {
    expect(cloudDeckStorage(DECK_ID, fallbackTranslate).library).toBeNull()
  })
})
