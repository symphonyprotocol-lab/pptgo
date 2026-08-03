import "server-only"

/**
 * Signing key for a machine that has no `.env.local` yet. A fresh clone is supposed to
 * reach the editor with `npm install && npm run dev`, and without this Auth.js throws
 * `MissingSecret` on every page that reads a session — which is `/` and `/login`.
 *
 * It is deliberately named to be unusable by accident: it only applies outside production,
 * and compose refuses to start without a real `AUTH_SECRET`. Anything signed with this is
 * forgeable, so never run a reachable server with `NODE_ENV=development`.
 */
const DEV_SECRET = "pptgo-development-only-insecure-secret"

/**
 * The one key this app signs with — session cookies, the read-only preview links, and the
 * cookie that says a visitor got a share's password right.
 *
 * They share a key on purpose rather than by accident: all three are "this server said so"
 * claims with no state behind them, and a deployment that rotates `AUTH_SECRET` to cut off
 * stolen cookies should cut off the rest in the same move.
 *
 * Undefined only outside production, where Auth.js is allowed to fall back. Callers that
 * cannot proceed without a key say so themselves.
 */
export function signingSecret(): string | undefined {
  return (
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : DEV_SECRET)
  )
}

export function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function randomToken(bytes = 16): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/**
 * HMAC-SHA256 of a message under the app's key, base64url.
 *
 * Web Crypto rather than `node:crypto` for the same reason `lib/api-token.ts` uses it: the
 * routes that verify these are route handlers, and route handlers do not promise to be
 * running on Node.
 */
export async function hmac(message: string): Promise<string> {
  const secret = signingSecret()
  if (!secret) {
    // production without AUTH_SECRET: the same deployment error that stops sessions
    // working, and signing with a guessable key would be worse than refusing
    throw new Error("AUTH_SECRET is required to sign links.")
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return base64url(new Uint8Array(signature))
}

/** Compared without an early return, so a wrong value cannot be walked one character at a time. */
export function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}
