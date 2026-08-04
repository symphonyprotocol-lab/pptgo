import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import {
  MARGIN,
  MIN_READABLE,
  asPoints,
  contrast,
  contrastFloor,
  estimateHeight,
  rgbOf,
} from "./design/tokens"
import { resolveTheme } from "./design/themes"
import { toPlainText } from "./text"
import type { DeckTheme, Slide, SlideElement } from "@/types/slides"

/**
 * What an agent gets instead of looking at the slide.
 *
 * Everything here is a mistake that has a definition. "This layout is ugly" does not, and
 * nothing below attempts it. "This text box holds four lines of type in the space of two",
 * "this grey is 3.8:1 on this white", "these two blocks start three units apart, which is
 * not alignment and not a deliberate offset either" — those do, and they are most of what
 * actually goes wrong when a model places elements by coordinate with no way to see the
 * result.
 *
 * The bar for adding a rule is that it must almost never fire on a slide that is fine.
 * A warning list people learn to skip is worse than no warning list, so several plausible
 * checks are deliberately narrower than they could be: margins are only checked for
 * elements that are *nearly* flush rather than flush, contrast is only checked against a
 * field that can actually be identified, and palette drift ignores greys because a derived
 * neutral is not a colour someone chose.
 */

/** How far outside the canvas an element may sit before it is worth mentioning. */
const EDGE_TOLERANCE = 2

/** Fraction of the smaller element that has to be covered before an overlap is reported. */
const OVERLAP_THRESHOLD = 0.25

/** How much taller than its box text may estimate before it is called an overflow. */
const OVERFLOW_TOLERANCE = 1.2

/** Two edges closer than this and not equal are a slip rather than a decision. */
const ALIGNMENT_SLOP = 6

/** Enough to act on. Past this the list stops being read. */
const MAX_WARNINGS = 12

/**
 * Types whose overlap is a bug rather than a layout.
 *
 * Text over a rounded rectangle is the most common thing on any slide, and an image behind
 * a caption is the second — flagging those would make the warnings worth ignoring, which
 * is worse than not having them. Two blocks of *content* on top of each other is the case
 * that is almost never deliberate.
 */
const COLLIDABLE = new Set(["text", "table", "chart", "formula"])

const round = (value: number) => Math.round(value * 10) / 10
const label = (element: SlideElement) => element.name || element.id

function overlapArea(a: SlideElement, b: SlideElement): number {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return x > 0 && y > 0 ? x * y : 0
}

const contains = (outer: SlideElement, inner: SlideElement) =>
  outer.left <= inner.left + 1 &&
  outer.top <= inner.top + 1 &&
  outer.left + outer.width >= inner.left + inner.width - 1 &&
  outer.top + outer.height >= inner.top + inner.height - 1

/** HSV saturation — how much of a colour a colour is. */
function saturation(color: string): number {
  const [r, g, b] = rgbOf(color)
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

/** The text an element carries, and the size and colour it carries it at. */
function typeOf(element: SlideElement) {
  if (element.type === "text") {
    return {
      text: toPlainText(element.content),
      size: element.fontSize,
      color: element.color,
      bold: element.bold,
      lineHeight: element.lineHeight,
      wraps: element.wrap !== false,
      fill: element.fill,
    }
  }
  if (element.type === "shape" && toPlainText(element.text.content)) {
    return {
      text: toPlainText(element.text.content),
      size: element.text.fontSize,
      color: element.text.color,
      bold: element.text.bold,
      lineHeight: element.text.lineHeight,
      // a shape's label is centred in it and expected to be short; calling it an overflow
      // when it wraps once would fire on half the shapes anyone draws
      wraps: false,
      fill: element.fill,
    }
  }
  return undefined
}

/**
 * The colour actually behind a piece of text.
 *
 * Its own fill first, then the topmost shape *below it in z-order* that covers it — which
 * is how a title on a colour block or a caption on a card gets checked against the block
 * rather than against the page. An image underneath means the field is unknowable, and an
 * unknowable field is not a failed check.
 */
function fieldUnder(
  slide: Slide,
  index: number,
  element: SlideElement,
  deckBackground: string,
): string | undefined {
  const own = typeOf(element)?.fill
  if (own) return own

  for (let below = index - 1; below >= 0; below--) {
    const candidate = slide.elements[below]
    if (!contains(candidate, element)) continue
    if (candidate.type === "shape") return candidate.fill
    if (candidate.type === "image" || candidate.type === "video") return undefined
  }

  if (slide.background.type === "solid") return slide.background.color
  if (slide.background.type === "image") return undefined
  return deckBackground
}

/** An element deliberately running to the edge of the page rather than sitting on the grid. */
const fullBleedX = (element: SlideElement) =>
  element.left <= EDGE_TOLERANCE || element.left + element.width >= VIEWPORT_WIDTH - EDGE_TOLERANCE
const fullBleedY = (element: SlideElement) =>
  element.top <= EDGE_TOLERANCE || element.top + element.height >= VIEWPORT_HEIGHT - EDGE_TOLERANCE

export function lintSlide(slide: Slide, theme?: DeckTheme): string[] {
  const found: string[] = []
  const deckBackground = theme?.backgroundColor ?? "#ffffff"

  /*
    The deck's palette as the layouts know it, not as the document stores it.

    `DeckTheme` holds four fields; the muted ink a caption is set in and the surface a card
    sits on are recovered from them rather than stored. Building the set from the *resolved*
    theme is what stops the palette check from reporting a deck's own caption grey as a
    stray colour.
  */
  const resolved = theme ? resolveTheme(theme) : undefined
  const palette = new Set(
    (resolved ? [...resolved.chart, ...Object.values(resolved.colors)] : [])
      .map((one) => one.trim().toLowerCase()),
  )
  const strays: string[] = []

  slide.elements.forEach((element, index) => {
    const right = element.left + element.width
    const bottom = element.top + element.height

    if (
      element.left < -EDGE_TOLERANCE ||
      element.top < -EDGE_TOLERANCE ||
      right > VIEWPORT_WIDTH + EDGE_TOLERANCE ||
      bottom > VIEWPORT_HEIGHT + EDGE_TOLERANCE
    ) {
      found.push(
        `${label(element)} extends outside the ${VIEWPORT_WIDTH}×${VIEWPORT_HEIGHT} canvas ` +
          `(${round(element.left)},${round(element.top)} to ${round(right)},${round(bottom)})`,
      )
    }

    /*
      Inside the margin, but not flush to the edge.

      Flush is a decision — a full-bleed image, a colour block, a band across the bottom.
      Eighteen units in from the edge is nobody's decision; it is a coordinate that was
      guessed. Only content types are checked, for the same reason overlap is.
    */
    if (COLLIDABLE.has(element.type)) {
      const crowded: string[] = []
      if (!fullBleedX(element)) {
        if (element.left > EDGE_TOLERANCE && element.left < MARGIN) crowded.push("left")
        if (right < VIEWPORT_WIDTH - EDGE_TOLERANCE && right > VIEWPORT_WIDTH - MARGIN)
          crowded.push("right")
      }
      if (!fullBleedY(element)) {
        if (element.top > EDGE_TOLERANCE && element.top < MARGIN) crowded.push("top")
        if (bottom < VIEWPORT_HEIGHT - EDGE_TOLERANCE && bottom > VIEWPORT_HEIGHT - MARGIN)
          crowded.push("bottom")
      }
      if (crowded.length) {
        found.push(
          `${label(element)} sits inside the ${MARGIN}-unit ${crowded.join("/")} margin — ` +
            `move it onto the grid or take it all the way to the edge`,
        )
      }
    }

    const type = typeOf(element)
    if (element.type === "text" && !toPlainText(element.content).trim()) {
      found.push(`${label(element)} is an empty text box`)
    }

    if (!type) return

    if (type.size < MIN_READABLE) {
      found.push(
        `${label(element)} is set at ${round(type.size)} units (${asPoints(type.size)}pt) — ` +
          `below ${MIN_READABLE} nothing is readable from a room`,
      )
    }

    if (type.wraps && element.width > 0 && element.height > 0) {
      const needs = estimateHeight(type.text, element.width, type.size, type.lineHeight)
      if (needs > element.height * OVERFLOW_TOLERANCE) {
        found.push(
          `${label(element)} holds about ${Math.ceil(needs / (type.size * type.lineHeight))} ` +
            `lines of type in a box ${round(element.height)} tall — it needs about ` +
            `${Math.round(needs)}. Give it the height, or say less.`,
        )
      }
    }

    const field = fieldUnder(slide, index, element, deckBackground)
    if (field) {
      const ratio = contrast(type.color, field)
      const floor = contrastFloor(type.size, type.bold)
      if (ratio < floor) {
        found.push(
          `${label(element)} is ${type.color} on ${field} — ${ratio.toFixed(1)}:1, under the ` +
            `${floor}:1 this size needs`,
        )
      }
    }

    if (palette.size && !palette.has(type.color.trim().toLowerCase()) && saturation(type.color) >= 0.2) {
      strays.push(`${label(element)} (${type.color})`)
    }
  })

  const collidable = slide.elements.filter((element) => COLLIDABLE.has(element.type))
  for (let i = 0; i < collidable.length; i++) {
    for (let j = i + 1; j < collidable.length; j++) {
      const a = collidable[i]
      const b = collidable[j]
      const smaller = Math.min(a.width * a.height, b.width * b.height)
      if (smaller <= 0) continue
      const share = overlapArea(a, b) / smaller
      if (share > OVERLAP_THRESHOLD) {
        found.push(
          `${label(a)} and ${label(b)} overlap by ${Math.round(share * 100)}% of the smaller one`,
        )
      }
    }
  }

  /*
    Almost aligned.

    Two edges three units apart read as a mistake in a way that thirty units never does:
    the eye sees an attempt at a line and a failure to hit it. Full-bleed elements are left
    out — their edges are the page's, not the grid's.
  */
  const edges = [
    ...new Set(
      slide.elements
        .filter((element) => !fullBleedX(element))
        .map((element) => round(element.left)),
    ),
  ].sort((a, b) => a - b)

  const nearMisses = edges
    .slice(1)
    .map((edge, index) => [edges[index], edge] as const)
    .filter(([a, b]) => b - a > 0.5 && b - a < ALIGNMENT_SLOP)
  if (nearMisses.length) {
    found.push(
      `left edges almost line up but do not: ${nearMisses
        .map(([a, b]) => `${a} vs ${b}`)
        .join(", ")}`,
    )
  }

  if (strays.length) {
    found.push(
      `${strays.length} element${strays.length > 1 ? "s use" : " uses"} a colour outside the ` +
        `deck theme: ${strays.slice(0, 3).join(", ")}${strays.length > 3 ? ", …" : ""}`,
    )
  }

  if (found.length <= MAX_WARNINGS) return found
  return [...found.slice(0, MAX_WARNINGS), `…and ${found.length - MAX_WARNINGS} more`]
}
