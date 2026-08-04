import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { createSlide } from "@/lib/factory"
import type { Deck } from "@/types/slides"

/**
 * The ceiling on one stored document, and the number every other size limit is derived
 * from. A deck carries its images inlined as base64, so this is reached by pictures rather
 * than by slides: it is the size of the JSON that lands in the bucket.
 *
 * Raising it means raising `client_max_body_size` in `deploy/nginx/` to match, or the
 * request is refused by nginx with a 413 before the app ever gets to say anything useful
 * about it.
 */
export const MAX_DECK_BYTES = 20 * 1024 * 1024

/**
 * The ceiling in whole megabytes, for the messages that have to say it out loud.
 *
 * Derived rather than written twice: the number in the error string had been left at 25
 * through a change to 50, so the app refused a deck at one size and named another.
 */
export const MAX_DECK_MB = Math.round(MAX_DECK_BYTES / (1024 * 1024))

/**
 * What a file costs once it is inside the document. Everything embeds as a base64 data
 * URI, which is four bytes for every three of the original, so a budget stated against
 * `MAX_DECK_BYTES` has to be scaled by this before it is compared with a file's own size.
 */
export const EMBEDDED_RATIO = 3 / 4

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
