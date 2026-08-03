import type { Translate } from "./i18n/translate"

/**
 * A timestamp as "3 minutes ago", falling back to a plain date once that stops being
 * useful.
 *
 * Rendered on the server too, where "now" and the timezone differ from the browser's —
 * hence `suppressHydrationWarning` on the element that shows it.
 *
 * The absolute fallback is formatted for the reader's locale rather than always zh-CN,
 * which put `2026/3/14` in front of readers who write it the other way round.
 */
export function formatTime(iso: string, t: Translate, locale: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 1) return t("time.justNow")
  if (minutes < 60) return t("time.minutes", { n: minutes })
  if (minutes < 60 * 24) return t("time.hours", { n: Math.floor(minutes / 60) })
  if (minutes < 60 * 24 * 7) return t("time.days", { n: Math.floor(minutes / 60 / 24) })
  return formatDate(iso, locale)
}

/** A date with no "ago" about it — for things that are in the future, like an expiry. */
export function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB")
}
