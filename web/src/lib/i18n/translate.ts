import type { Locale } from "./locale"
import { messages, type MessageKey } from "./messages"

export type Translate = (key: MessageKey) => string

/**
 * Look-ups for one language. Kept separate from React so server components, client
 * components and plain functions all reach the strings the same way.
 */
export function translator(locale: Locale): Translate {
  const table = messages[locale]
  return (key) => table[key]
}
