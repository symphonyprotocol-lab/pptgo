import "server-only"
import { cookies } from "next/headers"
import { currentUser } from "@/auth"
import { SHARE_TOKEN_PARAM } from "@/lib/constants"
import { ownerFromPreviewRequest } from "@/lib/share-link"
import { grantCookie, grantIsGood, shareByToken } from "@/lib/shares"

/**
 * Who a request to a deck route counts as, and what it may do.
 *
 * Three credentials reach these routes and they are deliberately different things:
 *
 * - the **session cookie** — an account, which owns its decks and may do anything to them
 * - a **share token** (`?s=`) — a link its owner handed out, worth reading or editing the
 *   *contents* of one deck, and nothing else
 * - a **preview key** (`?k=`) — the signed, expiring link an MCP tool hands back, worth
 *   reading one deck
 *
 * All three resolve to an owner id, never to a bypass: the queries in `lib/decks.ts` stay
 * scoped by owner in the same SQL statement whichever door the request came through.
 *
 * `canWrite` is about the *document*. Renaming, duplicating and deleting a deck are
 * decisions about the file rather than work inside it, and those routes ask for the
 * session directly instead of calling this.
 */
export interface DeckReader {
  ownerId: string
  canWrite: boolean
}

/**
 * A share link presented on this request, if it is good for this deck.
 *
 * A link with a passphrase needs the cookie that says the visitor got it right; the token
 * alone is not enough, or the password would be a formality anyone could skip by reading
 * the URL out of a browser bar.
 */
async function fromShareLink(request: Request, deckId: string): Promise<DeckReader | null> {
  const token = new URL(request.url).searchParams.get(SHARE_TOKEN_PARAM)
  if (!token) return null

  const share = await shareByToken(token)
  // the deck id is checked rather than trusted: a token names its own deck, and a client
  // asking about a different one is either confused or trying it on
  if (!share || share.deckId !== deckId) return null

  if (share.passwordHash) {
    const grant = (await cookies()).get(grantCookie(share.id))?.value
    if (!(await grantIsGood(share, grant))) return null
  }

  return { ownerId: share.ownerId, canWrite: share.mode === "edit" }
}

/**
 * The reader behind a request to one deck, or null for nobody.
 *
 * Link credentials are considered before the session on purpose: someone signed in here
 * who opens a colleague's share link is visiting *as the link*, and resolving them to
 * their own account would turn a working link into "no such deck".
 */
export async function deckReader(request: Request, deckId: string): Promise<DeckReader | null> {
  const shared = await fromShareLink(request, deckId)
  if (shared) return shared

  const previewing = await ownerFromPreviewRequest(request, deckId)
  if (previewing) return { ownerId: previewing, canWrite: false }

  const user = await currentUser()
  return user ? { ownerId: user.id, canWrite: true } : null
}
