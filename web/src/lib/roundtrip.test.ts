import { describe, expect, it } from "vitest"
import { writePptx } from "./export"
import { importPptx } from "./import-pptx"
import { normalizeDeck } from "./factory"
import { SINGLE_LINE } from "./constants"
import {
  createChartElement,
  createDeck,
  createShapeElement,
  createSlide,
  createTableElement,
  createTextElement,
} from "./factory"
import { htmlToPlainText } from "./sanitize"
import type { ChartElement, Deck, ShapeElement, TableElement } from "@/types/slides"

/** Export to a real .pptx, then read it back through the importer. */
async function roundTrip(deck: Deck): Promise<Deck> {
  // writePptx, not buildPptx: the East Asian faces are restored while the archive is
  // written, so testing the builder alone would miss them entirely
  const buffer = await writePptx(deck)
  return normalizeDeck(await importPptx(new File([buffer], "round.pptx")))
}

describe("pptx round trip", () => {
  it("keeps the slide count and the text of the starter deck", async () => {
    const source = createDeck()
    const result = await roundTrip(source)

    expect(result.slides).toHaveLength(source.slides.length)
    const text = result.slides
      .flatMap((slide) => slide.elements)
      .map((el) =>
        el.type === "text"
          ? htmlToPlainText(el.content)
          : el.type === "shape"
            ? htmlToPlainText(el.text.content)
            : "",
      )
      .join(" ")
    expect(text).toContain("PPTGo 在线演示文稿")
    expect(text).toContain("形状也能写字")
  })

  it("keeps a shape's preset geometry and fill", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createShapeElement("ellipse", {
              left: 100,
              top: 50,
              width: 300,
              height: 200,
              fill: "#ff0000",
            }),
          ],
        }),
      ],
    }
    const shape = (await roundTrip(deck)).slides[0].elements[0] as ShapeElement
    expect(shape.type).toBe("shape")
    expect(shape.shapeKey).toBe("ellipse")
    expect(shape.fill?.toUpperCase()).toBe("#FF0000")
  })

  it("keeps geometry within a unit of where it started", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [createShapeElement("rect", { left: 120, top: 80, width: 300, height: 150 })],
        }),
      ],
    }
    const shape = (await roundTrip(deck)).slides[0].elements[0]
    expect(shape.left).toBeCloseTo(120, 0)
    expect(shape.top).toBeCloseTo(80, 0)
    expect(shape.width).toBeCloseTo(300, 0)
    expect(shape.height).toBeCloseTo(150, 0)
  })

  it("keeps partial bold through the whole trip", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({ elements: [createTextElement({ content: "plain <b>bold</b> tail" })] }),
      ],
    }
    const element = (await roundTrip(deck)).slides[0].elements[0]
    expect(element.type).toBe("text")
    if (element.type === "text") {
      expect(htmlToPlainText(element.content)).toBe("plain bold tail")
      // the bold run survives as inline markup rather than being flattened
      expect(element.content).toMatch(/font-weight:700|<b>/)
    }
  })

  it("keeps table text and shape", async () => {
    const table = createTableElement(2, 3)
    table.rows[1][0].text = "cell"
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [table] })] }
    const result = (await roundTrip(deck)).slides[0].elements[0] as TableElement
    expect(result.type).toBe("table")
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toHaveLength(3)
    expect(result.rows.flat().map((c) => c.text)).toContain("cell")
  })

  it("keeps chart series and categories", async () => {
    const chart = createChartElement({
      chartType: "column",
      data: {
        categories: ["甲", "乙", "丙"],
        series: [
          { name: "一组", values: [1, 2, 3] },
          { name: "二组", values: [4, 5, 6] },
        ],
      },
    })
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [chart] })] }
    const result = (await roundTrip(deck)).slides[0].elements[0] as ChartElement

    expect(result.type).toBe("chart")
    expect(result.chartType).toBe("column")
    expect(result.data.categories).toEqual(["甲", "乙", "丙"])
    expect(result.data.series.map((s) => s.name)).toEqual(["一组", "二组"])
    expect(result.data.series[1].values).toEqual([4, 5, 6])
  })

  it("keeps a horizontal bar chart horizontal", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [createChartElement({ chartType: "bar" })] })],
    }
    expect((await roundTrip(deck)).slides[0].elements[0]).toMatchObject({ chartType: "bar" })
  })

  it("keeps a pie chart's single series", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createChartElement({
              chartType: "pie",
              data: { categories: ["a", "b"], series: [{ name: "s", values: [30, 70] }] },
            }),
          ],
        }),
      ],
    }
    const result = (await roundTrip(deck)).slides[0].elements[0] as ChartElement
    expect(result.chartType).toBe("pie")
    expect(result.data.series[0].values).toEqual([30, 70])
  })

  it("keeps speaker notes", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ notes: "两行\n备注" })],
    }
    expect((await roundTrip(deck)).slides[0].notes).toContain("备注")
  })

  it("keeps line spacing across the trip instead of loosening it each time", async () => {
    // PowerPoint counts line spacing in multiples of its own single spacing, the editor
    // counts it in multiples of the type size, and the two differ by SINGLE_LINE. Convert
    // in only one direction and every export/import cycle inflates the deck by 20%.
    const deck = createDeck()
    deck.slides = [
      {
        ...createSlide(),
        elements: [
          createTextElement({ content: "单倍行距", lineHeight: SINGLE_LINE }),
          createTextElement({ content: "一点五倍", lineHeight: 1.8, top: 200 }),
        ],
      },
    ]

    const once = await roundTrip(deck)
    const twice = await roundTrip(once)

    const spacing = (d: Deck) =>
      d.slides[0].elements.filter((el) => el.type === "text").map((el) => el.lineHeight)

    expect(spacing(once)[0]).toBeCloseTo(SINGLE_LINE, 2)
    expect(spacing(once)[1]).toBeCloseTo(1.8, 2)
    // the second trip is the one that catches a one-way conversion
    expect(spacing(twice)).toEqual(spacing(once).map((v) => expect.closeTo(v, 2)))
  })

  it("carries East Asian faces back out instead of flattening them to the Latin one", async () => {
    // pptxgenjs writes one typeface into a:latin, a:ea and a:cs alike, so without the
    // rewrite a Chinese deck loses its Chinese font the first time it is exported
    const deck = createDeck()
    deck.slides = [
      {
        ...createSlide(),
        elements: [
          createTextElement({
            content: "标题 Heading",
            fontFamily: "'Arial Black', SimHei, sans-serif",
          }),
          createTextElement({
            content: "正文 Body",
            fontFamily: "'Times New Roman', SimSun, sans-serif",
            top: 200,
          }),
        ],
      },
    ]

    const result = await roundTrip(deck)
    const stacks = result.slides[0].elements
      .filter((el) => el.type === "text")
      .map((el) => el.fontFamily)

    expect(stacks.some((s) => /SimHei/.test(s))).toBe(true)
    expect(stacks.some((s) => /SimSun/.test(s))).toBe(true)
    // and the Latin halves survive alongside them
    expect(stacks.some((s) => /Arial Black/.test(s))).toBe(true)
    expect(stacks.some((s) => /Times New Roman/.test(s))).toBe(true)
  })
})
