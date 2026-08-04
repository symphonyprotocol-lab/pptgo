import type PptxGenJS from "pptxgenjs"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { singleLineFactor } from "./line-metrics"
import { alphaOf, flattenGradient, inch, pt, toHex, transparency } from "./color"
import { formulaToPng } from "./formula"
import { bakeImage } from "./image"
import { svgToPng } from "./raster"
import { htmlToRuns, primaryFont, type RunDefaults } from "./rich-text"
import { exportMarker, patchPptx, xmlAttr } from "./pptx-patch"
import { shapeGeometryXml } from "./ooxml-geometry"
import { elementLabel } from "./element-label"
import { cellBackground, cellTextColor, isHeaderRow } from "./table-theme"
import { fallbackTranslate, type Translate } from "./i18n/translate"
import { SHAPE_MAP } from "./shapes"
import type {
  ChartElement,
  Deck,
  FormulaElement,
  ImageElement,
  LineElement,
  MediaElement,
  Outline,
  Shadow,
  ShapeElement,
  Slide,
  SlideElement,
  TableElement,
  TextElement,
} from "@/types/slides"

type Pptx = InstanceType<typeof import("pptxgenjs").default>
type PptxSlide = ReturnType<Pptx["addSlide"]>
type ShadowProps = NonNullable<PptxGenJS.TextPropsOptions["shadow"]>
type LineProps = NonNullable<PptxGenJS.TextPropsOptions["line"]>

export function downloadDeckJson(deck: Deck) {
  const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" })
  triggerDownload(blob, `${deck.title || "deck"}.pptgo.json`)
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  // give the browser a tick to start the download before the blob disappears
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const dashType = (style: string) =>
  style === "dashed" ? "dash" : style === "dotted" ? "sysDot" : "solid"

function lineProps(outline: Outline | undefined): LineProps {
  if (!outline?.width) return { type: "none" }
  return {
    color: toHex(outline.color),
    width: outline.width,
    dashType: dashType(outline.style) as LineProps["dashType"],
  }
}

function shadowProps(shadow: Shadow | undefined): ShadowProps | undefined {
  if (!shadow) return undefined
  const offset = Math.round(Math.hypot(shadow.h, shadow.v))
  // CSS measures the offset on screen axes; OOXML wants a direction plus a distance
  const angle = ((Math.round((Math.atan2(shadow.v, shadow.h) * 180) / Math.PI) % 360) + 360) % 360
  return {
    type: "outer",
    color: toHex(shadow.color, "000000"),
    blur: Math.min(100, Math.round(shadow.blur)),
    offset: Math.min(200, offset),
    angle,
    opacity: alphaOf(shadow.color),
  }
}

function frameOf(el: SlideElement) {
  return {
    x: inch(el.left),
    y: inch(el.top),
    w: inch(Math.max(1, el.width)),
    h: inch(Math.max(1, el.height)),
    rotate: el.rotate || undefined,
  }
}

function hyperlinkOf(el: SlideElement, slideNumbers: Map<string, number>) {
  if (!el.link) return undefined
  if (el.link.type === "web") return { url: el.link.target }
  const index = slideNumbers.get(el.link.target)
  return index ? { slide: index } : undefined
}

/**
 * pptxgenjs attaches hyperlinks to text *runs*, not to the text frame, so an element-level
 * link has to be pushed down onto every run that does not already carry its own.
 */
function withHyperlink(runs: PptxGenJS.TextProps[], hyperlink: HyperlinkProps | undefined) {
  if (!hyperlink) return runs
  return runs.map((run) => ({
    ...run,
    options: { ...run.options, hyperlink: run.options?.hyperlink ?? hyperlink },
  }))
}

type HyperlinkProps = NonNullable<PptxGenJS.TextPropsOptions["hyperlink"]>

function textDefaults(el: TextElement): RunDefaults {
  return {
    bold: el.bold,
    italic: el.italic,
    underline: el.underline,
    strike: el.strikethrough,
    color: toHex(el.color, "000000"),
    fontSize: pt(el.fontSize),
    fontFace: primaryFont(el.fontFamily),
  }
}

export async function exportPptx(deck: Deck, t: Translate = fallbackTranslate) {
  const bytes = await writePptx(deck, t)
  triggerDownload(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    `${deck.title || "deck"}.pptx`,
  )
}

/**
 * The finished .pptx bytes.
 *
 * pptxgenjs writes what it can, and then the package is reopened and finished: gradients,
 * custom contours, transitions, animations and the East Asian typefaces are all things it
 * has no way to express. See [`pptx-patch.ts`](./pptx-patch.ts).
 */
export async function writePptx(deck: Deck, t: Translate = fallbackTranslate): Promise<ArrayBuffer> {
  const pptx = await buildPptx(deck, t)
  const raw = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer
  return patchPptx(raw, deck, t)
}

/**
 * The pptxgenjs half of the mapping, split out so it can be exercised on its own.
 *
 * Everything placed here is named with its element's export marker, which is what the
 * patch pass matches a shape back to its element by; the marker never survives that pass.
 */
export async function buildPptx(deck: Deck, t: Translate = fallbackTranslate): Promise<Pptx> {
  const { default: PptxGenJSCtor } = await import("pptxgenjs")

  const pptx = new PptxGenJSCtor()
  pptx.defineLayout({ name: "PPTGO", width: 10, height: 10 * (VIEWPORT_HEIGHT / VIEWPORT_WIDTH) })
  pptx.layout = "PPTGO"
  pptx.title = deck.title

  const slideNumbers = new Map(deck.slides.map((slide, i) => [slide.id, i + 1]))

  for (const slideData of deck.slides) {
    const slide = pptx.addSlide()
    applyBackground(slide, slideData)

    for (const [index, el] of slideData.elements.entries()) {
      const marker = exportMarker(index)
      switch (el.type) {
        case "text":
          addText(slide, el, marker, slideNumbers)
          break
        case "shape":
          await addShape(slide, el, marker, slideNumbers, t)
          break
        case "image":
          await addImage(slide, el, marker, slideNumbers, t)
          break
        case "line":
          addLine(slide, el, marker)
          break
        case "table":
          addTable(slide, el, marker)
          break
        case "chart":
          addChart(slide, el, marker, t)
          break
        case "video":
        case "audio":
          addMedia(slide, el, marker)
          break
        case "formula":
          await addFormula(slide, el, marker)
          break
      }
    }

    if (slideData.notes) slide.addNotes(slideData.notes)
  }

  return pptx
}

function applyBackground(slide: PptxSlide, slideData: Slide) {
  const background = slideData.background
  if (background.type === "image" && background.image) {
    slide.background = background.image.startsWith("data:")
      ? { data: background.image }
      : { path: background.image }
    return
  }
  if (background.type === "gradient" && background.gradient) {
    slide.background = { color: flattenGradient(background.gradient, "FFFFFF") }
    return
  }
  slide.background = { color: toHex(background.color, "FFFFFF") }
}

function addText(
  slide: PptxSlide,
  el: TextElement,
  marker: string,
  slideNumbers: Map<string, number>,
) {
  const link = hyperlinkOf(el, slideNumbers)
  const runs = withHyperlink(htmlToRuns(el.content, textDefaults(el)), link)
  if (!runs.length) return
  slide.addText(runs, {
    ...frameOf(el),
    objectName: marker,
    align: el.align === "justify" ? "justify" : el.align,
    valign: el.vertical,
    // element opacity used to reach the fill only, so a half-faded text box exported with
    // solid black type sitting on a translucent panel
    transparency: transparency(el.opacity),
    // PowerPoint counts multiples of *its* single spacing, not of the type size, so the
    // CSS multiplier has to be divided back down by the same factor import multiplied by
    lineSpacingMultiple: Math.min(9.99, Math.max(0.1, el.lineHeight / singleLineFactor(el.fontFamily))),
    charSpacing: el.letterSpacing ? Math.round(el.letterSpacing * 0.72) : undefined,
    paraSpaceAfter: el.paragraphSpacing ? pt(el.paragraphSpacing) : undefined,
    fill: el.fill ? { color: toHex(el.fill), transparency: transparency(el.opacity) } : undefined,
    line: lineProps(el.outline),
    shadow: shadowProps(el.shadow),
    hyperlink: link,
    margin: el.padding ? pt(el.padding) : 4,
    isTextBox: true,
    fit: "shrink",
    // carried back out so a PPTX that came in with `wrap="none"` leaves the same way
    // rather than silently gaining wrapping on the round trip
    wrap: el.wrap === false ? false : undefined,
  })
}

/**
 * Renders a bespoke path to PNG. Custom geometry normally carries these shapes out
 * natively; this is what is left when the path is not something we can convert, and a
 * picture of the drawing beats a coloured rectangle where the drawing should be.
 */
async function addCustomShape(slide: PptxSlide, el: ShapeElement, marker: string, t: Translate) {
  const stroke = el.outline?.width ? el.outline : { width: 2, color: "#111827", style: "solid" }
  // every interpolated value below came out of a deck, so it is escaped rather than
  // trusted to be a colour: one `&` in a fill produced an SVG that would not parse, and
  // the shape silently exported as a blank rectangle
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${el.width}" height="${el.height}" ` +
    `viewBox="0 0 ${el.viewBox} ${el.viewBox}" preserveAspectRatio="none">` +
    `<path d="${xmlAttr(el.path)}" fill="${xmlAttr(el.fill === "transparent" ? "none" : el.fill)}" ` +
    `stroke="${xmlAttr(stroke.color)}" stroke-width="${stroke.width}" stroke-linecap="round" ` +
    `stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`

  const png = await svgToPng(svg, el.width, el.height)
  if (png) {
    slide.addImage({ ...frameOf(el), objectName: marker, data: png, altText: elementLabel(el, t) })
    return
  }
  // No rasteriser available either. `{ type: "none" }` makes pptxgenjs omit the fill node
  // entirely, which PowerPoint then fills from the theme — a solid block where a sketch
  // should be. An explicitly transparent fill keeps the placeholder invisible.
  slide.addShape("rect" as PptxGenJS.SHAPE_NAME, {
    ...frameOf(el),
    objectName: marker,
    fill: { color: "FFFFFF", transparency: 100 },
    line: lineProps(el.outline?.width ? el.outline : { style: "solid", width: 2, color: "#111827" }),
  })
}

/**
 * The solid fill a shape is written with.
 *
 * A gradient still goes in as the average of its stops; the patch pass replaces it with
 * the real gradient, and what is left behind is the colour the shape falls back to if it
 * ever cannot. A fill that is fully transparent has to be *stated* as one rather than
 * omitted, for the same reason the placeholder above does.
 */
function shapeFill(el: ShapeElement) {
  if (alphaOf(el.fill) === 0 && !el.gradient) return { color: "FFFFFF", transparency: 100 }
  const color = el.gradient ? flattenGradient(el.gradient, toHex(el.fill)) : toHex(el.fill)
  return { color, transparency: transparency(el.opacity) }
}

async function addShape(
  slide: PptxSlide,
  el: ShapeElement,
  marker: string,
  slideNumbers: Map<string, number>,
  t: Translate,
) {
  const def = SHAPE_MAP.get(el.shapeKey)
  // A shape with no preset goes in as a plain rectangle and is given its real contour by
  // the patch pass. Only a path that will not convert at all falls back to a picture.
  const geometry = def ? null : shapeGeometryXml(el)
  if (!def && !geometry) {
    await addCustomShape(slide, el, marker, t)
    return
  }

  const preset = (def?.preset ?? "rect") as PptxGenJS.SHAPE_NAME
  const shared = {
    ...frameOf(el),
    objectName: marker,
    fill: shapeFill(el),
    line: lineProps(el.outline),
    shadow: shadowProps(el.shadow),
    flipH: el.flipH || undefined,
    flipV: el.flipV || undefined,
    hyperlink: hyperlinkOf(el, slideNumbers),
  }

  const runs = withHyperlink(
    htmlToRuns(el.text.content, {
      bold: el.text.bold,
      italic: el.text.italic,
      underline: el.text.underline,
      strike: el.text.strikethrough,
      color: toHex(el.text.color, "FFFFFF"),
      fontSize: pt(el.text.fontSize),
      fontFace: primaryFont(el.text.fontFamily),
    }),
    shared.hyperlink,
  )

  if (!runs.length) {
    slide.addShape(preset, shared)
    return
  }

  // One call, so the text belongs to the shape in PowerPoint instead of floating over it.
  slide.addText(runs, {
    ...shared,
    shape: preset,
    align: el.text.align === "justify" ? "justify" : el.text.align,
    valign: el.text.vertical,
    lineSpacingMultiple: Math.min(9.99, Math.max(0.1, el.text.lineHeight / singleLineFactor(el.text.fontFamily))),
  })
}

async function addImage(
  slide: PptxSlide,
  el: ImageElement,
  marker: string,
  slideNumbers: Map<string, number>,
  t: Translate,
) {
  // filters, tinting and rounded corners have no OOXML equivalent, so they are flattened
  // into the bitmap before it is embedded
  const src = await bakeImage(el)
  const isData = src.startsWith("data:")
  const sizing = el.clip
    ? {
        type: "crop" as const,
        x: inch(el.width * el.clip.range[0][0]),
        y: inch(el.height * el.clip.range[0][1]),
        w: inch(el.width * (el.clip.range[1][0] - el.clip.range[0][0])),
        h: inch(el.height * (el.clip.range[1][1] - el.clip.range[0][1])),
      }
    : undefined

  slide.addImage({
    ...frameOf(el),
    objectName: marker,
    data: isData ? src : undefined,
    path: isData ? undefined : src,
    altText: elementLabel(el, t),
    flipH: el.flipH || undefined,
    flipV: el.flipV || undefined,
    // a fully round image is expressible natively; anything less was baked in above
    rounding: el.radius >= Math.min(el.width, el.height) / 2 || undefined,
    transparency: transparency(el.opacity),
    shadow: shadowProps(el.shadow),
    hyperlink: hyperlinkOf(el, slideNumbers),
    sizing,
  })
}

const MEDIA_EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
}

function addMedia(slide: PptxSlide, el: MediaElement, marker: string) {
  const isData = el.src.startsWith("data:")
  // pptxgenjs cannot sniff the container from a data URI, so it is named explicitly
  const mime = isData ? (el.src.match(/^data:([^;,]+)/)?.[1] ?? "") : ""
  const extension = MEDIA_EXTENSION[mime] ?? (el.type === "video" ? "mp4" : "mp3")

  slide.addMedia({
    ...frameOf(el),
    objectName: marker,
    type: el.type,
    data: isData ? el.src : undefined,
    path: isData ? undefined : el.src,
    extn: extension,
    cover: el.type === "video" ? el.poster : undefined,
  })
}

/**
 * PowerPoint equations are OMML, a different language from LaTeX, so the rendered formula
 * is embedded as a picture. If rasterising is unavailable the source is written as text,
 * which at least keeps the content editable.
 */
async function addFormula(slide: PptxSlide, el: FormulaElement, marker: string) {
  const png = await formulaToPng(el.latex, el.color, el.width, el.height)
  if (png) {
    slide.addImage({ ...frameOf(el), objectName: marker, data: png, altText: el.latex })
    return
  }
  slide.addText(el.latex, {
    ...frameOf(el),
    objectName: marker,
    color: toHex(el.color),
    fontSize: pt(el.height * 0.4),
    fontFace: "Courier New",
    align: "center",
    valign: "middle",
  })
}

function addLine(slide: PptxSlide, el: LineElement, marker: string) {
  const [sx, sy] = el.start
  const [ex, ey] = el.end
  const left = Math.min(sx, ex)
  const top = Math.min(sy, ey)

  slide.addShape((el.curve ? "curvedConnector3" : "line") as PptxGenJS.SHAPE_NAME, {
    objectName: marker,
    x: inch(el.left + left),
    y: inch(el.top + top),
    w: inch(Math.max(Math.abs(ex - sx), 1)),
    h: inch(Math.abs(ey - sy)),
    line: {
      color: toHex(el.color),
      width: el.strokeWidth,
      dashType: dashType(el.style) as LineProps["dashType"],
      transparency: transparency(el.opacity),
      endArrowType: el.endCap === "arrow" ? "triangle" : el.endCap === "dot" ? "oval" : undefined,
      beginArrowType:
        el.startCap === "arrow" ? "triangle" : el.startCap === "dot" ? "oval" : undefined,
    },
    flipH: ex < sx || undefined,
    flipV: ey < sy || undefined,
  })
}

function addTable(slide: PptxSlide, el: TableElement, marker: string) {
  const rows = el.rows.map((row, r) =>
    row
      .filter((cell) => !cell.merged)
      .map((cell) => ({
        text: cell.text,
        options: {
          colspan: cell.colspan > 1 ? cell.colspan : undefined,
          rowspan: cell.rowspan > 1 ? cell.rowspan : undefined,
          fill: { color: toHex(cellBackground(el, cell, r), "FFFFFF") },
          color: toHex(cellTextColor(el, cell, r)),
          fontSize: pt(cell.fontSize ?? el.fontSize),
          fontFace: primaryFont(el.fontFamily),
          bold: cell.bold ?? isHeaderRow(el, r),
          italic: cell.italic,
          underline: cell.underline ? ({ style: "sng" } as const) : undefined,
          align: cell.align === "justify" ? ("left" as const) : cell.align ?? ("left" as const),
          valign: "middle" as const,
          border: el.outline.width
            ? ({ type: "solid", pt: el.outline.width, color: toHex(el.outline.color) } as const)
            : undefined,
        },
      })),
  )

  slide.addTable(rows, {
    ...frameOf(el),
    objectName: marker,
    colW: el.colWidths.map((w) => inch(el.width * w)),
    rowH: el.rows.map(() => inch(el.height / Math.max(1, el.rows.length))),
    // imported tables carry the source deck's cell insets; without them PowerPoint's
    // default margins re-inflate rows that were authored tight
    margin: el.cellPadding
      ? [pt(el.cellPadding[0]), pt(el.cellPadding[1]), pt(el.cellPadding[0]), pt(el.cellPadding[1])]
      : undefined,
    autoPage: false,
  })
}

/** `ChartType` is an instance member of PptxGenJS, but CHART_NAME is just a string union. */
const CHART_NAME_BY_TYPE: Record<ChartElement["chartType"], PptxGenJS.CHART_NAME> = {
  // a vertical "column" chart is a bar chart with barDir: "col"
  column: "bar",
  bar: "bar",
  line: "line",
  area: "area",
  scatter: "scatter",
  pie: "pie",
  doughnut: "doughnut",
  radar: "radar",
}

function addChart(slide: PptxSlide, el: ChartElement, marker: string, t: Translate) {
  const isPie = el.chartType === "pie" || el.chartType === "doughnut"
  const type = CHART_NAME_BY_TYPE[el.chartType]

  const data = isPie
    ? [
        {
          name: el.data.series[0]?.name || t("chart.series", { n: 1 }),
          labels: el.data.categories,
          values: el.data.series[0]?.values ?? [],
        },
      ]
    : el.data.series.map((series) => ({
        name: series.name,
        labels: el.data.categories,
        values: series.values,
      }))

  slide.addChart(type, data, {
    ...frameOf(el),
    objectName: marker,
    barDir: el.chartType === "bar" ? "bar" : "col",
    chartColors: el.themeColors.map((c) => toHex(c)),
    showLegend: el.showLegend,
    legendPos: "b",
    legendColor: toHex(el.textColor),
    showValue: el.showValue,
    dataLabelColor: toHex(el.textColor),
    catAxisLabelColor: toHex(el.textColor),
    valAxisLabelColor: toHex(el.textColor),
    valGridLine: el.showGrid ? { color: toHex(el.gridColor), style: "solid" } : { style: "none" },
    catGridLine: { style: "none" },
    holeSize: el.chartType === "doughnut" ? 50 : undefined,
    fill: el.fill ? toHex(el.fill) : undefined,
  })
}
