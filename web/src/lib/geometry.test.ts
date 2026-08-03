import { describe, expect, it } from "vitest"
import {
  distribute,
  marqueeHits,
  normalizeRotate,
  resizeBox,
  rotateWithin,
  rotatedBounds,
  scaleWithin,
  unionBounds,
} from "./geometry"
import { createShapeElement } from "./factory"
import type { SlideElement } from "@/types/slides"

const box = (
  left: number,
  top: number,
  width: number,
  height: number,
  rotate = 0,
): SlideElement => createShapeElement("rect", { left, top, width, height, rotate })

describe("normalizeRotate", () => {
  // pptxgenjs documents a -360..360 range, and rotation used to accumulate without bound
  it("folds any angle into [0, 360)", () => {
    expect(normalizeRotate(0)).toBe(0)
    expect(normalizeRotate(370)).toBe(10)
    expect(normalizeRotate(-90)).toBe(270)
    expect(normalizeRotate(1080)).toBe(0)
  })
})

describe("resizeBox", () => {
  it("pins the opposite corner when dragging south-east", () => {
    const next = resizeBox({ left: 10, top: 10, width: 100, height: 50, rotate: 0 }, "se", 20, 10)
    expect(next).toEqual({ left: 10, top: 10, width: 120, height: 60 })
  })

  it("moves the origin when dragging north-west", () => {
    const next = resizeBox({ left: 10, top: 10, width: 100, height: 50, rotate: 0 }, "nw", 20, 10)
    expect(next.left).toBeCloseTo(30)
    expect(next.top).toBeCloseTo(20)
    expect(next.width).toBeCloseTo(80)
    expect(next.height).toBeCloseTo(40)
  })

  it("keeps a rotated element's anchor corner in place", () => {
    const origin = { left: 0, top: 0, width: 100, height: 100, rotate: 90 }
    const next = resizeBox(origin, "se", 0, 20)
    // dragging along screen-Y maps onto the element's own -X after a 90° turn
    expect(next.width).toBeCloseTo(120)
    expect(next.height).toBeCloseTo(100)
  })

  it("never shrinks below the minimum size", () => {
    const next = resizeBox({ left: 0, top: 0, width: 20, height: 20, rotate: 0 }, "se", -500, -500)
    expect(next.width).toBe(10)
    expect(next.height).toBe(10)
  })
})

describe("rotatedBounds", () => {
  it("returns the plain box when unrotated", () => {
    expect(rotatedBounds(box(10, 20, 100, 50))).toEqual({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    })
  })

  // Selection and alignment used to use the unrotated box, which is visibly wrong once
  // an element is turned.
  it("grows to cover a rotated element", () => {
    const bounds = rotatedBounds(box(0, 0, 100, 50, 90))
    expect(bounds.width).toBeCloseTo(50)
    expect(bounds.height).toBeCloseTo(100)
    expect(bounds.left).toBeCloseTo(25)
    expect(bounds.top).toBeCloseTo(-25)
  })
})

describe("marqueeHits", () => {
  it("judges a rotated element by the space it actually occupies", () => {
    const element = box(0, 0, 200, 10, 90)
    // the rotated strip runs vertically through x≈100, y from -95 to 105
    expect(marqueeHits({ left: 80, top: -110, width: 40, height: 240 }, element)).toBe(true)
    // the upright box (0,0,200,10) would fit here, the rotated strip does not
    expect(marqueeHits({ left: -10, top: -10, width: 220, height: 40 }, element)).toBe(false)
  })

  it("requires the element to be fully enclosed, not merely touched", () => {
    const element = box(100, 100, 100, 100)
    expect(marqueeHits({ left: 90, top: 90, width: 120, height: 120 }, element)).toBe(true)
    // clips the right edge — PowerPoint would not select this, and neither do we
    expect(marqueeHits({ left: 90, top: 90, width: 60, height: 120 }, element)).toBe(false)
    expect(marqueeHits({ left: 300, top: 300, width: 30, height: 30 }, element)).toBe(false)
  })
})

describe("unionBounds", () => {
  it("covers every element", () => {
    expect(unionBounds([box(0, 0, 50, 50), box(100, 20, 50, 30)])).toEqual({
      left: 0,
      top: 0,
      width: 150,
      height: 50,
    })
  })

  it("is null for an empty selection", () => {
    expect(unionBounds([])).toBeNull()
  })
})

describe("scaleWithin", () => {
  it("maps an element through a change of its group's bounds", () => {
    const from = { left: 0, top: 0, width: 100, height: 100 }
    const to = { left: 0, top: 0, width: 200, height: 100 }
    const next = scaleWithin(box(50, 0, 50, 50), from, to)
    expect(next.width).toBeCloseTo(100)
    expect(next.height).toBeCloseTo(50)
    expect(next.left).toBeCloseTo(100)
  })

  it("is a no-op when the bounds do not change", () => {
    const bounds = { left: 10, top: 10, width: 100, height: 100 }
    const next = scaleWithin(box(20, 30, 40, 50), bounds, bounds)
    expect(next).toMatchObject({ left: 20, top: 30, width: 40, height: 50 })
  })
})

describe("rotateWithin", () => {
  it("orbits the element around the group centre and turns it too", () => {
    // centre (110, 10) rotates to (-10, 110); left/top back off by half the size
    const next = rotateWithin(box(100, 0, 20, 20), [0, 0], 90)
    expect(next.rotate).toBe(90)
    expect(next.left).toBeCloseTo(-20)
    expect(next.top).toBeCloseTo(100)
  })
})

describe("distribute", () => {
  it("spreads the middle elements evenly and leaves the outer ones alone", () => {
    const elements = [box(0, 0, 20, 10), box(30, 0, 20, 10), box(180, 0, 20, 10)]
    const patches = distribute(elements, "h")
    expect(patches[0].patch.left).toBeCloseTo(0)
    expect(patches[1].patch.left).toBeCloseTo(90)
    expect(patches[2].patch.left).toBeCloseTo(180)
  })

  it("needs at least three elements", () => {
    expect(distribute([box(0, 0, 10, 10), box(50, 0, 10, 10)], "h")).toEqual([])
  })
})
