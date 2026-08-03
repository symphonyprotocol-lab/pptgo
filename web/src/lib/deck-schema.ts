import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { createSlide } from "@/lib/factory"
import type { Deck } from "@/types/slides"

/** Guards against a runaway client pushing an unbounded document into the bucket. */
export const MAX_DECK_BYTES = 25 * 1024 * 1024

/**
 * Ceiling on the request body a deck arrives in. The envelope around the document is a key
 * and a pair of braces, so the slack is generous rather than calculated.
 */
export const MAX_REQUEST_BYTES = MAX_DECK_BYTES + 1024 * 1024

/**
 * Decks one account may hold. Storage is the operator's own disk, and an account with no
 * limit is an account that can fill it — 500 is far past what anyone reaches by working.
 */
export const MAX_DECKS_PER_OWNER = 500

/** The document as it will be stored. */
export function serializeDeck(deck: Deck): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(deck))
}

/**
 * The document as it will be stored, or null when it is over the limit.
 *
 * Callers used to check `JSON.stringify(deck).length`, which counts UTF-16 code units
 * rather than bytes — Chinese text is roughly three bytes per unit, so the 25MB ceiling
 * let through nearly 75MB. It also stringified the deck twice, once to measure and once to
 * store. Measuring the encoded bytes settles both: this is the exact buffer that goes into
 * the bucket and gets recorded as `byteSize`.
 */
export function encodeDeck(deck: Deck): Uint8Array | null {
  const body = serializeDeck(deck)
  return body.byteLength > MAX_DECK_BYTES ? null : body
}

/**
 * A one-slide starter deck. The richer sample deck `createDeck()` builds is browser-only —
 * its text runs go through `sanitizeHtml`, which needs a DOM — so the dashboard sends that
 * one from the client and this is the fallback for a bare `POST /api/decks`. The caller
 * supplies an already-translated title for the same reason.
 */
export function blankDeck(title: string): Deck {
  return {
    version: 1,
    title,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: DEFAULT_THEME,
    slides: [createSlide()],
  }
}

/**
 * Structural check on a document that arrived over the wire. It deliberately stops at the
 * slide list: the editor re-normalises and re-sanitises everything it loads, so the
 * server's job is to reject nonsense, not to validate every element.
 */
export function parseDeck(value: unknown): Deck | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const deck = value as Partial<Deck>
  if (typeof deck.title !== "string" || !deck.title.trim()) return null
  if (!Array.isArray(deck.slides) || deck.slides.length === 0) return null
  if (typeof deck.width !== "number" || typeof deck.height !== "number") return null
  if (typeof deck.theme !== "object" || deck.theme === null) return null
  return { ...(deck as Deck), version: 1, title: deck.title.slice(0, 200) }
}
