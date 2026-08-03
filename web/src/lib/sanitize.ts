/** Inline/block tags the rich-text editor is allowed to produce or keep. */
const ALLOWED_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "SPAN", "FONT", "SUB", "SUP",
  "UL", "OL", "LI", "A", "MARK", "CODE", "BLOCKQUOTE",
])

/** Dropped along with their subtree — promoting their children would be worse than losing them. */
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "INPUT",
  "BUTTON", "TEXTAREA", "SELECT", "NOSCRIPT", "TEMPLATE", "SVG", "MATH", "AUDIO", "VIDEO",
  "SOURCE", "TRACK", "CANVAS",
])

const ATTRS_BY_TAG: Record<string, Set<string>> = {
  A: new Set(["href", "style"]),
  FONT: new Set(["color", "face", "style"]),
}
const DEFAULT_ATTRS = new Set(["style"])

const SAFE_STYLE = /^[a-zA-Z0-9\s\-#(),.%'"/:;]*$/
const UNSAFE_STYLE = /url\s*\(|expression\s*\(|javascript\s*:|behaviou?r\s*:|-moz-binding|@import/i
const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i

/**
 * Rich-text content is stored as HTML and re-rendered with `dangerouslySetInnerHTML`,
 * so anything arriving from an imported file, a paste or localStorage has to be scrubbed.
 *
 * Disallowed tags are unwrapped rather than dropped so their text survives — which puts the
 * promoted children at a position the walk has already passed. They are re-entered rather
 * than skipped, otherwise `<article><img onerror=...>` would slip through untouched.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return ""
  const template = document.createElement("template")
  template.innerHTML = html
  scrub(template.content)
  return template.innerHTML
}

function scrub(root: ParentNode) {
  let node: ChildNode | null = root.firstChild
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.nextSibling
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      // comments, CDATA, processing instructions
      const next: ChildNode | null = node.nextSibling
      node.remove()
      node = next
      continue
    }

    const el = node as Element
    const next: ChildNode | null = el.nextSibling

    if (DROP_TAGS.has(el.tagName)) {
      el.remove()
      node = next
      continue
    }

    if (!ALLOWED_TAGS.has(el.tagName)) {
      const promoted = Array.from(el.childNodes)
      el.replaceWith(...promoted)
      node = promoted[0] ?? next
      continue
    }

    scrubAttributes(el)
    scrub(el)
    node = next
  }
}

function scrubAttributes(el: Element) {
  const allowed = ATTRS_BY_TAG[el.tagName] ?? DEFAULT_ATTRS
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const value = attr.value
    if (!allowed.has(name)) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === "style" && (!SAFE_STYLE.test(value) || UNSAFE_STYLE.test(value))) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === "href" && !SAFE_HREF.test(value.trim())) {
      el.removeAttribute(attr.name)
      continue
    }
    if (name === "color" && !/^#?[a-zA-Z0-9]{3,8}$/.test(value)) {
      el.removeAttribute(attr.name)
    }
  }
  if (el.tagName === "A") {
    el.setAttribute("target", "_blank")
    el.setAttribute("rel", "noopener noreferrer")
  }
}

const BLOCK_END = /<\/(div|p|li|blockquote)>/gi

export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(BLOCK_END, "\n")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\n+$/, "")
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
}

/**
 * Runs a replacement over the *text* of a rich-text fragment, leaving its markup standing.
 *
 * Find-and-replace used to rebuild the element from `htmlToPlainText`, which meant any
 * paragraph containing the search term came back stripped of every bold run, colour, link
 * and list it had — a silent formatting loss on elements the user only meant to retouch a
 * word in. Walking the text nodes instead keeps the tags exactly where they were.
 *
 * The tradeoff is that a match has to sit inside one text node: "hello" split across
 * `he<b>llo</b>` is found by the plain-text search but cannot be replaced without deciding
 * which half keeps the bold. Those are left alone rather than guessed at, so `replaced`
 * reports what actually changed instead of what matched.
 */
export function replaceInHtmlText(
  html: string,
  pattern: RegExp,
  replacement: string,
): { html: string; replaced: number } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let replaced = 0

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ""
    if (!text) continue
    // a fresh lastIndex per node: the pattern is global and shared across the whole deck
    pattern.lastIndex = 0
    const next = text.replace(pattern, () => {
      replaced += 1
      return replacement
    })
    if (next !== text) node.nodeValue = next
  }

  return { html: replaced ? doc.body.innerHTML : html, replaced }
}
