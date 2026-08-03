import { describe, expect, it } from "vitest"
import { FREEHAND_KEY, freehandElement, strokePreviewPath } from "./freehand"
import { normalizeDeck, createDeck, createSlide } from "./factory"
import type { Deck, ShapeElement } from "@/types/slides"

describe("freehandElement", () => {
  it("needs at least two points", () => {
    expect(freehandElement([])).toBeNull()
    expect(freehandElement([[10, 10]])).toBeNull()
  })

  it("wraps the stroke in a padded box", () => {
    const element = freehandElement([
      [100, 100],
      [200, 150],
    ])!
    expect(element.type).toBe("shape")
    expect(element.left).toBeLessThan(100)
    expect(element.top).toBeLessThan(100)
    expect(element.width).toBeGreaterThan(100)
    expect(element.height).toBeGreaterThan(50)
  })

  // an element that kept `rect` would export as a rectangle instead of the drawn line
  it("keeps its own shape key rather than falling back to rect", () => {
    const element = freehandElement([
      [0, 0],
      [10, 10],
    ])!
    expect(element.shapeKey).toBe(FREEHAND_KEY)
  })

  it("draws in the element's own coordinate space, not the canvas's", () => {
    const element = freehandElement([
      [500, 400],
      [600, 500],
    ])!
    const numbers = element.path.match(/-?\d+(\.\d+)?/g)!.map(Number)
    // every coordinate has to sit inside the viewBox for the shape to scale correctly
    expect(Math.max(...numbers)).toBeLessThanOrEqual(element.viewBox)
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0)
  })

  it("survives a perfectly straight stroke with no height", () => {
    const element = freehandElement([
      [0, 50],
      [100, 50],
    ])!
    expect(element.height).toBeGreaterThan(0)
    expect(Number.isFinite(element.width)).toBe(true)
    expect(element.path).not.toContain("NaN")
  })

  it("smooths a long stroke through curve segments", () => {
    const points: [number, number][] = Array.from({ length: 10 }, (_, i) => [i * 10, i * 5])
    expect(freehandElement(points)!.path).toContain("Q")
  })

  it("draws a two-point stroke as a straight line", () => {
    expect(
      strokePreviewPath([
        [0, 0],
        [10, 10],
      ]),
    ).toBe("M 0 0 L 10 10")
  })

  it("has no preview for a stroke that has not moved", () => {
    expect(strokePreviewPath([[1, 1]])).toBe("")
  })
})

describe("normalizeDeck with freehand shapes", () => {
  it("keeps a custom key and path across a reload", () => {
    const stroke = freehandElement([
      [0, 0],
      [50, 60],
    ])!
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [stroke] })] }
    const restored = normalizeDeck(JSON.parse(JSON.stringify(deck)) as Deck)
    const shape = restored.slides[0].elements[0] as ShapeElement

    expect(shape.shapeKey).toBe(FREEHAND_KEY)
    expect(shape.path).toBe(stroke.path)
  })
})
