import type { Locale } from "./locale"
import { messages, type MessageKey } from "./messages"

/** Values for the `{name}` placeholders in a message. */
export type MessageParams = Record<string, string | number>

export type Translate = (key: MessageKey, params?: MessageParams) => string

/**
 * Look-ups for one language. Kept separate from React so server components, client
 * components and plain functions all reach the strings the same way.
 *
 * Interpolation is `{name}`. A placeholder with no matching param is left standing rather
 * than replaced with "undefined": a visible `{count}` reads as a bug in the message table
 * and gets fixed there, whereas "undefined pages" reads as a data problem and gets chased
 * through the wrong half of the app.
 */
export function translator(locale: Locale): Translate {
  const table = messages[locale]
  return (key, params) => {
    const text = table[key]
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    )
  }
}

/** The English table, for code that runs where no request locale is available. */
export const fallbackTranslate: Translate = translator("en")
