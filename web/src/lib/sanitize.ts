/** Inline/block tags the rich-text editor is allowed to produce or keep. */
const ALLOWED_TAGS = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "SPAN", "FONT", "SUB", "SUP",
  "UL", "OL", "LI", "A", "MARK", "CODE", "BLOCKQUOTE",
])

/** Dropped along with their subtree — promoting their children would be worse than losing them. */
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "INPUT",
  "BUTTON", "TEXTAREA", "SELECT", "NOSCRIPT", "TEMPLATE", "SVG", "MATH", "AUDIO", "VIDEO",
  "SOURCE", "TRACK", "CANVAS", "IMG", "APPLET", "FRAME", "FRAMESET", "PORTAL",
])

/**
 * Elements the HTML parser put in the SVG or MathML namespace go with their subtree,
 * whatever they are called.
 *
 * The `DROP_TAGS` entries above cannot catch them on their own: `tagName` preserves the
 * author's case for foreign content, so `<svg>` arrives as `"svg"` and misses a set of
 * upper-case names. They happened to be unwrapped instead — but foreign content is
 * exactly where the parse/serialise round trip below stops being an identity (an
 * `<annotation-xml>` or `<mglyph>` can flip the parsing context on the way back in), so
 * they are cut out by namespace rather than left to a name comparison.
 */
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"

const ATTRS_BY_TAG: Record<string, Set<string>> = {
  A: new Set(["href", "style"]),
  FONT: new Set(["color", "face", "style"]),
}
const DEFAULT_ATTRS = new Set(["style"])

const SAFE_STYLE = /^[a-zA-Z0-9\s\-#(),.%'"/:;]*$/
const UNSAFE_STYLE = /url\s*\(|expression\s*\(|javascript\s*:|behaviou?r\s*:|-moz-binding|@import/i
const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i

/**
 * How many times the scrub is repeated before its output is treated as untrustworthy.
 * A clean fragment reaches a fixed point on the second pass; three is slack, not a budget.
 */
const MAX_PASSES = 3

/**
 * Rich-text content is stored as HTML and re-rendered with `dangerouslySetInnerHTML`,
 * so anything arriving from an imported file, a paste or storage has to be scrubbed.
 *
 * Disallowed tags are unwrapped rather than dropped so their text survives — which puts the
 * promoted children at a position the walk has already passed. They are re-entered rather
 * than skipped, otherwise `<article><img onerror=...>` would slip through untouched.
 *
 * The scrub is then repeated until the markup stops changing. One pass only proves the
 * *parsed tree* was safe; what gets stored and later re-parsed is the serialisation of it,
 * and markup that serialises to something that parses differently is the whole mutation-XSS
 * family. Re-scrubbing is how that difference is caught: a fragment that will not settle
 * within `MAX_PASSES` is reduced to its text, which cannot mutate into anything.
 *
 * Throws outside the browser rather than returning "". This needs a DOM, and every caller
 * is handling text the user typed — quietly handing back an empty string would erase a
 * deck's contents and look like a successful save.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") {
    throw new Error("sanitizeHtml needs a DOM — call it from the browser")
  }
  if (!html) return ""

  let current = scrubOnce(html)
  for (let pass = 1; pass < MAX_PASSES; pass += 1) {
    const next = scrubOnce(current)
    if (next === current) return current
    current = next
  }
  return escapeHtml(textOf(current))
}

function scrubOnce(html: string): string {
  const template = document.createElement("template")
  template.innerHTML = html
  scrub(template.content)
  return template.innerHTML
}

function textOf(html: string): string {
  const template = document.createElement("template")
  template.innerHTML = html
  return template.content.textContent ?? ""
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
    // foreign content preserves the author's case, so this is the only comparison that
    // treats `<svg>` and `<SVG>` as the same tag
    const tag = el.tagName.toUpperCase()

    if (el.namespaceURI !== HTML_NAMESPACE || DROP_TAGS.has(tag)) {
      el.remove()
      node = next
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) {
      const promoted = Array.from(el.childNodes)
      el.replaceWith(...promoted)
      node = promoted[0] ?? next
      continue
    }

    scrubAttributes(el, tag)
    scrub(el)
    node = next
  }
}

function scrubAttributes(el: Element, tag: string) {
  const allowed = ATTRS_BY_TAG[tag] ?? DEFAULT_ATTRS
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
  if (tag === "A") {
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
