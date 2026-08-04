import { lintSlide } from "./lint"
import { toPlainText, truncate } from "./text"
import type { Deck, DeckTheme, Slide, SlideElement } from "@/types/slides"

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

/**
 * The stand-in for looking at the slide.
 *
 * The theme is optional because `outlineSlide` is also the summary of a single slide, and
 * the checks that need it — contrast against the page, colours outside the palette — are
 * additions to a list that stands up without them rather than the point of it.
 */
export function outlineSlide(slide: Slide, index: number, theme?: DeckTheme): OutlineSlide {
  const notes = truncate(slide.notes ?? "", NOTES_LIMIT)
  const found = lintSlide(slide, theme)

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
    slides: deck.slides.map((slide, index) => outlineSlide(slide, index, deck.theme)),
  }
}
