import "server-only"
import { SHARE_KEY_PARAM } from "@/lib/constants"
import { hmac, sameSignature } from "@/lib/signing"

/**
 * Read-only preview links.
 *
 * An agent writes a deck and hands the preview URL to a person. That person is often not
 * signed in — they may not have an account at all — so a link that only works behind
 * Google sign-in is a link that does not work. This mints one that stands on its own: a
 * signature that says "the bearer may *read* this one deck, until this date".
 *
 * What it deliberately is not:
 *
 * - **Not a credential.** It authorises reading one deck. No route accepts it for a write,
 *   and it is checked against the deck id it was signed for, so a link to one deck cannot
 *   be re-pointed at another.
 * - **Not revocable one by one.** There is no row behind it — that is what lets a preview
 *   page hold up under a poll every 1.5s without a database lookup per tick — so the ways
 *   to cut a link short are to wait for it to expire or to rotate `AUTH_SECRET`, which
 *   invalidates every session too. A shorter life is the lever that costs nothing; hence
 *   the week.
 * - **Not secret-free.** Anyone the link is forwarded to can read the deck. It is exactly
 *   as shareable as the URL is, which is the point, and worth saying out loud to whoever
 *   hands one over.
 */

/** Bumped if the payload ever changes shape, so old links fail closed rather than oddly. */
const VERSION = "v1"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long a fresh link lasts, in whole days.
 *
 * Whole days rather than an exact instant so that the same deck signs to the same URL all
 * day: every mutating tool returns `previewUrl`, and an agent writing twenty slides should
 * be handing back the same link twenty times, not twenty links. The cost is that a link's
 * real life is somewhere between six and seven days.
 */
export const SHARE_LINK_TTL_DAYS = 7

/** The deck id is in here so a key for one deck is not a key for the next. */
const signed = (deckId: string, ownerId: string, expiresOn: string) =>
  `${VERSION}.${deckId}.${ownerId}.${expiresOn}`

/**
 * A key for `/preview/<deckId>?k=…`.
 *
 * The owner id travels in the key because every read in `lib/decks.ts` is scoped by owner
 * in the same SQL statement, and this must not become the one path that loads a row and
 * checks who owns it afterwards. It is an opaque internal id, not an address or a name.
 */
export async function signPreviewKey(
  deckId: string,
  ownerId: string,
  now: number = Date.now(),
): Promise<string> {
  const expiresOn = (Math.floor(now / DAY_MS) + SHARE_LINK_TTL_DAYS).toString(36)
  const signature = await hmac(signed(deckId, ownerId, expiresOn))
  return `${VERSION}.${ownerId}.${expiresOn}.${signature}`
}

/** The full URL an MCP tool hands back. */
export async function previewLink(
  origin: string,
  deckId: string,
  ownerId: string,
): Promise<string> {
  const key = await signPreviewKey(deckId, ownerId)
  return `${origin}/preview/${deckId}?${SHARE_KEY_PARAM}=${key}`
}

/**
 * Whose deck the bearer of this key may read, or null.
 *
 * Null covers every way a key can be no good — wrong shape, wrong deck, forged, expired —
 * because a caller that could tell them apart would be an oracle, and none of them lead
 * anywhere different anyway.
 */
export async function ownerFromPreviewKey(
  deckId: string,
  key: string,
  now: number = Date.now(),
): Promise<string | null> {
  // split from the right: the last two fields are fixed, whatever an owner id turns out to
  // contain one day
  const parts = key.split(".")
  if (parts.length < 4) return null

  const signature = parts[parts.length - 1]
  const expiresOn = parts[parts.length - 2]
  const ownerId = parts.slice(1, -2).join(".")
  if (parts[0] !== VERSION || !ownerId || !expiresOn || !signature) return null

  const expiresAt = Number.parseInt(expiresOn, 36)
  if (!Number.isFinite(expiresAt)) return null
  if (expiresAt * DAY_MS <= now) return null

  const expected = await hmac(signed(deckId, ownerId, expiresOn))
  return sameSignature(expected, signature) ? ownerId : null
}

/**
 * The owner a read-only link on this request authorises, if it carries a valid one.
 *
 * Only ever called from a GET. A preview key is a reading credential: wiring it into a
 * write would turn a URL that gets forwarded around a chat into one that can change a
 * deck.
 */
export async function ownerFromPreviewRequest(
  request: Request,
  deckId: string,
): Promise<string | null> {
  const key = new URL(request.url).searchParams.get(SHARE_KEY_PARAM)
  return key ? ownerFromPreviewKey(deckId, key) : null
}
