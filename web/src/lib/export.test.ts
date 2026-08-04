import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { writePptx } from "./export"
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

/**
 * Generates the file and unzips it so assertions can look at the real OOXML. This is the
 * whole of export, patch pass included — half the mapping lives there, so a test that
 * stopped at pptxgenjs would be reading a draft rather than the file a user gets.
 */
async function renderDeck(deck: Deck, slideNumber = 1) {
  const zip = await JSZip.loadAsync(await writePptx(deck))
  const slideXml = await zip.file(`ppt/slides/slide${slideNumber}.xml`)!.async("string")
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

  it("writes a shape's gradient as a real gradient rather than an average colour", async () => {
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
    expect(slideXml).toContain("<a:gradFill")
    expect(slideXml).toContain('<a:gs pos="0"><a:srgbClr val="000000"/></a:gs>')
    expect(slideXml).toContain('<a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs>')
    // the average is what the shape used to export as, and must be gone rather than beside it
    expect(slideXml).not.toContain("808080")
    // 0deg in CSS points straight up, which is three quarters of a turn in OOXML's reckoning
    expect(slideXml).toContain('<a:lin ang="16200000"')
  })

  it("writes a gradient background as a gradient rather than an average colour", async () => {
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
    expect(slideXml).toMatch(/<p:bgPr><a:gradFill/)
    expect(slideXml).not.toContain("808080")
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

  // The stroke is the drawing, so the interior must stay empty. Omitting the fill entirely
  // would let PowerPoint paint a themed block where the sketch should be.
  it("does not fall back to a solid rectangle", async () => {
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [stroke()] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<p:sp>")
    const fill = slideXml.match(/<a:solidFill><a:srgbClr val="FFFFFF">(.*?)<\/a:srgbClr>/)
    expect(fill?.[1]).toContain('<a:alpha val="0"/>')
  })

  it("keeps its contour as editable geometry rather than a picture", async () => {
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [stroke()] })] }
    const { zip, slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<a:custGeom>")
    expect(slideXml).toContain("<a:quadBezTo>")
    expect(slideXml).not.toContain("<a:prstGeom")
    // an open stroke that PowerPoint is allowed to fill closes itself into a blob
    expect(slideXml).toContain('fill="none"')
    expect(zip.file(/ppt\/media\//)).toHaveLength(0)
  })

  it("converts an arc into curves the geometry can carry", async () => {
    const element = stroke()
    element.shapeKey = "custom"
    element.path = "M 0 100 A 100 100 0 0 1 200 100 Z"
    element.fill = "#3366ff"
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [element] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<a:custGeom>")
    expect(slideXml).toContain("<a:cubicBezTo>")
    expect(slideXml).toContain("<a:close/>")
    // a filled shape must not be told to leave its interior alone
    expect(slideXml).not.toContain('fill="none"')
  })

  it("carries the text written inside a custom shape", async () => {
    const element = stroke()
    element.text = { ...element.text, content: "annotation" }
    const deck: Deck = { ...createDeck(), slides: [createSlide({ elements: [element] })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<a:custGeom>")
    expect(slideXml).toContain("annotation")
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

describe("transitions and animations", () => {
  const animated = (animations: Deck["slides"][number]["animations"]) => {
    const element = createShapeElement("rect")
    return {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [element],
          animations: animations?.map((a) => ({ ...a, elId: element.id })),
        }),
      ],
    } satisfies Deck
  }

  it("writes a slide transition", async () => {
    const deck: Deck = { ...createDeck(), slides: [createSlide({ transition: "slideX" })] }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain("<p:transition")
    expect(slideXml).toContain('<p:push dir="l"/>')
    // schema order: the transition follows the colour map override, never precedes it
    expect(slideXml.indexOf("<p:clrMapOvr")).toBeLessThan(slideXml.indexOf("<p:transition"))
  })

  /**
   * OOXML states these as ordered sequences rather than sets, and PowerPoint reads a
   * misplaced child as a damaged file — it opens with a repair prompt and drops the slide.
   * Both places the patch pass inserts into are checked here.
   */
  it("leaves every patched node in the order its schema states", async () => {
    const stroke = freehandElement([
      [10, 10],
      [80, 60],
      [140, 20],
    ])!
    stroke.fill = "#123456"
    stroke.gradient = {
      type: "radial",
      rotate: 0,
      stops: [
        { pos: 0, color: "#123456" },
        { pos: 100, color: "#654321" },
      ],
    }
    const deck: Deck = {
      ...createDeck(),
      slides: [createSlide({ elements: [stroke], transition: "fade" })],
    }
    const { slideXml } = await renderDeck(deck)

    const at = (tag: string) => slideXml.indexOf(tag)
    // p:spPr is xfrm, then geometry, then fill, then line
    expect(at("<a:xfrm")).toBeLessThan(at("<a:custGeom>"))
    expect(at("<a:custGeom>")).toBeLessThan(at("<a:gradFill"))
    // `<a:ln ` with the space, because the path data is full of `<a:lnTo>`
    expect(at("<a:gradFill")).toBeLessThan(at("<a:ln w="))
    // p:sld is cSld, clrMapOvr, transition, timing
    expect(at("</p:cSld>")).toBeLessThan(at("<p:clrMapOvr"))
    expect(at("<p:clrMapOvr")).toBeLessThan(at("<p:transition"))
    expect(slideXml.trimEnd().endsWith("</p:sld>")).toBe(true)
  })

  it("writes nothing for a slide with no transition", async () => {
    const { slideXml } = await renderDeck({ ...createDeck(), slides: [createSlide()] })
    expect(slideXml).not.toContain("<p:transition")
    expect(slideXml).not.toContain("<p:timing")
  })

  it("targets the animated element's own shape id", async () => {
    const deck = animated([
      { id: "a1", elId: "", effect: "fadeIn", type: "in", duration: 600, trigger: "click" },
    ])
    const { slideXml } = await renderDeck(deck)
    const spid = slideXml.match(/<p:cNvPr id="(\d+)" name="Rectangle"/)?.[1]
    expect(spid).toBeTruthy()
    expect(slideXml).toContain("<p:timing>")
    expect(slideXml).toContain(`<p:spTgt spid="${spid}"/>`)
    expect(slideXml).toContain('presetID="10" presetClass="entr"')
    expect(slideXml).toContain('nodeType="clickEffect"')
    expect(slideXml).toContain('dur="600"')
  })

  it("groups a with-previous animation into the click that starts it", async () => {
    const deck = animated([
      { id: "a1", elId: "", effect: "slideInUp", type: "in", duration: 500, trigger: "click" },
      { id: "a2", elId: "", effect: "pulse", type: "attention", duration: 500, trigger: "auto" },
    ])
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).toContain('nodeType="clickEffect"')
    expect(slideXml).toContain('nodeType="withEffect"')
    // one click step, so exactly one node waits for the click
    expect(slideXml.match(/delay="indefinite"/g)).toHaveLength(1)
    // fly in from the bottom edge, which OOXML's compass bitmask calls 4
    expect(slideXml).toContain('presetID="2" presetClass="entr" presetSubtype="4"')
  })

  it("gives every timing node an id of its own", async () => {
    const deck = animated([
      { id: "a1", elId: "", effect: "rotateIn", type: "in", duration: 500, trigger: "click" },
      { id: "a2", elId: "", effect: "shake", type: "attention", duration: 800, trigger: "click" },
    ])
    const { slideXml } = await renderDeck(deck)
    const timing = slideXml.slice(slideXml.indexOf("<p:timing>"))
    const ids = [...timing.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(8)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("drops an animation whose element never reached the slide", async () => {
    const deck: Deck = {
      ...createDeck(),
      slides: [
        createSlide({
          elements: [],
          animations: [
            { id: "a1", elId: "gone", effect: "fadeIn", type: "in", duration: 500, trigger: "click" },
          ],
        }),
      ],
    }
    const { slideXml } = await renderDeck(deck)
    expect(slideXml).not.toContain("<p:timing")
  })
})

describe("tint", () => {
  it("mixes towards white", () => {
    expect(tint("#000000", 0)).toBe("#000000")
    expect(tint("#000000", 1)).toBe("#ffffff")
    expect(tint("#000000", 0.5)).toBe("#808080")
  })
})
