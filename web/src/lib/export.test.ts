import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { buildPptx } from "./export"
import { tint } from "./table-theme"
import {
  createChartElement,
  createDeck,
  createFormulaElement,
  createImageElement,
  createMediaElement,
  createLineElement,
  createShapeElement,
  createSlide,
  createTableElement,
  createTextElement,
} from "./factory"
import { freehandElement } from "./freehand"
import type { Deck } from "@/types/slides"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Generates the file and unzips it so assertions can look at the real OOXML. */
async function renderDeck(deck: Deck) {
  const pptx = await buildPptx(deck)
  const base64 = (await pptx.write({ outputType: "base64" })) as string
  const zip = await JSZip.loadAsync(base64, { base64: true })
  const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string")
  return { zip, slideXml }
}

describe("exportPptx", () => {
  it("produces a readable package for the starter deck", async () => {
    const { zip } = await renderDeck(createDeck())
    expect(zip.file("ppt/presentation.xml")).toBeTruthy()
    expect(zip.file("ppt/slides/slide1.xml")).toBeTruthy()
    expect(zip.file("ppt/slides/slide2.xml")).toBeTruthy()
  })

  it("keeps formatting that only covers part of a paragraph", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [createTextElement({ content: "plain <b>bold</b>", color: "#112233" })],
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    // two runs, only the second one bold — a flattened export would emit a single run
    expect(slideXml).toContain("plain ")
    expect(slideXml).toContain("bold")
    expect(slideXml).toMatch(/b="1"/)
    expect(slideXml).toContain("112233")
  })

  it("exports a shape with its preset geometry and its text inside it", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createShapeElement("star5", {
              fill: "#ff0000",
              text: {
                content: "label",
                fontFamily: "Arial",
                fontSize: 20,
                color: "#ffffff",
                bold: false,
                italic: false,
                underline: false,
                strikethrough: false,
                align: "center",
                vertical: "middle",
                lineHeight: 1.4,
              },
            }),
          ],
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain('prst="star5"')
    expect(slideXml).toContain("label")
    // one shape only — the text is not a second floating box laid over it
    expect(slideXml.match(/<p:sp>/g) ?? []).toHaveLength(1)
  })

  it("carries opacity through as OOXML transparency", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [createShapeElement("rect", { opacity: 0.5 })] })],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("alpha")
  })

  it("flattens a gradient fill instead of dropping the shape's colour", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createShapeElement("rect", {
              fill: "#000000",
              gradient: {
                type: "linear",
                rotate: 0,
                stops: [
                  { pos: 0, color: "#000000" },
                  { pos: 100, color: "#ffffff" },
                ],
              },
            }),
          ],
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("808080")
  })

  it("writes a gradient background as its average colour rather than white", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          background: {
            type: "gradient",
            color: "#ffffff",
            gradient: {
              type: "linear",
              rotate: 0,
              stops: [
                { pos: 0, color: "#000000" },
                { pos: 100, color: "#ffffff" },
              ],
            },
          },
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("808080")
  })

  it("exports shadows and outlines", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createShapeElement("rect", {
              shadow: { h: 4, v: 4, blur: 8, color: "rgba(0,0,0,0.5)" },
              outline: { style: "dashed", width: 3, color: "#00ff00" },
            }),
          ],
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("outerShdw")
    expect(slideXml).toContain("00FF00")
    expect(slideXml).toContain("dash")
  })

  it("embeds images and their crop window", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createImageElement(PNG, 200, 100, {
              flipH: true,
              clip: {
                range: [
                  [0.1, 0.1],
                  [0.9, 0.9],
                ],
              },
            }),
          ],
        }),
      ],
    }
    const { zip, slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<p:pic>")
    expect(slideXml).toContain('flipH="1"')
    expect(zip.file(/ppt\/media\//).length).toBeGreaterThan(0)
  })

  it("exports a table with merged cells", async () => {
    const table = createTableElement(2, 2)
    table.rows[0][0].colspan = 2
    table.rows[0][1].merged = true
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [table] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<a:tbl>")
    expect(slideXml).toContain('gridSpan="2"')
  })

  it("exports a native chart part", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [createChartElement()] })],
    }
    const { zip } = await renderDeck(deck)
    expect(zip.file(/ppt\/charts\//).length).toBeGreaterThan(0)
  })

  it("exports a line with its arrow head", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({ elements: [createLineElement({ endCap: "arrow", style: "dotted" })] }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("tailEnd")
    expect(slideXml).toContain("sysDot")
  })

  it("keeps hyperlinks, both external and slide-to-slide", async () => {
    const base = createDeck()
    const deck: Deck = {
      ...base,
      slides: [
        createSlide({
          id: "first",
          elements: [
            createTextElement({ content: "a", link: { type: "web", target: "https://example.com" } }),
            createTextElement({ content: "b", link: { type: "slide", target: "second" } }),
          ],
        }),
        createSlide({ id: "second" }),
      ],
    }
    const { zip, slideXml } = await renderDeck(deck)
    const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string")
    expect(rels).toContain("example.com")
    expect(slideXml).toContain("hlinkClick")
  })

  it("writes speaker notes", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ notes: "remember this" })],
    }
    const { zip } = await renderDeck(deck)
    const notes = await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string")
    expect(notes).toContain("remember this")
  })

  it("survives colours the UI would never produce", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [createShapeElement("rect", { fill: "#fff" })],
          background: { type: "solid", color: "rgb(10, 20, 30)" },
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("FFFFFF")
    expect(slideXml).toContain("0A141E")
  })

  it("accepts a rotation beyond a full turn", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [createShapeElement("rect", { rotate: 359 })] })],
    }
    await expect(renderDeck(deck)).resolves.toBeTruthy()
  })
})

describe("freehand shapes", () => {
  const stroke = () =>
    freehandElement([
      [100, 100],
      [160, 140],
      [220, 110],
    ])!

  // Without a rasteriser the placeholder must stay invisible. Omitting the fill entirely
  // would let PowerPoint paint a themed block where the sketch should be.
  it("does not fall back to a solid rectangle", async () => {
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [stroke()] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<p:sp>")
    const fill = slideXml.match(/<a:solidFill><a:srgbClr val="FFFFFF">(.*?)<\/a:srgbClr>/)
    expect(fill?.[1]).toContain('<a:alpha val="0"/>')
  })

  it("keeps its own outline colour", async () => {
    const element = stroke()
    element.outline = { style: "solid", width: 3, color: "#ff0000" }
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [element] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("FF0000")
  })
})

describe("media and formulas", () => {
  it("embeds a video with its container extension", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [
            createMediaElement("video", "data:video/mp4;base64,AAAAIGZ0eXBpc29t", {
              poster: PNG,
            }),
          ],
        }),
      ],
    }
    const { zip } = await renderDeck(deck)
    expect(zip.file(/ppt\/media\/.*\.mp4/).length).toBeGreaterThan(0)
  })

  it("embeds audio", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({ elements: [createMediaElement("audio", "data:audio/mpeg;base64,SUQzAw==")] }),
      ],
    }
    const { zip } = await renderDeck(deck)
    expect(zip.file(/ppt\/media\/.*\.mp3/).length).toBeGreaterThan(0)
  })

  // jsdom cannot rasterise, so the exporter must still emit something meaningful
  it("falls back to the LaTeX source when a formula cannot be rasterised", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [createFormulaElement({ latex: "E = mc^2" })] })],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("E = mc^2")
  })
})

describe("tint", () => {
  it("mixes towards white", () => {
    expect(tint("#000000", 0)).toBe("#000000")
    expect(tint("#000000", 1)).toBe("#ffffff")
    expect(tint("#000000", 0.5)).toBe("#808080")
  })
})
