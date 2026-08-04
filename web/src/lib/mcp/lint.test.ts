import { describe, expect, it } from "vitest"
import { createSlide } from "@/lib/factory"
import { buildElement, type ElementSpec } from "./element-schema"
import { lintSlide } from "./lint"
import { presetTheme } from "./design/themes"
import type { Slide } from "@/types/slides"

const slideOf = (specs: ElementSpec[], background = "#ffffff"): Slide =>
  createSlide({
    elements: specs.map(buildElement),
    background: { type: "solid", color: background, imageSize: "cover" },
  })

const text = (partial: Partial<Extract<ElementSpec, { type: "text" }>> = {}): ElementSpec => ({
  type: "text",
  name: "body",
  text: "hello",
  left: 60,
  top: 200,
  width: 400,
  height: 60,
  fontSize: 20,
  color: "#111827",
  ...partial,
})

const said = (warnings: string[], fragment: string) =>
  warnings.some((one) => one.includes(fragment))

describe("type that cannot be read", () => {
  it("reports anything under the floor, in the points a PowerPoint user would see", () => {
    const warnings = lintSlide(slideOf([text({ fontSize: 9 })]))
    expect(said(warnings, "below 14")).toBe(true)
    expect(said(warnings, "pt")).toBe(true)
  })

  it("says nothing at the floor itself", () => {
    expect(lintSlide(slideOf([text({ fontSize: 14 })]))).toEqual([])
  })
})

/**
 * The check that exists because nothing else can catch it. An agent picks a box height
 * from nothing, and text that does not fit renders spilling out of it — visible to anyone
 * looking at the slide, invisible in every description of it.
 */
describe("text that does not fit its box", () => {
  it("reports a paragraph in the space of a line", () => {
    const warnings = lintSlide(
      slideOf([text({ text: "word ".repeat(60), width: 300, height: 30 })]),
    )
    expect(said(warnings, "lines of type")).toBe(true)
  })

  it("counts a Chinese line as twice a Latin one", () => {
    const box = { width: 300, height: 40, fontSize: 20 }
    expect(lintSlide(slideOf([text({ ...box, text: "abcdefghijklmnopqrstuvwxyz" })]))).toEqual([])
    expect(
      said(lintSlide(slideOf([text({ ...box, text: "一二三四五六七八九十一二三四五六七八九十" })])), "lines of type"),
    ).toBe(true)
  })

  it("leaves a shape's label alone, because a label that wraps once is not a bug", () => {
    const warnings = lintSlide(
      slideOf([
        {
          type: "shape",
          name: "plate",
          shapeKey: "roundRect",
          left: 60,
          top: 200,
          width: 120,
          height: 40,
          fill: "#1d4ed8",
          text: "a rather long label for this box",
          textColor: "#ffffff",
          fontSize: 20,
        },
      ]),
    )
    expect(said(warnings, "lines of type")).toBe(false)
  })
})

describe("colour nobody could read", () => {
  it("reports body type that does not clear 4.5:1 on the page", () => {
    const warnings = lintSlide(slideOf([text({ color: "#8a8a8a" })]))
    expect(said(warnings, "under the 4.5:1")).toBe(true)
  })

  /**
   * Large type is held to 3:1, which is the actual WCAG rule. Applying the body threshold
   * to a cover title would condemn pairings that are perfectly legible at that size, and a
   * check that fires on good slides is a check people stop reading.
   */
  it("lets the same colour through at display size", () => {
    expect(lintSlide(slideOf([text({ color: "#8a8a8a", fontSize: 64, height: 90 })]))).toEqual([])
  })

  /**
   * The field is the plate underneath, not the page. Without this, white-on-blue over a
   * colour block reads as white-on-white and is reported as unreadable.
   */
  it("reads the plate a text box sits on rather than the slide behind it", () => {
    const onBlock: ElementSpec[] = [
      {
        type: "shape",
        name: "block",
        shapeKey: "rect",
        left: 0,
        top: 0,
        width: 300,
        height: 562.5,
        fill: "#1d4ed8",
      },
      text({ name: "label", left: 60, top: 240, width: 200, color: "#ffffff" }),
    ]
    expect(lintSlide(slideOf(onBlock))).toEqual([])

    const dark = [...onBlock]
    dark[1] = text({ name: "label", left: 60, top: 240, width: 200, color: "#1e3a8a" })
    expect(said(lintSlide(slideOf(dark)), "under the")).toBe(true)
  })

  it("says nothing about text over an image, where the field is unknowable", () => {
    const warnings = lintSlide(
      slideOf([
        {
          type: "image",
          name: "photo",
          src: "https://example.test/a.jpg",
          left: 0,
          top: 0,
          width: 1000,
          height: 562.5,
        },
        text({ color: "#ffffff" }),
      ]),
    )
    expect(said(warnings, "under the")).toBe(false)
  })
})

describe("colour outside the theme", () => {
  const theme = presetTheme("corporate")!

  it("reports a chromatic colour the deck never chose", () => {
    const warnings = lintSlide(slideOf([text({ color: "#d946ef" })]), theme)
    expect(said(warnings, "outside the deck theme")).toBe(true)
  })

  it("says nothing about the theme's own derived greys, which are not stored anywhere", () => {
    const resolved = presetTheme("corporate")!
    for (const color of [resolved.fontColor, ...resolved.themeColors]) {
      expect(said(lintSlide(slideOf([text({ color })]), theme), "outside the deck theme")).toBe(false)
    }
  })

  it("ignores a near-neutral, because a derived grey is not a colour someone picked", () => {
    const warnings = lintSlide(slideOf([text({ color: "#5b6168" })]), theme)
    expect(said(warnings, "outside the deck theme")).toBe(false)
  })
})

describe("edges that almost line up", () => {
  it("reports a three-unit miss", () => {
    const warnings = lintSlide(
      slideOf([
        text({ name: "a", left: 60, top: 200 }),
        text({ name: "b", left: 63, top: 300 }),
      ]),
    )
    expect(said(warnings, "almost line up")).toBe(true)
  })

  it("says nothing when they actually line up", () => {
    expect(
      lintSlide(
        slideOf([text({ name: "a", left: 60, top: 200 }), text({ name: "b", left: 60, top: 300 })]),
      ),
    ).toEqual([])
  })

  it("says nothing about a deliberate offset", () => {
    const warnings = lintSlide(
      slideOf([
        text({ name: "a", left: 60, top: 200 }),
        text({ name: "b", left: 140, top: 300 }),
      ]),
    )
    expect(said(warnings, "almost line up")).toBe(false)
  })

  it("leaves full-bleed edges out, because they belong to the page rather than the grid", () => {
    const warnings = lintSlide(
      slideOf([
        {
          type: "image",
          name: "photo",
          src: "https://example.test/a.jpg",
          left: 0,
          top: 0,
          width: 1000,
          height: 400,
        },
        text({ name: "caption", left: 4, top: 450 }),
      ]),
    )
    expect(said(warnings, "almost line up")).toBe(false)
  })
})

describe("how much it is willing to say", () => {
  it("stops at a list someone will still read, and admits it stopped", () => {
    const bad = Array.from({ length: 20 }, (_, i) =>
      text({ name: `x${i}`, left: 20, top: 10 + i, fontSize: 6, color: "#f5f5f5" }),
    )
    const warnings = lintSlide(slideOf(bad))
    expect(warnings.length).toBeLessThanOrEqual(13)
    expect(warnings.at(-1)).toContain("more")
  })
})
