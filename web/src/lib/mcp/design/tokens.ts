import { UNIT_TO_PT, toHex } from "@/lib/color"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"

/**
 * The measuring instruments the layouts and the lint share.
 *
 * A model placing elements by coordinate has no renderer and no eyes. Everything here
 * exists so that a decision which would normally be made by looking — does this heading
 * fit, is this grey readable on that grey, are these two boxes *almost* aligned — can be
 * made by arithmetic instead, on the server, before the slide is written.
 *
 * Nothing in this module knows what a slide looks like. It knows where the columns are,
 * how wide a character is, and how far apart two colours are.
 */

// ── the grid ───────────────────────────────────────────────────────────────────

/**
 * A twelve-column grid over the deck's own 1000 × 562.5 space.
 *
 * Twelve because it divides by 2, 3, 4 and 6, which is every split a slide actually
 * wants — halves, thirds, quarters, and a 4/8 sidebar. The numbers come out whole:
 * a column is exactly 55 units and twelve of them with their gutters are exactly the
 * 880-unit measure.
 */
export const MARGIN = 60
export const GUTTER = 20
export const COLUMNS = 12
export const COLUMN = (VIEWPORT_WIDTH - 2 * MARGIN - (COLUMNS - 1) * GUTTER) / COLUMNS

/** The measure: left edge of the first column to right edge of the last. */
export const CONTENT_LEFT = MARGIN
export const CONTENT_WIDTH = VIEWPORT_WIDTH - 2 * MARGIN
export const CONTENT_RIGHT = CONTENT_LEFT + CONTENT_WIDTH

/**
 * The horizontal bands. A slide is a header (title and kicker), a body, and nothing
 * below the bottom margin — every layout in this package agrees on those lines, which is
 * what makes a deck built from several of them look like one deck.
 */
export const HEADER_TOP = 52
export const CONTENT_TOP = 152
export const CONTENT_BOTTOM = VIEWPORT_HEIGHT - MARGIN
export const CONTENT_HEIGHT = CONTENT_BOTTOM - CONTENT_TOP

/** Width of `n` columns, gutters between them included. */
export const span = (n: number) => n * COLUMN + (n - 1) * GUTTER

/** Left edge of column `index`, zero-based. */
export const colLeft = (index: number) => CONTENT_LEFT + index * (COLUMN + GUTTER)

/**
 * `count` equal cells across `width`, with a gutter between them.
 *
 * Cards, KPIs and timeline steps are all this, and doing it by hand three times is how
 * the third one ends up two units narrower than the other two.
 */
export function track(
  count: number,
  { left = CONTENT_LEFT, width = CONTENT_WIDTH, gutter = GUTTER } = {},
): { left: number; width: number }[] {
  const cell = (width - (count - 1) * gutter) / count
  return Array.from({ length: count }, (_, i) => ({ left: left + i * (cell + gutter), width: cell }))
}

// ── type ───────────────────────────────────────────────────────────────────────

export interface TypeScale {
  /** cover and section numerals — the one thing on the page */
  display: number
  /** the page's title */
  title: number
  /** a card heading, a column heading */
  subtitle: number
  /** running text and bullets */
  body: number
  /** labels, sources, footers */
  caption: number
}

export const DEFAULT_SCALE: TypeScale = {
  display: 64,
  title: 40,
  subtitle: 24,
  body: 20,
  caption: 14,
}

/**
 * The floor, in canvas units.
 *
 * Export maps 1000 units to 10 inches, so a unit is 0.72pt and 14 units is almost exactly
 * 10pt — the smallest type anyone reads from the back of a room. Below this the lint
 * complains, and no layout ever goes there on its own.
 */
export const MIN_READABLE = 14

/** The same size in the points a PowerPoint user sees, for saying so out loud. */
export const asPoints = (units: number) => Math.round(units * UNIT_TO_PT * 10) / 10

// ── measuring text ─────────────────────────────────────────────────────────────

/**
 * Character widths as a fraction of the type size.
 *
 * A guess, and knowingly so: the real width depends on a font the server does not have
 * and cannot load. What it has to be right about is the *ratio* between a line of Chinese
 * and a line of English — a CJK glyph is a full em and a lowercase Latin letter is about
 * half of one, so a box sized for 40 English characters holds 20 Chinese ones. Getting
 * that wrong is what makes a Chinese deck overflow every box on the page.
 */
const NARROW = new Set("iljftrI.,;:'`!|()[]{}·-")
const WIDE_LATIN = new Set("mwMW@%")

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x303f) ||
    (code >= 0x3040 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

function emWidth(char: string): number {
  const code = char.codePointAt(0) ?? 32
  if (isFullWidth(code)) return 1
  if (char === " ") return 0.28
  if (NARROW.has(char)) return 0.31
  if (WIDE_LATIN.has(char)) return 0.85
  if (char >= "A" && char <= "Z") return 0.68
  if (char >= "0" && char <= "9") return 0.58
  // Helvetica and the system sans both set most lowercase letters at 0.556em; rounding
  // down from that is how a title comes out one line taller than the box reserved for it
  return 0.55
}

const measure = (text: string, fontSize: number) => {
  let em = 0
  for (const char of text) em += emWidth(char)
  return em * fontSize
}

/**
 * Where a line may break: every full-width character on its own, Latin runs held whole.
 *
 * Chinese wraps between any two characters and English does not, and a wrapper that
 * forgets the second half breaks "PowerPoint" across two lines.
 */
function breakable(paragraph: string): string[] {
  const out: string[] = []
  let run = ""
  for (const char of paragraph) {
    const code = char.codePointAt(0) ?? 32
    if (isFullWidth(code) || char === " ") {
      if (run) out.push(run)
      run = ""
      out.push(char)
    } else {
      run += char
    }
  }
  if (run) out.push(run)
  return out
}

/**
 * The lines this text is expected to break into, in a box that wide.
 *
 * Exported rather than kept private because the only honest way to look at a layout before
 * it exists is to draw it with the same wrapping the layout assumed. A preview that guesses
 * differently disagrees with the arithmetic and reports collisions that are its own.
 */
export function wrapText(text: string, width: number, fontSize: number): string[] {
  if (width <= 0 || fontSize <= 0) return [text]
  const out: string[] = []

  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("")
      continue
    }

    let line = ""
    let used = 0
    for (const token of breakable(paragraph)) {
      const w = measure(token, fontSize)
      if (used > 0 && used + w > width) {
        out.push(line)
        line = token === " " ? "" : token
        used = token === " " ? 0 : w
      } else {
        line += token
        used += w
      }
    }
    out.push(line)
  }

  return out.length ? out : [""]
}

/** How many lines this text takes in a box that wide. Explicit newlines always break. */
export const estimateLines = (text: string, width: number, fontSize: number): number =>
  Math.max(1, wrapText(text, width, fontSize).length)

/** The height that text wants, given the box width it has to wrap inside. */
export function estimateHeight(
  text: string,
  width: number,
  fontSize: number,
  lineHeight = 1.4,
): number {
  return estimateLines(text, width, fontSize) * fontSize * lineHeight
}

/**
 * The largest size from `sizes` at which the text still fits the box.
 *
 * This is what a person does by eye when a title turns out to be three words longer than
 * the template assumed. Descending order in, the smallest returned if none fit — a
 * cramped title is better than one that runs off the slide, and the lint will say so.
 */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  sizes: number[],
  lineHeight = 1.2,
): number {
  const ordered = [...sizes].sort((a, b) => b - a)
  for (const size of ordered) {
    if (estimateHeight(text, width, size, lineHeight) <= height) return size
  }
  return ordered[ordered.length - 1]
}

/** A descending ramp from `size` down to the floor, for handing to `fitFontSize`. */
export function ramp(size: number, steps = 4): number[] {
  return Array.from({ length: steps }, (_, i) =>
    Math.max(MIN_READABLE, Math.round(size * (1 - i * 0.14))),
  )
}

// ── colour ─────────────────────────────────────────────────────────────────────

export type Rgb = [number, number, number]

export function rgbOf(color: string): Rgb {
  const hex = toHex(color, "000000")
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

const hexOf = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`

/** `t` of the way from `a` to `b`. Used to derive a surface or a muted ink from a pair. */
export function mix(a: string, b: string, t: number): string {
  const from = rgbOf(a)
  const to = rgbOf(b)
  return hexOf([0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * t) as Rgb)
}

/** WCAG relative luminance. */
export function luminance(color: string): number {
  const [r, g, b] = rgbOf(color).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

/**
 * The WCAG threshold that applies to type of this size.
 *
 * Large text is held to 3:1 rather than 4.5:1, and 18pt is where "large" starts — which
 * in canvas units is 25. Applying the body rule to a 64-unit cover title would condemn
 * pairings that are perfectly legible at that scale, and a lint that cries wolf about
 * cover slides is a lint people switch off.
 */
export const contrastFloor = (fontSize: number, bold = false) =>
  fontSize >= 25 || (bold && fontSize >= 19) ? 3 : 4.5

/** Whichever candidate stands out most against `background` — normally ink or paper. */
export function readableOn(background: string, candidates: string[]): string {
  return candidates.reduce((best, one) =>
    contrast(one, background) > contrast(best, background) ? one : best,
  )
}
