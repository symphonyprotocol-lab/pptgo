import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { deckShares, decks, type DeckShareRow } from "@/db/schema"
import { base64url, hmac, randomToken, sameSignature } from "@/lib/signing"
import type { Share, ShareMode } from "@/types/share"

/**
 * Share links: a deck, opened to people who are not signed in.
 *
 * Three things a person can want, and one row that covers all three — whether the link
 * needs a password, whether it may be edited or only read, and whether it exists at all:
 *
 * - **open link** — no password. The URL *is* the permission; whoever it reaches can open it
 * - **password link** — the URL gets you a form, the passphrase gets you the deck
 * - **read or edit** — an edit link may change slides, and only slides. Renaming, copying
 *   and deleting the deck stay with the account that owns it, because those are decisions
 *   about the file rather than work inside it
 *
 * Unlike the preview links in `share-link.ts`, these have a row behind them, which is what
 * buys the two properties an owner-issued link needs and an agent-issued one does not:
 * they can be revoked on the spot, and they can be read back out tomorrow to copy again.
 */

/** 128 bits in the URL. Long enough that guessing is not a strategy, short enough to paste. */
const TOKEN_BYTES = 16

export const MAX_SHARE_PASSWORD = 100

/**
 * PBKDF2 rounds. OWASP's floor for PBKDF2-HMAC-SHA256 at the time of writing.
 *
 * The API token beside this is hashed with a bare sha256 and that is right for it: it
 * hashes 256 bits of our own randomness, where a brute force has nothing to be clever
 * about. This hashes a passphrase a person chose and probably reused, so the cost per
 * guess is the whole defence.
 */
const PBKDF2_ROUNDS = 210_000

export const sharePath = (token: string) => `/s/${token}`

function present(row: DeckShareRow): Share {
  return {
    deckId: row.deckId,
    mode: row.mode as ShareMode,
    hasPassword: Boolean(row.passwordHash),
    path: sharePath(row.token),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Exported for its test: what a passphrase turns into is worth checking directly. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ROUNDS,
      hash: "SHA-256",
    },
    key,
    256,
  )
  return base64url(new Uint8Array(bits))
}

/** The deck's share, for the owner. Null when it is not shared. */
export async function readShare(deckId: string, ownerId: string): Promise<Share | null> {
  const [row] = await db
    .select()
    .from(deckShares)
    .where(and(eq(deckShares.deckId, deckId), eq(deckShares.ownerId, ownerId)))
    .limit(1)
  return row ? present(row) : null
}

/** Which of this owner's decks are shared, for the one mark the dashboard shows. */
export async function sharedDeckIds(ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ deckId: deckShares.deckId })
    .from(deckShares)
    .where(eq(deckShares.ownerId, ownerId))
  return rows.map((row) => row.deckId)
}

/**
 * Start sharing, or change how.
 *
 * `password` is three-valued and each value is a different intent: a string sets one,
 * `null` removes it, and `undefined` leaves whatever is there alone. Without that
 * distinction, switching a link from read to edit would silently drop its password —
 * the request that says nothing about passwords would be indistinguishable from the one
 * that asks for none.
 *
 * The token is minted once and kept across edits: a link already sent to somebody should
 * not stop working because its owner changed the mode.
 */
export async function upsertShare(
  deckId: string,
  ownerId: string,
  { mode, password }: { mode: ShareMode; password?: string | null },
): Promise<Share | null> {
  // scoped by owner in the same statement, like every other deck read
  const [deck] = await db
    .select({ id: decks.id })
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.ownerId, ownerId)))
    .limit(1)
  if (!deck) return null

  const salt = password ? randomToken(16) : null
  const hash = password && salt ? await hashPassword(password, salt) : null

  const secret =
    password === undefined ? {} : { passwordHash: hash, passwordSalt: salt }

  const [row] = await db
    .insert(deckShares)
    .values({
      deckId,
      ownerId,
      token: randomToken(TOKEN_BYTES),
      mode,
      passwordHash: hash,
      passwordSalt: salt,
    })
    .onConflictDoUpdate({
      target: deckShares.deckId,
      set: { mode, updatedAt: new Date(), ...secret },
    })
    .returning()

  return present(row)
}

/** Revoke. Every link out there stops working on the next request. */
export async function deleteShare(deckId: string, ownerId: string): Promise<boolean> {
  const [row] = await db
    .delete(deckShares)
    .where(and(eq(deckShares.deckId, deckId), eq(deckShares.ownerId, ownerId)))
    .returning()
  return Boolean(row)
}

/** The share a visitor's URL points at, with the fields only the server should see. */
export async function shareByToken(token: string): Promise<DeckShareRow | null> {
  if (!token) return null
  const [row] = await db.select().from(deckShares).where(eq(deckShares.token, token)).limit(1)
  return row ?? null
}

export async function passwordMatches(row: DeckShareRow, password: string): Promise<boolean> {
  if (!row.passwordHash || !row.passwordSalt) return false
  return sameSignature(row.passwordHash, await hashPassword(password, row.passwordSalt))
}

// ── the cookie that says "this visitor got the password right" ──────────────────

/**
 * One cookie per share rather than one for all of them: two shared decks open in two tabs
 * are two unrelated permissions, and a single cookie would make the second visit overwrite
 * the first.
 */
export const grantCookie = (shareId: string) => `pptgo-share-${shareId}`

const GRANT_VERSION = "v1"
const DAY_MS = 24 * 60 * 60 * 1000
/** A working week of not being asked again, then the passphrase is worth re-proving. */
export const GRANT_TTL_DAYS = 7

/**
 * The signature covers the password hash, so changing or removing the passphrase makes
 * every cookie handed out under the old one invalid — otherwise "change the password"
 * would lock out nobody who had already been let in.
 */
const grantMessage = (row: DeckShareRow, expiresOn: string) =>
  `${GRANT_VERSION}.${row.id}.${row.deckId}.${row.passwordHash ?? ""}.${expiresOn}`

export async function signGrant(row: DeckShareRow, now: number = Date.now()): Promise<string> {
  const expiresOn = (Math.floor(now / DAY_MS) + GRANT_TTL_DAYS).toString(36)
  return `${expiresOn}.${await hmac(grantMessage(row, expiresOn))}`
}

export async function grantIsGood(
  row: DeckShareRow,
  grant: string | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!grant) return false
  const [expiresOn, signature] = grant.split(".")
  if (!expiresOn || !signature) return false

  const expiresAt = Number.parseInt(expiresOn, 36)
  if (!Number.isFinite(expiresAt) || expiresAt * DAY_MS <= now) return false

  return sameSignature(await hmac(grantMessage(row, expiresOn)), signature)
}
