import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { toPlainText, truncate } from "./text"
import type { Deck, Slide, SlideElement } from "@/types/slides"

/**
 * What an agent reads instead of looking at the deck.
 *
 * A model cannot see the rendered slide, and rendering one for it to look at needs the
 * same canvas dependency the PPTX export does. So the outline is the substitute: enough
 * structure to decide what to change next, small enough to re-read after every write. A
 * 20-page deck lands in a few thousand tokens, where the documents themselves run to
 * megabytes once images are embedded.
 *
 * Everything here is lossy on purpose. Colours, fonts, shadows and filters are absent —
 * they are what `slide_read` is for. What survives is position, size, and what the thing
 * says.
 */

const TEXT_LIMIT = 80
const NOTES_LIMIT = 200

/** How far outside the canvas an element may sit before it is worth mentioning. */
const EDGE_TOLERANCE = 2

/** Fraction of the smaller element that has to be covered before an overlap is reported. */
const OVERLAP_THRESHOLD = 0.25

/**
 * Types whose overlap is a bug rather than a layout.
 *
 * Text over a rounded rectangle is the most common thing on any slide, and an image behind
 * a caption is the second — flagging those would make the warnings worth ignoring, which
 * is worse than not having them. Two blocks of *content* on top of each other is the case
 * that is almost never deliberate.
 */
const COLLIDABLE = new Set(["text", "table", "chart", "formula"])

export interface OutlineElement {
  id: string
  type: SlideElement["type"]
  /** `[left, top, width, height]`, rounded — the exact values are in `slide_read` */
  at: [number, number, number, number]
  /** what the element says, shortened; absent for elements that say nothing */
  text?: string
}

export interface OutlineSlide {
  id: string
  index: number
  section?: string
  notes?: string
  elements: OutlineElement[]
  /** geometry that looks like a mistake; absent when there is nothing to say */
  warnings?: string[]
}

export interface DeckOutline {
  deckId: string
  title: string
  version: number
  slideCount: number
  /** where a person can watch this deck being written */
  previewUrl: string
  canvas: { width: number; height: number }
  slides: OutlineSlide[]
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * A description of an image that is not the image. Deck images are stored as data URIs, so
 * echoing `src` would put a megabyte of base64 into the model's context — the one thing
 * this whole module exists to avoid.
 */
function describeImage(src: string): string {
  const dataUri = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(src)
  if (dataUri) return `${dataUri[1]}, ${Math.round((dataUri[2].length * 3) / 4 / 1024)}KB`
  return truncate(src, TEXT_LIMIT)
}

function describe(element: SlideElement): string | undefined {
  switch (element.type) {
    case "text":
      return truncate(toPlainText(element.content), TEXT_LIMIT) || undefined
    case "shape":
      return truncate(toPlainText(element.text.content), TEXT_LIMIT) || undefined
    case "table": {
      const header = element.rows[0]?.map((cell) => cell.text).join(" | ") ?? ""
      return truncate(
        `${element.rows.length}×${element.rows[0]?.length ?? 0}${header ? `: ${header}` : ""}`,
        TEXT_LIMIT,
      )
    }
    case "chart":
      return truncate(
        `${element.chartType}: ${element.data.series.map((one) => one.name).join(", ")}`,
        TEXT_LIMIT,
      )
    case "formula":
      return truncate(element.latex, TEXT_LIMIT)
    case "image":
      return describeImage(element.src)
    case "video":
    case "audio":
      return describeImage(element.src)
    case "line":
      return undefined
  }
}

function overlapArea(a: SlideElement, b: SlideElement): number {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return x > 0 && y > 0 ? x * y : 0
}

const label = (element: SlideElement) => element.name || element.id

/**
 * The stand-in for looking at the slide.
 *
 * It cannot tell an agent whether a layout is *good*. It can tell it that something is off
 * the canvas or that two paragraphs are on top of each other, which is the bulk of what
 * goes wrong when you place elements by coordinate without being able to see the result.
 */
function warnings(slide: Slide): string[] {
  const found: string[] = []

  for (const element of slide.elements) {
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

    if (element.type === "text" && !toPlainText(element.content).trim()) {
      found.push(`${label(element)} is an empty text box`)
    }
  }

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

  return found
}

export function outlineSlide(slide: Slide, index: number): OutlineSlide {
  const notes = truncate(slide.notes ?? "", NOTES_LIMIT)
  const found = warnings(slide)

  return {
    id: slide.id,
    index,
    ...(slide.section ? { section: slide.section } : {}),
    ...(notes ? { notes } : {}),
    elements: slide.elements.map((element) => {
      const text = describe(element)
      return {
        id: element.id,
        type: element.type,
        at: [
          round(element.left),
          round(element.top),
          round(element.width),
          round(element.height),
        ] as [number, number, number, number],
        ...(text ? { text } : {}),
      }
    }),
    ...(found.length ? { warnings: found } : {}),
  }
}

export function outlineDeck(
  deckId: string,
  deck: Deck,
  version: number,
  previewUrl: string,
): DeckOutline {
  return {
    deckId,
    title: deck.title,
    version,
    slideCount: deck.slides.length,
    previewUrl,
    canvas: { width: deck.width, height: deck.height },
    slides: deck.slides.map(outlineSlide),
  }
}
