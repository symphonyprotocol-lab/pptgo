import { describe, expect, it } from "vitest"
import { bakeImage, filterCss, hasFilter, needsBaking } from "./image"
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
