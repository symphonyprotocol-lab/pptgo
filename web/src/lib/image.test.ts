import { describe, expect, it } from "vitest"
import { bakeImage, cropStyle, filterCss, hasFilter, needsBaking } from "./image"
import { createImageElement } from "./factory"

const NEUTRAL = { blur: 0, brightness: 100, contrast: 100, grayscale: 0, saturate: 100, sepia: 0 }
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("filterCss", () => {
  it("emits every channel so a partial filter still resets the rest", () => {
    expect(filterCss({ ...NEUTRAL, grayscale: 50 })).toBe(
      "blur(0px) brightness(100%) contrast(100%) grayscale(50%) saturate(100%) sepia(0%)",
    )
  })
})

describe("hasFilter", () => {
  it("is false for untouched values", () => {
    expect(hasFilter(NEUTRAL)).toBe(false)
  })

  it("is true as soon as one channel moves", () => {
    expect(hasFilter({ ...NEUTRAL, blur: 1 })).toBe(true)
    expect(hasFilter({ ...NEUTRAL, brightness: 99 })).toBe(true)
  })
})

describe("needsBaking", () => {
  const image = (patch: Parameters<typeof createImageElement>[3] = {}) =>
    createImageElement(PNG, 100, 100, patch)

  it("leaves a plain image alone", () => {
    expect(needsBaking(image())).toBe(false)
  })

  it("flags filters, tinting and rounded corners", () => {
    expect(needsBaking(image({ filter: { ...NEUTRAL, sepia: 30 } }))).toBe(true)
    expect(needsBaking(image({ colorMask: "#ff0000" }))).toBe(true)
    expect(needsBaking(image({ radius: 12 }))).toBe(true)
  })

  it("ignores things OOXML can already express", () => {
    expect(needsBaking(image({ flipH: true, opacity: 0.5 }))).toBe(false)
  })
})

describe("bakeImage", () => {
  it("returns the source untouched when there is nothing to bake", async () => {
    const element = createImageElement(PNG, 100, 100)
    await expect(bakeImage(element)).resolves.toBe(PNG)
  })

  // jsdom has no canvas backend; the exporter must degrade to the original bitmap
  // rather than throwing in the middle of a download.
  it("falls back to the source when canvas is unavailable", async () => {
    const element = createImageElement(PNG, 100, 100, { filter: { ...NEUTRAL, grayscale: 100 } })
    await expect(bakeImage(element)).resolves.toBe(PNG)
  })

  it("falls back when the source cannot be decoded", async () => {
    const element = createImageElement("data:image/png;base64,not-a-png", 100, 100, {
      colorMask: "#ff0000",
    })
    await expect(bakeImage(element)).resolves.toBe("data:image/png;base64,not-a-png")
  })
})

describe("cropStyle", () => {
  it("leaves an uncropped image filling its frame", () => {
    expect(cropStyle(undefined)).toMatchObject({
      width: "100%",
      height: "100%",
      left: "0%",
      top: "0%",
    })
  })

  it("blows the source up by the inverse of the visible fraction and shifts it into view", () => {
    // the left 25% of the source, from a quarter of the way down
    const style = cropStyle({ range: [[0, 0.25], [0.25, 1]] })
    expect(style.width).toBe("400%")
    expect(style.height).toBe(`${100 / 0.75}%`)
    expect(style.left).toBe("0%")
    expect(style.top).toBe(`${(-0.25 / 0.75) * 100}%`)
  })

  it("opts out of the stylesheet's image cap so the blow-up survives", () => {
    // `max-width: 100%` from the reset would clamp the width above back to the frame,
    // cancelling the crop and squeezing the whole bitmap into it instead
    const style = cropStyle({ range: [[0, 0], [0.3, 1]] })
    expect(style.maxWidth).toBe("none")
    expect(style.maxHeight).toBe("none")
  })

  it("refuses a degenerate range instead of dividing by zero", () => {
    const style = cropStyle({ range: [[0.5, 0.5], [0.5, 0.5]] })
    expect(style.width).toBe("10000%")
    expect(Number.isFinite(parseFloat(String(style.left)))).toBe(true)
  })
})
