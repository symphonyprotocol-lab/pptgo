import { NextResponse, type NextRequest } from "next/server"

/**
 * Content-Security-Policy, as a second line behind the sanitiser.
 *
 * The editor renders user-authored HTML through `dangerouslySetInnerHTML`, so a
 * hand-rolled sanitiser is the only thing between a pasted fragment and script execution.
 * A policy without `unsafe-inline` in `script-src` means that even a bypass yields markup
 * the browser refuses to run.
 *
 * It has to be a nonce rather than a flat `'self'`: Next streams its hydration payload as
 * inline `<script>` tags, so a policy that bans inline scripts outright bans the framework
 * along with the attack. The nonce is minted per request here, Next stamps it onto its own
 * scripts (it re-reads this header off the request to find it), and the theme boot script
 * in the root layout takes it from `headers()`.
 *
 * This lives in `proxy.ts` rather than `middleware.ts`: Next 16 renamed the convention and
 * warns on the old name at build time.
 *
 * What the rest of the directives are paying for:
 *  - `style-src` keeps `unsafe-inline`: every element on a slide is positioned by an inline
 *    `style`, so removing it would render decks without their layout.
 *  - `img-src` / `media-src` allow `data:` and `blob:` because embedded media *is* data
 *    URIs, and the exporters round-trip through blobs.
 *  - `frame-ancestors 'none'` is what actually stops clickjacking; `X-Frame-Options` in
 *    `next.config.ts` is the older half of the same rule, for older agents.
 */
function policy(nonce: string): string {
  // the dev bundler evaluates code at runtime; production builds do not need it
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `'self' 'nonce-${nonce}' 'unsafe-eval' 'strict-dynamic'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'`

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    // avatars come from Google's CDN; embedded media is data URIs and exports use blobs
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = policy(nonce)

  // on the request so the framework and the layout can both read the nonce back out
  const headers = new Headers(request.headers)
  headers.set("x-nonce", nonce)
  headers.set("content-security-policy", csp)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Everything that renders HTML. API routes answer with JSON and build output is static
     * bytes, so neither has an inline script to authorise — minting a nonce per image would
     * be work no one reads. They still get the fixed headers from `next.config.ts`.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
