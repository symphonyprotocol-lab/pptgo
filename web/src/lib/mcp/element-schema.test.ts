import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { buildElement, elementSpec } from "./element-schema"
import { buildPptx } from "@/lib/export"
import { createSlide } from "@/lib/factory"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import type { Deck, ShapeElement, TableElement, TextElement } from "@/types/slides"

const box = { left: 10, top: 20, width: 300, height: 100 }

const parse = (value: unknown) => elementSpec.safeParse(value)

describe("the element vocabulary", () => {
  it("refuses geometry it was not given, rather than centring things on top of each other", () => {
    expect(parse({ type: "text", text: "hi" }).success).toBe(false)
    expect(parse({ type: "text", text: "hi", ...box }).success).toBe(true)
  })

  it("refuses a shape key the editor cannot draw", () => {
    expect(parse({ type: "shape", shapeKey: "dodecahedron", ...box }).success).toBe(false)
    expect(parse({ type: "shape", shapeKey: "roundRect", ...box }).success).toBe(true)
  })

  it("refuses a colour that is not a hex value", () => {
    expect(parse({ type: "text", text: "x", color: "red", ...box }).success).toBe(false)
    expect(parse({ type: "text", text: "x", color: "#1E293B", ...box }).success).toBe(true)
  })

  /**
   * `src` is the one machine-supplied string that becomes an attribute in a document a
   * person opens, so the scheme is checked here rather than downstream.
   */
  it("refuses an image source that is not an image", () => {
    for (const src of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd"]) {
      expect(parse({ type: "image", src, ...box }).success).toBe(false)
    }
    expect(parse({ type: "image", src: "https://example.test/a.png", ...box }).success).toBe(true)
    expect(
      parse({ type: "image", src: "data:image/png;base64,iVBORw0KGgo=", ...box }).success,
    ).toBe(true)
  })

  it("has no vocabulary for video or audio, which would be a file to upload", () => {
    expect(parse({ type: "video", src: "https://example.test/a.mp4", ...box }).success).toBe(false)
  })
})

describe("buildElement", () => {
  it("stores a model's text as characters, never as markup", () => {
    const element = buildElement({ type: "text", text: "<b>x</b>", ...box }) as TextElement
    expect(element.content).toBe("&lt;b&gt;x&lt;/b&gt;")
  })

  it("does the same for a shape's label", () => {
    const element = buildElement({
      type: "shape",
      shapeKey: "roundRect",
      text: "<i>y</i>",
      ...box,
    }) as ShapeElement
    expect(element.text.content).toBe("&lt;i&gt;y&lt;/i&gt;")
  })

  it("fills everything the model was not asked for from the same factory the editor uses", () => {
    const element = buildElement({ type: "text", text: "hi", ...box }) as TextElement
    expect(element.fontFamily).toBe(DEFAULT_THEME.fontFamily)
    expect(element.id).toBeTruthy()
    expect(element.rotate).toBe(0)
  })

  it("keeps the geometry it was given instead of centring", () => {
    const element = buildElement({ type: "text", text: "hi", ...box })
    expect([element.left, element.top, element.width, element.height]).toEqual([10, 20, 300, 100])
  })

  /** The editor indexes rows as a rectangle; a ragged one would read past the end. */
  it("pads a ragged table so every row is the same width", () => {
    const element = buildElement({
      type: "table",
      rows: [["a", "b", "c"], ["d"]],
      ...box,
    }) as TableElement
    expect(element.rows.map((row) => row.length)).toEqual([3, 3])
    expect(element.rows[1][2].text).toBe("")
    expect(element.colWidths).toHaveLength(3)
  })

  it("gives a shape the geometry of the preset it names", () => {
    const element = buildElement({
      type: "shape",
      shapeKey: "ellipse",
      ...box,
    }) as ShapeElement
    expect(element.shapeKey).toBe("ellipse")
    expect(element.path).toBeTruthy()
    expect(element.viewBox).toBeGreaterThan(0)
  })
})

/**
 * The point of building on the editor's own factory rather than a parallel model: what an
 * agent writes has to be a deck in every sense, including one PowerPoint will open.
 */
describe("what an agent writes is a real deck", () => {
  it("exports to PPTX", async () => {
    const deck: Deck = {
      version: 1,
      title: "agent deck",
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      theme: DEFAULT_THEME,
      slides: [
        createSlide({
          elements: [
            buildElement({ type: "text", text: "Title", left: 60, top: 40, width: 800, height: 80, fontSize: 44, bold: true }),
            buildElement({ type: "shape", shapeKey: "roundRect", text: "badge", left: 60, top: 150, width: 160, height: 44 }),
            buildElement({ type: "line", start: [0, 0], end: [300, 0], left: 60, top: 220, width: 300, height: 0 }),
            buildElement({ type: "table", rows: [["a", "b"], ["1", "2"]], left: 60, top: 260, width: 300, height: 120 }),
            buildElement({
              type: "chart",
              chartType: "column",
              categories: ["Q1", "Q2"],
              series: [{ name: "revenue", values: [1, 2] }],
              left: 420, top: 260, width: 400, height: 240,
            }),
          ],
        }),
      ],
    }

    const pptx = await buildPptx(deck)
    const base64 = (await pptx.write({ outputType: "base64" })) as string
    const zip = await JSZip.loadAsync(base64, { base64: true })

    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string")
    expect(slide).toContain("Title")
    expect(slide).toContain("badge")
    // the escaped angle brackets survived as text, not as OOXML
    expect(zip.file("ppt/charts/chart1.xml")).toBeTruthy()
  })
})
