import "server-only"
import { cookies, headers } from "next/headers"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLocale,
  parseAcceptLanguage,
  type Locale,
} from "./locale"

/**
 * The language this request should render in.
 *
 * An explicit choice always wins. Failing that the browser's own `Accept-Language` is
 * honoured, so a first-time visitor gets their system language without a flash of the
 * wrong one — the page is rendered in it rather than corrected afterwards. Anything that
 * is neither Chinese nor English falls back to English.
 */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  const accept = (await headers()).get("accept-language")
  return matchLocale(parseAcceptLanguage(accept)) ?? DEFAULT_LOCALE
}
