import { describe, expect, it } from "vitest"
import { outlineDeck, outlineSlide } from "./outline"
import { buildElement } from "./element-schema"
import { createSlide } from "@/lib/factory"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import type { Deck, Slide, SlideElement } from "@/types/slides"

const slideOf = (elements: SlideElement[], partial: Partial<Slide> = {}) =>
  createSlide({ elements, ...partial })

const text = (partial: { left: number; top: number; width: number; height: number; text?: string }) =>
  buildElement({ type: "text", text: partial.text ?? "hello", ...partial })

const deckOf = (slides: Slide[]): Deck => ({
  version: 1,
  title: "deck",
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  theme: DEFAULT_THEME,
  slides,
})

describe("what the outline says", () => {
  it("reads a text element back as text, not as stored markup", () => {
    const outline = outlineSlide(slideOf([text({ left: 0, top: 0, width: 100, height: 40, text: "a & b" })]), 0)
    expect(outline.elements[0].text).toBe("a & b")
  })

  it("shortens long text instead of spending the model's context on it", () => {
    const long = "x".repeat(500)
    const outline = outlineSlide(slideOf([text({ left: 0, top: 0, width: 100, height: 40, text: long })]), 0)
    expect(outline.elements[0].text!.length).toBeLessThan(100)
    expect(outline.elements[0].text!.endsWith("…")).toBe(true)
  })

  /**
   * The single most important thing this module does not do. Deck images are data URIs,
   * so echoing `src` would put megabytes of base64 into the conversation.
   */
  it("describes an image rather than reproducing it", () => {
    const src = `data:image/png;base64,${"A".repeat(40_000)}`
    const outline = outlineSlide(
      slideOf([buildElement({ type: "image", src, left: 0, top: 0, width: 100, height: 100 })]),
      0,
    )
    expect(outline.elements[0].text).toBe("image/png, 29KB")
    expect(JSON.stringify(outline).length).toBeLessThan(500)
  })

  it("summarises a table by its shape and header", () => {
    const outline = outlineSlide(
      slideOf([
        buildElement({
          type: "table",
          rows: [["metric", "value"], ["users", "10"]],
          left: 0, top: 0, width: 300, height: 100,
        }),
      ]),
      0,
    )
    expect(outline.elements[0].text).toBe("2×2: metric | value")
  })

  it("keeps the section and notes, which are what a slide is for", () => {
    const outline = outlineSlide(
      slideOf([], { section: "intro", notes: "say hello" }),
      3,
    )
    expect(outline).toMatchObject({ index: 3, section: "intro", notes: "say hello" })
  })
})

/**
 * The stand-in for looking at the slide. It cannot say whether a layout is good; it can
 * say that something is off the page or that two paragraphs are stacked, which is most of
 * what goes wrong when you place elements by coordinate with no way to see the result.
 */
describe("geometry warnings", () => {
  it("says nothing about a slide that is laid out sensibly", () => {
    const outline = outlineSlide(
      slideOf([
        text({ left: 60, top: 60, width: 400, height: 60 }),
        text({ left: 60, top: 160, width: 400, height: 60, text: "second" }),
      ]),
      0,
    )
    expect(outline.warnings).toBeUndefined()
  })

  it("reports content parked inside the margin, but not content run to the edge", () => {
    const crowded = outlineSlide(slideOf([text({ left: 18, top: 200, width: 400, height: 60 })]), 0)
    expect(crowded.warnings?.some((one) => one.includes("margin"))).toBe(true)

    const bleeding = outlineSlide(slideOf([text({ left: 0, top: 200, width: 400, height: 60 })]), 0)
    expect(bleeding.warnings).toBeUndefined()
  })

  it("reports an element that runs off the canvas", () => {
    const outline = outlineSlide(
      slideOf([text({ left: 900, top: 40, width: 400, height: 60 })]),
      0,
    )
    expect(outline.warnings?.[0]).toContain("outside")
  })

  it("reports two blocks of text on top of each other", () => {
    const outline = outlineSlide(
      slideOf([
        text({ left: 60, top: 40, width: 400, height: 100 }),
        text({ left: 70, top: 50, width: 400, height: 100, text: "on top" }),
      ]),
      0,
    )
    expect(outline.warnings?.some((one) => one.includes("overlap"))).toBe(true)
  })

  /**
   * Text on a rounded rectangle is the most common thing on any slide. Flagging it would
   * make the warnings worth ignoring, which is worse than not having them.
   */
  it("says nothing about text sitting on a shape, which is a layout rather than a bug", () => {
    const outline = outlineSlide(
      slideOf([
        buildElement({ type: "shape", shapeKey: "roundRect", left: 60, top: 60, width: 400, height: 120 }),
        // white on the shape's own blue: the contrast check reads the plate underneath, so
        // the deck's dark default ink would legitimately be reported here
        buildElement({
          type: "text",
          text: "hello",
          color: "#ffffff",
          left: 80,
          top: 80,
          width: 360,
          height: 80,
        }),
      ]),
      0,
    )
    expect(outline.warnings).toBeUndefined()
  })

  it("reports an empty text box, which renders as nothing at all", () => {
    const outline = outlineSlide(
      slideOf([text({ left: 60, top: 40, width: 400, height: 60, text: "   " })]),
      0,
    )
    expect(outline.warnings?.some((one) => one.includes("empty"))).toBe(true)
  })
})

describe("outlineDeck", () => {
  it("carries the version and the link a person watches", () => {
    const outline = outlineDeck("d1", deckOf([slideOf([])]), 7, "https://pptgo.test/preview/d1")
    expect(outline).toMatchObject({
      deckId: "d1",
      version: 7,
      slideCount: 1,
      previewUrl: "https://pptgo.test/preview/d1",
      canvas: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    })
  })
})
