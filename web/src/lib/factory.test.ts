import { describe, expect, it } from "vitest"
import {
  createBlankDeck,
  createDeck,
  createShapeElement,
  createTableElement,
  normalizeDeck,
} from "./factory"
import { SHAPE_MAP } from "./shapes"
import type { Deck, ShapeElement } from "@/types/slides"

const deckWith = (elements: unknown[]): Deck =>
  ({
    version: 1,
    title: "t",
    width: 1000,
    height: 562.5,
    theme: undefined,
    slides: [{ id: "s1", elements, background: { type: "solid", color: "#fff" }, notes: "" }],
  }) as unknown as Deck

describe("normalizeDeck", () => {
  it("recovers shapeKey from a legacy deck that only stored the path", () => {
    const roundRect = SHAPE_MAP.get("roundRect")!
    const deck = normalizeDeck(
      deckWith([
        {
          id: "a",
          type: "shape",
          name: "圆角矩形",
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          rotate: 0,
          path: roundRect.path,
          viewBox: 200,
          fill: "#000",
          text: { content: "" },
        },
      ]),
    )
    expect((deck.slides[0].elements[0] as ShapeElement).shapeKey).toBe("roundRect")
  })

  it("falls back to rect for an unknown path", () => {
    const deck = normalizeDeck(
      deckWith([
        {
          id: "a",
          type: "shape",
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          rotate: 0,
          path: "M 0 0 L 1 1 Z",
          viewBox: 200,
          fill: "#000",
          text: { content: "" },
        },
      ]),
    )
    const shape = deck.slides[0].elements[0] as ShapeElement
    expect(shape.shapeKey).toBe("rect")
    // a custom path is kept for rendering even though the preset falls back
    expect(shape.path).toBe("M 0 0 L 1 1 Z")
  })

  it("scrubs stored rich text on the way in", () => {
    const deck = normalizeDeck(
      deckWith([
        {
          id: "a",
          type: "text",
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          rotate: 0,
          content: '<article><img src=x onerror="alert(1)"></article>',
        },
      ]),
    )
    expect((deck.slides[0].elements[0] as { content: string }).content).toBe("")
  })

  it("normalises rotation and upgrades bare-string links", () => {
    const deck = normalizeDeck(
      deckWith([
        {
          id: "a",
          type: "text",
          left: 0,
          top: 0,
          width: 10,
          height: 10,
          rotate: 450,
          content: "x",
          link: "https://example.com",
        },
      ]),
    )
    const element = deck.slides[0].elements[0]
    expect(element.rotate).toBe(90)
    expect(element.link).toEqual({ type: "web", target: "https://example.com" })
  })

  it("backfills slide fields added after the deck was written", () => {
    const deck = normalizeDeck(deckWith([]))
    expect(deck.slides[0].transition).toBe("none")
    expect(deck.slides[0].animations).toEqual([])
    expect(deck.theme.themeColors.length).toBeGreaterThan(0)
  })

  it("drops animations that point at a missing element", () => {
    const raw = deckWith([])
    raw.slides[0].animations = [{ id: "x" }] as never
    expect(normalizeDeck(raw).slides[0].animations).toEqual([])
  })

  it("substitutes a starter deck when there are no slides", () => {
    const deck = normalizeDeck({ ...deckWith([]), slides: [] })
    expect(deck.slides.length).toBeGreaterThan(0)
  })

  it("leaves a freshly created deck unchanged in shape", () => {
    const deck = normalizeDeck(createDeck())
    expect(deck.slides).toHaveLength(2)
    expect(deck.slides[0].elements.length).toBeGreaterThan(0)
  })

  it("repairs a table whose column widths do not match its columns", () => {
    const table = createTableElement(2, 3)
    const deck = normalizeDeck(deckWith([{ ...table, colWidths: [1] }]))
    const repaired = deck.slides[0].elements[0] as { colWidths: number[] }
    expect(repaired.colWidths).toHaveLength(3)
    expect(repaired.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe("createShapeElement", () => {
  it("carries the preset key so export keeps native geometry", () => {
    expect(createShapeElement("star5").shapeKey).toBe("star5")
    expect(createShapeElement("nonsense").shapeKey).toBe("rect")
  })
})

describe("createTableElement", () => {
  it("builds a rectangular grid with even columns", () => {
    const table = createTableElement(3, 4)
    expect(table.rows).toHaveLength(3)
    expect(table.rows.every((row) => row.length === 4)).toBe(true)
    expect(table.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe("createBlankDeck", () => {
  it("is one empty slide, not the starter deck's sample content", () => {
    const blank = createBlankDeck()
    expect(blank.slides).toHaveLength(1)
    expect(blank.slides[0].elements).toHaveLength(0)
    expect(createDeck().slides.flatMap((s) => s.elements).length).toBeGreaterThan(0)
  })
})
