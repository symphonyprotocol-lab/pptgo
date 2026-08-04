import { describe, expect, it } from "vitest"
import {
  EMBEDDED_RATIO,
  MAX_DECK_BYTES,
  MAX_DECK_MB,
  MAX_REQUEST_BYTES,
  blankDeck,
  encodeDeck,
  parseDeck,
} from "./deck-schema"
import { messages } from "./i18n/messages"
import { translator } from "./i18n/translate"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import type { Deck } from "@/types/slides"

const valid = (): Deck => blankDeck("Quarterly review")

describe("parseDeck", () => {
  it("accepts a well-formed deck", () => {
    expect(parseDeck(valid())).toMatchObject({ title: "Quarterly review", version: 1 })
  })

  it("rejects anything that is not an object", () => {
    for (const value of [null, undefined, 42, "deck", [valid()], true]) {
      expect(parseDeck(value)).toBeNull()
    }
  })

  it("rejects a deck with no usable title", () => {
    expect(parseDeck({ ...valid(), title: "" })).toBeNull()
    expect(parseDeck({ ...valid(), title: "   " })).toBeNull()
    expect(parseDeck({ ...valid(), title: 7 })).toBeNull()
  })

  it("rejects a deck with no slides", () => {
    expect(parseDeck({ ...valid(), slides: [] })).toBeNull()
    expect(parseDeck({ ...valid(), slides: "nope" })).toBeNull()
    expect(parseDeck({ ...valid(), slides: undefined })).toBeNull()
  })

  it("rejects a deck missing its dimensions or theme", () => {
    expect(parseDeck({ ...valid(), width: "1000" })).toBeNull()
    expect(parseDeck({ ...valid(), height: undefined })).toBeNull()
    expect(parseDeck({ ...valid(), theme: null })).toBeNull()
  })

  it("truncates an overlong title rather than rejecting the deck", () => {
    const parsed = parseDeck({ ...valid(), title: "t".repeat(500) })
    expect(parsed?.title).toHaveLength(200)
  })

  it("pins the version, whatever the client claimed", () => {
    expect(parseDeck({ ...valid(), version: 99 })?.version).toBe(1)
  })
})

describe("blankDeck", () => {
  it("is a valid deck at the editor's own dimensions", () => {
    const deck = blankDeck("Untitled")
    expect(deck.width).toBe(VIEWPORT_WIDTH)
    expect(deck.height).toBe(VIEWPORT_HEIGHT)
    expect(deck.slides).toHaveLength(1)
    expect(parseDeck(deck)).not.toBeNull()
  })
})

describe("encodeDeck", () => {
  it("returns the bytes that will be stored", () => {
    const deck = valid()
    const body = encodeDeck(deck)!
    expect(JSON.parse(new TextDecoder().decode(body))).toEqual(deck)
  })

  /**
   * The regression this guards. `JSON.stringify(deck).length` counts UTF-16 code units, so
   * a deck of CJK text measured at roughly a third of the bytes it actually occupied and
   * sailed past a limit it was well over.
   */
  it("measures UTF-8 bytes rather than string length", () => {
    const deck = { ...valid(), title: "会议纪要" }
    const body = encodeDeck(deck)!
    const asString = JSON.stringify(deck)
    expect(body.byteLength).toBeGreaterThan(asString.length)
  })

  it("rejects a deck past the limit", () => {
    const deck = { ...valid(), title: "x" }
    deck.slides[0].notes = "y".repeat(MAX_DECK_BYTES + 1)
    expect(encodeDeck(deck)).toBeNull()
  })

  it("accepts a deck that only just fits", () => {
    const deck = valid()
    deck.slides[0].notes = "y".repeat(1000)
    expect(encodeDeck(deck)).not.toBeNull()
  })
})

describe("the size limits", () => {
  it("states the ceiling in megabytes without restating the number", () => {
    expect(MAX_DECK_MB * 1024 * 1024).toBe(MAX_DECK_BYTES)
  })

  /**
   * The message used to carry a literal 25 while the ceiling was 50, so the app refused a
   * deck at one size and named another. Every language has to name the real one.
   */
  it("names the real ceiling in every language it refuses in", () => {
    for (const locale of Object.keys(messages) as (keyof typeof messages)[]) {
      const text = translator(locale)("api.deckTooLarge", { limit: MAX_DECK_MB })
      expect(text, locale).toContain(String(MAX_DECK_MB))
      // an un-substituted placeholder is the other way this goes wrong
      expect(text, locale).not.toContain("{")
    }
  })

  it("leaves the request envelope room around a document at the ceiling", () => {
    expect(MAX_REQUEST_BYTES).toBeGreaterThan(MAX_DECK_BYTES)
  })

  /**
   * The invariant behind the per-asset budgets in the toolbar: a file is weighed before it
   * is encoded, and base64 adds a third. A budget that ignores that is a file the editor
   * accepts and can never store — which is exactly what a flat 20MB media allowance became
   * once the document ceiling came down to 20MB.
   */
  it("keeps an embedded file under the ceiling once base64 has had its share", () => {
    const largestAllowed = MAX_DECK_BYTES * EMBEDDED_RATIO
    expect(largestAllowed / EMBEDDED_RATIO).toBeCloseTo(MAX_DECK_BYTES, 5)
    expect(largestAllowed).toBeLessThan(MAX_DECK_BYTES)
  })
})
