import { describe, expect, it } from "vitest"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { createSlide } from "@/lib/factory"
import { buildElement } from "../element-schema"
import { lintSlide } from "../lint"
import { LAYOUT_CATALOGUE, layoutSpec, renderLayout, type LayoutId, type LayoutSpec } from "./layouts"
import { CHINESE, ENGLISH } from "./layouts.fixtures"
import { THEME_PRESET_IDS, presetTheme, resolveTheme } from "./themes"
import { MARGIN } from "./tokens"
import type { Slide } from "@/types/slides"

const slideOf = (spec: LayoutSpec, presetId: string): Slide => {
  const theme = presetTheme(presetId)!
  const built = renderLayout(spec, resolveTheme(theme))
  return createSlide({
    elements: built.elements.map(buildElement),
    background: { ...built.background, imageSize: "cover" },
  })
}

const cases = THEME_PRESET_IDS.flatMap((preset) =>
  (Object.keys(ENGLISH) as LayoutId[]).flatMap((layout) => [
    [preset, layout, "en", ENGLISH[layout]] as const,
    [preset, layout, "zh", CHINESE[layout]] as const,
  ]),
)

describe("the slot contracts", () => {
  it("covers every page type in the catalogue, and nothing that is not one", () => {
    expect(LAYOUT_CATALOGUE.map((one) => one.layout).sort()).toEqual(
      (Object.keys(ENGLISH) as LayoutId[]).sort(),
    )
  })

  it.each(Object.entries(ENGLISH))("accepts the %s fixture as written", (_id, spec) => {
    expect(layoutSpec.safeParse(spec).success).toBe(true)
  })

  it("refuses a bullet slide with seven points, rather than setting them smaller", () => {
    const result = layoutSpec.safeParse({
      layout: "bullets",
      title: "Too much",
      points: Array.from({ length: 7 }, (_, i) => `point ${i}`),
    })
    expect(result.success).toBe(false)
  })

  it("refuses a matrix that is not four quadrants", () => {
    expect(
      layoutSpec.safeParse({
        layout: "matrix",
        title: "Three",
        axes: { x: "a", y: "b" },
        quadrants: [{ heading: "one" }, { heading: "two" }, { heading: "three" }],
      }).success,
    ).toBe(false)
  })
})

/**
 * The test that earns the whole package.
 *
 * Every page type, in every theme, in both scripts, has to come out clean under the same
 * lint an agent's hand-placed slide is held to. If a layout cannot pass the check the tool
 * applies to everyone else's work, it has no business being the recommended path.
 */
describe("every layout in every theme", () => {
  it.each(cases)("%s / %s / %s lays out with nothing to report", (preset, _layout, _lang, spec) => {
    const slide = slideOf(spec, preset)
    expect(lintSlide(slide, presetTheme(preset))).toEqual([])
  })

  it.each(cases)("%s / %s / %s stays on the canvas", (preset, _layout, _lang, spec) => {
    for (const element of slideOf(spec, preset).elements) {
      expect(element.left).toBeGreaterThanOrEqual(0)
      expect(element.top).toBeGreaterThanOrEqual(0)
      expect(element.left + element.width).toBeLessThanOrEqual(VIEWPORT_WIDTH)
      expect(element.top + element.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT)
    }
  })

  it.each(cases)("%s / %s / %s names its elements so they can be patched", (preset, _l, _lang, spec) => {
    for (const element of slideOf(spec, preset).elements) {
      expect(element.name).not.toBe("")
    }
  })

  /**
   * `roundRect` is one path stretched to whatever box it lands in, so its corner is a
   * proportion of each side rather than a length. On a plate much wider than it is tall,
   * that corner sweeps most of the way across the top and the shape reads as a lozenge.
   * No layout may ask for one at a size where it does not survive.
   */
  it.each(cases)("%s / %s / %s never rounds a plate too flat to carry it", (preset, _l, _lang, spec) => {
    for (const element of slideOf(spec, preset).elements) {
      if (element.type !== "shape" || element.shapeKey !== "roundRect") continue
      const ratio = Math.min(element.width, element.height) / Math.max(element.width, element.height)
      expect(ratio, `${element.name} is ${element.width}×${element.height}`).toBeGreaterThanOrEqual(
        1 / 3,
      )
    }
  })
})

/**
 * Fitting is the part that has to hold when the content is not the length the layout was
 * drawn for. A title twice as long does not get to run off the page.
 */
describe("content the layout was not drawn for", () => {
  it("steps a long cover title down rather than overflowing", () => {
    const long = slideOf(
      {
        layout: "cover",
        title: "Rebuilding onboarding for the enterprise tier across every region we operate in, including the ones we have not launched yet",
        subtitle: "A subtitle that also runs on rather longer than anyone would like it to",
        meta: "Platform team",
      },
      "corporate",
    )
    expect(lintSlide(long, presetTheme("corporate"))).toEqual([])
  })

  it("holds six long Chinese bullets on one page without going under the readable floor", () => {
    const slide = slideOf(
      {
        layout: "bullets",
        title: "六条都很长的要点",
        points: Array.from(
          { length: 6 },
          (_, i) => `第 ${i + 1} 条：这一条写得相当长，长到足以在一行里放不下，需要折行之后再继续说完整件事情。`,
        ),
      },
      "ink",
    )
    expect(lintSlide(slide, presetTheme("ink"))).toEqual([])
    for (const element of slide.elements) {
      if (element.type === "text") expect(element.fontSize).toBeGreaterThanOrEqual(14)
    }
  })

  it("keeps a two-word statement centred rather than stretching it", () => {
    const slide = slideOf({ layout: "statement", text: "We shipped." }, "swiss")
    expect(lintSlide(slide, presetTheme("swiss"))).toEqual([])
  })
})

describe("what a layout leaves behind", () => {
  it("gives the slide a background that belongs to the theme", () => {
    const theme = resolveTheme(presetTheme("dark-tech")!)
    const built = renderLayout(ENGLISH.bullets, theme)
    expect(built.background).toEqual({ type: "solid", color: theme.colors.background })
  })

  it("rounds coordinates instead of storing the arithmetic that produced them", () => {
    for (const element of renderLayout(ENGLISH.cards, resolveTheme(presetTheme("swiss")!)).elements) {
      expect(element.left * 10).toBeCloseTo(Math.round(element.left * 10), 6)
      expect(element.top * 10).toBeCloseTo(Math.round(element.top * 10), 6)
    }
  })

  it("runs full-bleed pieces to the edge and keeps everything else on the grid", () => {
    const slide = slideOf(ENGLISH["image-full"], "editorial")
    const image = slide.elements.find((one) => one.type === "image")!
    expect(image.left).toBe(0)
    expect(image.width).toBe(VIEWPORT_WIDTH)

    const caption = slide.elements.find((one) => one.name === "title")!
    expect(caption.left).toBe(MARGIN)
  })
})

/**
 * The catalogue is read once per deck, into a context the slides then have to fit in too.
 * If it grows to the size of the thing it is describing, it stops being worth reading.
 */
describe("what the catalogue costs to read", () => {
  it("describes every page type in a few thousand characters", () => {
    const json = JSON.stringify(LAYOUT_CATALOGUE)
    expect(json.length).toBeLessThan(4_000)
    for (const one of LAYOUT_CATALOGUE) {
      expect(one.slots.length).toBeGreaterThan(3)
      expect(one.use.length).toBeGreaterThan(20)
    }
  })
})
