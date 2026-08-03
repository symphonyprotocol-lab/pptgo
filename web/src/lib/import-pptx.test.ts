import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { importPptx } from "./import-pptx"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import type {
  ChartElement,
  ImageElement,
  ShapeElement,
  TableElement,
  TextElement,
} from "@/types/slides"

const EMU_PER_INCH = 914400
/** 16:9 at 13.333in x 7.5in, the modern PowerPoint default. */
const SLIDE_CX = 12192000
const SLIDE_CY = 6858000

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

const xfrm = (x: number, y: number, cx: number, cy: number, extra = "") =>
  `<a:xfrm ${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`

function slideDoc(body: string, bg = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld ${NS}><p:cSld>${bg}<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr/>${body}</p:spTree></p:cSld></p:sld>`
}

/** Assembles the minimum set of parts the importer reads. */
async function buildPptx(
  slides: string[],
  extras: {
    rels?: string
    media?: Record<string, string>
    notes?: string
    /** extra package parts, keyed by path */
    parts?: Record<string, string>
  } = {},
) {
  const zip = new JSZip()

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
      .join("")}</p:sldIdLst><p:sldSz cx="${SLIDE_CX}" cy="${SLIDE_CY}"/></p:presentation>`,
  )
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  )

  slides.forEach((xml, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, xml))
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${extras.rels ?? ""}</Relationships>`,
  )
  if (extras.notes) zip.file("ppt/notesSlides/notesSlide1.xml", extras.notes)
  for (const [path, body] of Object.entries(extras.parts ?? {})) zip.file(path, body)
  for (const [name, base64] of Object.entries(extras.media ?? {})) {
    zip.file(`ppt/media/${name}`, base64, { base64: true })
  }

  const blob = await zip.generateAsync({ type: "arraybuffer" })
  return new File([blob], "deck.pptx")
}

const chartFrame = () =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="c"/></p:nvGraphicFramePr>
   <p:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="3000000"/></p:xfrm>
   <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
   <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId7"/>
   </a:graphicData></a:graphic></p:graphicFrame>`

/** A chart part with two series over two categories. */
function chartExtras({
  tag = "c:barChart",
  barDir = "col",
  categories = true,
}: { tag?: string; barDir?: string; categories?: boolean } = {}) {
  const cat = categories
    ? `<c:cat><c:strRef><c:strCache>
       <c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt>
       </c:strCache></c:strRef></c:cat>`
    : ""
  const ser = (name: string, a: number, b: number) =>
    `<c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx>
     ${cat}<c:val><c:numRef><c:numCache>
     <c:pt idx="0"><c:v>${a}</c:v></c:pt><c:pt idx="1"><c:v>${b}</c:v></c:pt>
     </c:numCache></c:numRef></c:val></c:ser>`

  return {
    rels: `<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>`,
    parts: {
      "ppt/charts/chart1.xml": `<?xml version="1.0"?>
        <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea>
        <${tag}>${tag === "c:barChart" ? `<c:barDir val="${barDir}"/>` : ""}
        ${ser("收入", 10, 20)}${ser("成本", 4, 8)}</${tag}>
        </c:plotArea><c:legend/></c:chart></c:chartSpace>`,
    },
  }
}

/** A slide → layout → master → theme chain carrying one accent colour. */
function themeExtras(accent1: string) {
  const relsFor = (id: string, type: string, target: string) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
     <Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`

  return {
    rels: `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    parts: {
      "ppt/slideLayouts/slideLayout1.xml": "<x/>",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relsFor(
        "rId1",
        "slideMaster",
        "../slideMasters/slideMaster1.xml",
      ),
      "ppt/slideMasters/slideMaster1.xml": "<x/>",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsFor(
        "rId1",
        "theme",
        "../theme/theme1.xml",
      ),
      "ppt/theme/theme1.xml": `<?xml version="1.0"?><a:theme ${NS}><a:themeElements><a:clrScheme name="x">
        <a:accent1><a:srgbClr val="${accent1.replace("#", "")}"/></a:accent1>
        <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
        </a:clrScheme></a:themeElements></a:theme>`,
    },
  }
}

describe("importPptx", () => {
  it("rejects something that is not a pptx", async () => {
    const zip = new JSZip()
    zip.file("hello.txt", "nope")
    const blob = await zip.generateAsync({ type: "arraybuffer" })
    await expect(importPptx(new File([blob], "x.pptx"))).rejects.toThrow()
  })

  it("reads slides in presentation order and names the deck after the file", async () => {
    const file = await buildPptx([slideDoc(""), slideDoc("")])
    const deck = await importPptx(file)
    expect(deck.slides).toHaveLength(2)
    expect(deck.title).toBe("deck")
  })

  it("converts EMU geometry into canvas units", async () => {
    // one inch in, one inch down, two inches wide
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(EMU_PER_INCH, EMU_PER_INCH, EMU_PER_INCH * 2, EMU_PER_INCH)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r><a:t>hi</a:t></a:r></a:p></p:txBody></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const element = deck.slides[0].elements[0]

    // the slide is 13.333in wide and maps onto 1000 units, so 1in ≈ 75 units
    const perInch = (VIEWPORT_WIDTH / SLIDE_CX) * EMU_PER_INCH
    expect(element.left).toBeCloseTo(perInch, 1)
    expect(element.width).toBeCloseTo(perInch * 2, 1)
    expect(element.left).toBeGreaterThan(0)
    expect(element.top).toBeLessThan(VIEWPORT_HEIGHT)
  })

  it("treats a filled preset shape as a shape and keeps its geometry", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 914400, 914400)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
      <a:ln w="19050"><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:prstDash val="dash"/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:t>label</a:t></a:r></a:p></p:txBody></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const shape = deck.slides[0].elements[0] as ShapeElement
    expect(shape.type).toBe("shape")
    expect(shape.shapeKey).toBe("ellipse")
    expect(shape.fill).toBe("#FF0000")
    expect(shape.outline).toMatchObject({ style: "dashed", color: "#00FF00" })
    expect(shape.text.content).toContain("label")
    expect(shape.text.vertical).toBe("middle")
  })

  it("maps an unknown preset onto a rectangle rather than dropping the shape", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 914400, 914400)}<a:prstGeom prst="somethingExotic"/>
      <a:solidFill><a:srgbClr val="123456"/></a:solidFill></p:spPr></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    expect((deck.slides[0].elements[0] as ShapeElement).shapeKey).toBe("rect")
  })

  it("keeps per-run bold and colour as inline markup", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 4000000, 500000)}</p:spPr>
      <p:txBody><a:bodyPr/><a:p>
        <a:r><a:rPr sz="1800"/><a:t>plain </a:t></a:r>
        <a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>red</a:t></a:r>
      </a:p></p:txBody></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const text = deck.slides[0].elements[0] as TextElement
    expect(text.type).toBe("text")
    expect(text.content).toContain("plain ")
    expect(text.content).toMatch(/font-weight:700/)
    expect(text.content).toContain("#FF0000")
  })

  it("resolves theme colours", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100000, 100000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    expect((deck.slides[0].elements[0] as ShapeElement).fill).toBe("#4472c4")
  })

  it("keeps a fill's alpha", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100000, 100000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:srgbClr val="FF0000"><a:alpha val="50000"/></a:srgbClr></a:solidFill></p:spPr></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    expect((deck.slides[0].elements[0] as ShapeElement).fill).toBe("rgba(255, 0, 0, 0.5)")
  })

  it("inlines an embedded image and its crop", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const body = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId9"/><a:srcRect l="10000" t="0" r="20000" b="0"/></p:blipFill>
      <p:spPr>${xfrm(0, 0, 914400, 914400)}</p:spPr></p:pic>`
    const deck = await importPptx(
      await buildPptx([slideDoc(body)], {
        rels: `<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>`,
        media: { "image1.png": png },
      }),
    )
    const image = deck.slides[0].elements[0] as ImageElement
    expect(image.type).toBe("image")
    expect(image.src.startsWith("data:image/png;base64,")).toBe(true)
    expect(image.clip?.range[0][0]).toBeCloseTo(0.1)
    expect(image.clip?.range[1][0]).toBeCloseTo(0.8)
  })

  it("flattens groups while keeping children in slide coordinates", async () => {
    // group sits at 1in and its children live in a 0-based child space of the same size
    const child = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 914400, 914400)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`
    const body = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="${EMU_PER_INCH}" y="0"/><a:ext cx="914400" cy="914400"/>
      <a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm></p:grpSpPr>${child}</p:grpSp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const element = deck.slides[0].elements[0]
    const perInch = (VIEWPORT_WIDTH / SLIDE_CX) * EMU_PER_INCH
    expect(element.left).toBeCloseTo(perInch, 1)
    expect(element.groupId).toBeTruthy()
  })

  it("reads a solid background", async () => {
    const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill></p:bgPr></p:bg>`
    const deck = await importPptx(await buildPptx([slideDoc("", bg)]))
    expect(deck.slides[0].background).toMatchObject({ type: "solid", color: "#102030" })
  })

  it("reads a gradient background", async () => {
    const bg = `<p:bg><p:bgPr><a:gradFill><a:gsLst>
      <a:gs pos="0"><a:srgbClr val="000000"/></a:gs>
      <a:gs pos="100000"><a:srgbClr val="FFFFFF"/></a:gs>
      </a:gsLst><a:lin ang="5400000"/></a:gradFill></p:bgPr></p:bg>`
    const deck = await importPptx(await buildPptx([slideDoc("", bg)]))
    expect(deck.slides[0].background.type).toBe("gradient")
    expect(deck.slides[0].background.gradient?.stops).toHaveLength(2)
    expect(deck.slides[0].background.gradient?.rotate).toBe(90)
  })

  it("imports a table with its column widths", async () => {
    const body = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="t"/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="1000000"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>
      <a:tblGrid><a:gridCol w="3000000"/><a:gridCol w="1000000"/></a:tblGrid>
      <a:tr h="500000"><a:tc><a:txBody><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody></a:tc>
      <a:tc><a:txBody><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const table = deck.slides[0].elements[0] as TableElement
    expect(table.type).toBe("table")
    expect(table.rows[0].map((c) => c.text)).toEqual(["A", "B"])
    expect(table.colWidths[0]).toBeCloseTo(0.75)
  })

  it("places a chart frame even when the chart part is missing", async () => {
    const body = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="c"/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="3000000"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic>
      </p:graphicFrame>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    expect(deck.slides[0].elements[0].type).toBe("chart")
  })

  it("reads chart series and categories out of the chart part", async () => {
    const deck = await importPptx(await buildPptx([slideDoc(chartFrame())], chartExtras()))
    const chart = deck.slides[0].elements[0] as ChartElement
    expect(chart.type).toBe("chart")
    expect(chart.chartType).toBe("column")
    expect(chart.data.categories).toEqual(["Q1", "Q2"])
    expect(chart.data.series).toHaveLength(2)
    expect(chart.data.series[0]).toEqual({ name: "收入", values: [10, 20] })
    expect(chart.data.series[1]).toEqual({ name: "成本", values: [4, 8] })
    expect(chart.showLegend).toBe(true)
  })

  it("distinguishes a horizontal bar chart by its barDir", async () => {
    const deck = await importPptx(
      await buildPptx([slideDoc(chartFrame())], chartExtras({ barDir: "bar" })),
    )
    expect((deck.slides[0].elements[0] as ChartElement).chartType).toBe("bar")
  })

  it("recognises pie, line and radar chart parts", async () => {
    for (const [tag, expected] of [
      ["c:pieChart", "pie"],
      ["c:lineChart", "line"],
      ["c:radarChart", "radar"],
    ] as const) {
      const deck = await importPptx(
        await buildPptx([slideDoc(chartFrame())], chartExtras({ tag })),
      )
      expect((deck.slides[0].elements[0] as ChartElement).chartType).toBe(expected)
    }
  })

  it("invents category labels when the chart part has none", async () => {
    const deck = await importPptx(
      await buildPptx([slideDoc(chartFrame())], chartExtras({ categories: false })),
    )
    const chart = deck.slides[0].elements[0] as ChartElement
    expect(chart.data.categories).toHaveLength(2)
    expect(chart.data.series[0].values).toEqual([10, 20])
  })

  it("resolves scheme colours from the deck's own theme, not the stock palette", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100000, 100000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)], themeExtras("#123456")))
    expect((deck.slides[0].elements[0] as ShapeElement).fill).toBe("#123456")
  })

  it("falls back to the stock palette when the theme omits a slot", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100000, 100000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:schemeClr val="accent6"/></a:solidFill></p:spPr></p:sp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)], themeExtras("#123456")))
    expect((deck.slides[0].elements[0] as ShapeElement).fill).toBe("#70ad47")
  })

  it("imports a connector as a line, honouring its flips", async () => {
    const body = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2" name="l"/></p:nvCxnSpPr>
      <p:spPr>${xfrm(0, 0, 914400, 457200, 'flipH="1"')}<a:prstGeom prst="line"/>
      <a:ln w="12700"><a:solidFill><a:srgbClr val="112233"/></a:solidFill>
      <a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`
    const deck = await importPptx(await buildPptx([slideDoc(body)]))
    const line = deck.slides[0].elements[0]
    expect(line.type).toBe("line")
    if (line.type === "line") {
      expect(line.color).toBe("#112233")
      expect(line.endCap).toBe("arrow")
      // flipH means the line runs right-to-left inside its box
      expect(line.start[0]).toBeGreaterThan(line.end[0])
    }
  })

  it("reads speaker notes", async () => {
    const notes = `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>say this</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld></p:notes>`
    const deck = await importPptx(
      await buildPptx([slideDoc("")], {
        rels: `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>`,
        notes,
      }),
    )
    expect(deck.slides[0].notes).toBe("say this")
  })

  it("only keeps hyperlinks with a safe scheme", async () => {
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s">
      <a:hlinkClick r:id="rId5"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 100000, 100000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`
    const safe = await importPptx(
      await buildPptx([slideDoc(body)], {
        rels: `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>`,
      }),
    )
    expect(safe.slides[0].elements[0].link).toEqual({ type: "web", target: "https://example.com" })

    const unsafe = await importPptx(
      await buildPptx([slideDoc(body)], {
        rels: `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>`,
      }),
    )
    expect(unsafe.slides[0].elements[0].link).toBeUndefined()
  })

  it("centres a 4:3 deck inside the 16:9 canvas instead of stretching it", async () => {
    const zip = new JSZip()
    zip.file(
      "ppt/presentation.xml",
      `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
       <p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    )
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
       <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    )
    const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>${xfrm(0, 0, 9144000, 6858000)}<a:prstGeom prst="rect"/>
      <a:solidFill><a:srgbClr val="000000"/></a:solidFill></p:spPr></p:sp>`
    zip.file("ppt/slides/slide1.xml", slideDoc(body))
    const blob = await zip.generateAsync({ type: "arraybuffer" })

    const deck = await importPptx(new File([blob], "four-three.pptx"))
    const element = deck.slides[0].elements[0]
    expect(element.height).toBeCloseTo(VIEWPORT_HEIGHT, 0)
    expect(element.width).toBeLessThan(VIEWPORT_WIDTH)
    expect(element.left).toBeGreaterThan(0) // letterboxed, not stretched
  })
})

describe("hostile input", () => {
  /**
   * `idx` is attacker-controlled and used to be written straight into a sparse array, so
   * a single attribute made the next `Array.from` allocate a billion slots — a crashed tab
   * from a file the reader only meant to open.
   */
  it("clamps a chart point index instead of allocating for it", async () => {
    const huge = `<?xml version="1.0"?>
      <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea>
      <c:barChart><c:barDir val="col"/><c:ser>
      <c:val><c:numRef><c:numCache>
      <c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="999999999"><c:v>2</c:v></c:pt>
      </c:numCache></c:numRef></c:val></c:ser></c:barChart>
      </c:plotArea></c:chart></c:chartSpace>`

    const file = await buildPptx([slideDoc(chartFrame())], {
      rels: `<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>`,
      parts: { "ppt/charts/chart1.xml": huge },
    })

    const deck = await importPptx(file)
    const chart = deck.slides[0].elements[0] as ChartElement
    expect(chart.type).toBe("chart")
    expect(chart.data.series[0].values.length).toBeLessThanOrEqual(4096)
  })

  it("rejects an archive past the size ceiling before unzipping it", async () => {
    const file = await buildPptx([slideDoc("")], {})
    // the check is on `File.size`, so a stub is enough to exercise it without 100MB of heap
    Object.defineProperty(file, "size", { value: 200 * 1024 * 1024 })
    await expect(importPptx(file)).rejects.toThrow(/limit/i)
  })

  it("skips media a browser cannot render rather than importing broken pictures", async () => {
    const body = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId9"/><a:stretch/></p:blipFill>
      <p:spPr>${xfrm(0, 0, 914400, 914400)}</p:spPr></p:pic>`

    const file = await buildPptx([slideDoc(body)], {
      rels: `<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.emf"/>`,
      media: { "image1.emf": "AAAA" },
    })

    const deck = await importPptx(file)
    expect(deck.slides[0].elements).toHaveLength(0)
  })

  it("treats a nonsense span as a span of one", async () => {
    const cell = (extra: string) =>
      `<a:tc ${extra}><a:txBody><a:p><a:r><a:t>x</a:t></a:r></a:p></a:txBody></a:tc>`
    const body = `<p:graphicFrame><p:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></p:xfrm>
      <a:graphic><a:graphicData><a:tbl>
      <a:tblGrid><a:gridCol w="100"/><a:gridCol w="100"/></a:tblGrid>
      <a:tr>${cell('gridSpan="oops"')}${cell('rowSpan="-3"')}</a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

    const deck = await importPptx(await buildPptx([slideDoc(body)], {}))
    const table = deck.slides[0].elements[0] as TableElement
    for (const row of table.rows) {
      for (const c of row) {
        expect(Number.isInteger(c.colspan)).toBe(true)
        expect(c.colspan).toBeGreaterThanOrEqual(1)
        expect(c.rowspan).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
