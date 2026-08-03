/**
 * Language selection, shared by the server and the client.
 *
 * The choice lives in a cookie rather than `localStorage` because the landing page,
 * dashboard and sign-in page are server components: the server has to know the language
 * to render the first byte in it. A client-side store would mean shipping Chinese markup
 * to an English reader and swapping it after hydration.
 */

export const LOCALES = ["zh", "en"] as const

export type Locale = (typeof LOCALES)[number]

/** English is the fallback for anything that is not Chinese. */
export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_COOKIE = "pptgo-locale"

/** A year: the choice is a preference, not a session detail. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/**
 * Picks a language from a `navigator.languages` or `Accept-Language` style list.
 *
 * Only the primary subtag is compared, so `zh-Hans-CN`, `zh-TW` and bare `zh` all count
 * as Chinese — the app has one Chinese translation and region does not change it.
 */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.trim().toLowerCase().split(/[-_;]/)[0]
    if (primary === "zh") return "zh"
    if (primary === "en") return "en"
  }
  return DEFAULT_LOCALE
}

/** Parses an `Accept-Language` header into tags ordered by their q-value. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return []
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";")
      const q = params.find((p) => p.trim().startsWith("q="))
      return { tag: tag.trim(), q: q ? Number(q.split("=")[1]) || 0 : 1 }
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag)
}
