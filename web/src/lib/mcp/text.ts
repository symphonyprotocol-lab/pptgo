/**
 * The seam between what an agent writes and what the editor stores.
 *
 * Text elements hold HTML, and the editor's sanitiser parses it with a real DOM — which
 * the server does not have, and which now throws rather than silently returning "" when
 * called outside a browser. Rather than carry a DOM implementation into the server just to
 * clean up markup, the MCP surface does not accept markup at all: tools take plain text
 * and this turns it into HTML that is safe by construction, because nothing in it was ever
 * markup to begin with.
 *
 * The cost is that an agent cannot bold three words in the middle of a sentence. Weight,
 * colour and alignment are fields on the element, so whole-run styling is unaffected; the
 * mixed-run case is something a person does in the editor, and buying it would mean
 * accepting markup from a machine and needing a sanitiser again.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/** Plain text as stored rich text. Line breaks survive; nothing else is interpreted. */
export function toStoredHtml(plain: string): string {
  return plain
    .replace(/[&<>"']/g, (char) => ESCAPES[char])
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>")
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
}

/**
 * Stored rich text back as plain text, for reading a deck out to an agent.
 *
 * A tag-stripping regex rather than a parse: this feeds a summary an agent reads to decide
 * what to edit next, so "close enough to recognise the sentence" is the requirement. It
 * never runs on anything that is about to be stored or rendered, which is where being
 * approximately right about HTML would matter.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Shortened for a listing, with a marker so the reader knows something was left out. */
export function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
