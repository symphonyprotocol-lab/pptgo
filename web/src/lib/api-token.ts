import "server-only"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { apiTokens, users, type ApiTokenRow } from "@/db/schema"
import type { SessionUser } from "@/auth"
import type { ApiTokenSummary } from "@/types/token"

/**
 * The visible marker. It is here so a token found loose in a config file, a log or a paste
 * can be recognised for what it is — by its owner, and by the secret scanners that look
 * for exactly this shape.
 */
const PREFIX = "pptgo_"

/** 256 bits. Not a password: nothing about it is guessable, so nothing has to be slow. */
const TOKEN_BYTES = 32

/** How much of the plaintext is kept so the reader can tell two rows apart. */
const HINT_CHARS = 6

export const MAX_TOKENS_PER_OWNER = 20
export const MAX_TOKEN_NAME = 100

/** How stale `lastUsedAt` is allowed to get. See `touch`. */
const TOUCH_INTERVAL = 5 * 60 * 1000

function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Web Crypto rather than `node:crypto`, so this module stays runtime-agnostic — the MCP
 * endpoint that will verify tokens is a route handler, and route handlers do not promise
 * to be running on Node.
 */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** One definition of "past its expiry", shared by the display and the check that matters. */
function hasExpired(expiresAt: Date | null): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now())
}

function summarize(row: ApiTokenRow): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expired: hasExpired(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listTokens(ownerId: string): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.ownerId, ownerId))
    .orderBy(desc(apiTokens.createdAt))
  return rows.map(summarize)
}

export async function countTokens(ownerId: string): Promise<number> {
  return (await listTokens(ownerId)).length
}

/**
 * Mint one. The plaintext is returned and then unrecoverable — it is never stored, and
 * this is the only moment it exists outside the caller's client.
 */
export async function createToken(
  ownerId: string,
  name: string,
  expiresAt: Date | null,
): Promise<{ summary: ApiTokenSummary; token: string }> {
  const random = base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
  const token = `${PREFIX}${random}`

  const [row] = await db
    .insert(apiTokens)
    .values({
      ownerId,
      name: name.slice(0, MAX_TOKEN_NAME),
      tokenHash: await sha256(token),
      prefix: `${PREFIX}${random.slice(0, HINT_CHARS)}`,
      expiresAt,
    })
    .returning()

  return { summary: summarize(row), token }
}

export async function deleteToken(id: string, ownerId: string): Promise<boolean> {
  // scoped by owner in the same statement, the same way decks are: someone else's token id
  // and one that does not exist give the same answer
  const [row] = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.ownerId, ownerId)))
    .returning()
  return Boolean(row)
}

/**
 * Record that a token was used, but not on every request.
 *
 * The field exists so a reader can spot a credential they no longer recognise, which needs
 * a resolution of minutes rather than milliseconds. Writing a row on every call would make
 * a read-only API call a write, and put a row update in front of every MCP tool call.
 */
function touch(row: ApiTokenRow): void {
  const last = row.lastUsedAt?.getTime() ?? 0
  if (Date.now() - last < TOUCH_INTERVAL) return
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {})
}

/** The token out of an `Authorization: Bearer …` header, if there is one shaped like ours. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header) return null
  const [scheme, ...rest] = header.split(" ")
  if (scheme.toLowerCase() !== "bearer") return null
  const token = rest.join(" ").trim()
  return token.startsWith(PREFIX) ? token : null
}

/**
 * Who is calling, for a request that carries a token instead of a session cookie.
 *
 * Deliberately not a fallback inside `currentUser()`: the two credentials reach different
 * routes on purpose. A token is for the machine API, and letting one authenticate the
 * pages that mint and revoke tokens would let a leaked token extend itself indefinitely.
 */
export async function userFromBearer(request: Request): Promise<SessionUser | null> {
  const token = bearerToken(request)
  if (!token) return null

  const [found] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.ownerId, users.id))
    .where(eq(apiTokens.tokenHash, await sha256(token)))
    .limit(1)
  if (!found) return null

  if (hasExpired(found.token.expiresAt)) return null

  touch(found.token)

  return {
    id: found.user.id,
    name: found.user.name ?? null,
    email: found.user.email ?? null,
    image: found.user.image ?? null,
  }
}
