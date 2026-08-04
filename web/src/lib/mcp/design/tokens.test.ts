import { describe, expect, it } from "vitest"
import { VIEWPORT_WIDTH } from "@/lib/constants"
import {
  COLUMN,
  COLUMNS,
  CONTENT_WIDTH,
  MARGIN,
  MIN_READABLE,
  asPoints,
  colLeft,
  contrast,
  contrastFloor,
  estimateHeight,
  estimateLines,
  fitFontSize,
  mix,
  readableOn,
  span,
  track,
} from "./tokens"

describe("the grid", () => {
  it("divides the measure into whole columns", () => {
    expect(COLUMN).toBe(55)
    expect(span(COLUMNS)).toBe(CONTENT_WIDTH)
    expect(colLeft(0)).toBe(MARGIN)
    expect(colLeft(COLUMNS - 1) + COLUMN).toBe(VIEWPORT_WIDTH - MARGIN)
  })

  it("splits into halves, thirds and quarters that add back up", () => {
    for (const count of [2, 3, 4]) {
      expect(span(COLUMNS / count) * count + 20 * (count - 1)).toBeCloseTo(CONTENT_WIDTH)
    }
  })

  it("lays equal cells across a width without drift on the last one", () => {
    const cells = track(3)
    expect(cells[0].width).toBeCloseTo(cells[2].width)
    expect(cells[2].left + cells[2].width).toBeCloseTo(MARGIN + CONTENT_WIDTH)
  })
})

/**
 * The ratio between scripts is the thing that has to be right. The absolute widths are a
 * guess about a font the server does not have; that a line of Chinese runs out of room in
 * about half the characters is true of every font there is.
 */
describe("measuring text", () => {
  it("gives a CJK line about twice the width of a Latin one", () => {
    const latin = estimateLines("abcdefghijklmnopqrst", 100, 20)
    const chinese = estimateLines("一二三四五六七八九十", 100, 20)
    expect(chinese).toBeGreaterThan(latin)
    expect(chinese).toBe(2)
  })

  it("keeps a long word whole rather than breaking mid-word", () => {
    expect(estimateLines("PowerPoint", 1000, 20)).toBe(1)
  })

  it("breaks on explicit newlines whatever the width", () => {
    expect(estimateLines("a\nb\nc", 1000, 20)).toBe(3)
  })

  it("wraps when the box runs out", () => {
    expect(estimateLines("word ".repeat(40), 200, 20)).toBeGreaterThan(3)
  })

  it("costs nothing on an empty string", () => {
    expect(estimateLines("", 200, 20)).toBe(1)
  })
})

describe("fitting type to a box", () => {
  it("keeps the largest size that fits", () => {
    expect(fitFontSize("short", 800, 100, [64, 48, 32])).toBe(64)
  })

  it("steps down rather than overflowing", () => {
    const text = "word ".repeat(14)
    const size = fitFontSize(text, 400, 100, [64, 48, 32, 20])
    expect(size).toBeLessThan(64)
    expect(estimateHeight(text, 400, size, 1.2)).toBeLessThanOrEqual(100)
  })

  it("returns the smallest offered when nothing fits, rather than going below it", () => {
    expect(fitFontSize("x".repeat(4000), 200, 40, [64, 48, 32])).toBe(32)
  })
})

describe("colour", () => {
  it("mixes toward the far end", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000")
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff")
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080")
  })

  it("puts black on white at the top of the scale and a colour on itself at the bottom", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrast("#123456", "#123456")).toBeCloseTo(1, 5)
  })

  it("is symmetric, because a ratio between two colours has no direction", () => {
    expect(contrast("#1d4ed8", "#ffffff")).toBeCloseTo(contrast("#ffffff", "#1d4ed8"), 6)
  })

  it("holds large type to the looser WCAG threshold and body type to the strict one", () => {
    expect(contrastFloor(20)).toBe(4.5)
    expect(contrastFloor(40)).toBe(3)
    expect(contrastFloor(20, true)).toBe(3)
  })

  it("picks the more legible of two inks for a field", () => {
    expect(readableOn("#0a0a0a", ["#ffffff", "#111111"])).toBe("#ffffff")
    expect(readableOn("#fefefe", ["#ffffff", "#111111"])).toBe("#111111")
  })
})

describe("the readable floor", () => {
  it("is 10pt once the canvas is mapped onto a 10-inch slide", () => {
    expect(asPoints(MIN_READABLE)).toBeCloseTo(10.1, 1)
  })
})
