import type PptxGenJS from "pptxgenjs"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { singleLineFactor } from "./line-metrics"
import { alphaOf, flattenGradient, inch, pt, toHex, transparency } from "./color"
import { formulaToPng } from "./formula"
import { bakeImage } from "./image"
import { svgToPng } from "./raster"
import { htmlToRuns, primaryFont, type RunDefaults } from "./rich-text"
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

export async function exportPptx(deck: Deck) {
  const bytes = await writePptx(deck)
  triggerDownload(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    `${deck.title || "deck"}.pptx`,
  )
}

/**
 * The finished .pptx bytes, with the East Asian faces put back.
 *
 * pptxgenjs takes a single `fontFace` per run and writes it into `a:latin`, `a:ea` and
 * `a:cs` alike, so a Chinese deck came back out with its Chinese font replaced by the
 * Latin one — the import fix that recovered 黑体 / 宋体 / 楷体 would have been undone by
 * the first export. The tags are already in the generated XML, so this only rewrites the
 * `a:ea` value; nothing about the document's structure changes.
 */
export async function writePptx(deck: Deck): Promise<ArrayBuffer> {
  const pptx = await buildPptx(deck)
  const raw = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer

  const eastAsian = eastAsianByLatin(deck)
  if (!eastAsian.size) return raw

  const { default: JSZipCtor } = await import("jszip")
  const zip = await JSZipCtor.loadAsync(raw)
  const slides = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name),
  )

  for (const name of slides) {
    const xml = await zip.file(name)!.async("string")
    // keyed off the `a:latin` value sitting in the same rPr, so each run is matched to the
    // pairing it actually came from rather than to a document-wide guess
    const patched = xml.replace(
      /(<a:latin typeface="([^"]*)"[^>]*\/>\s*<a:ea typeface=")([^"]*)(")/g,
      (whole, head: string, latin: string, _current: string, tail: string) => {
        const ea = eastAsian.get(latin)
        return ea ? `${head}${ea}${tail}` : whole
      },
    )
    if (patched !== xml) zip.file(name, patched)
  }

  return zip.generateAsync({ type: "arraybuffer" })
}

/** Generic families are CSS fallbacks, not typefaces, and must never reach the file. */
const GENERIC_FAMILY = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i

const facesOf = (stack: string) =>
  stack
    .split(",")
    .map((part) => part.replace(/['"]/g, "").trim())
    .filter((part) => part && !GENERIC_FAMILY.test(part))

/**
 * Latin face -> the East Asian face the deck pairs it with, harvested from the font
 * stacks the importer built. A stack only carries a second family when the source set
 * `a:ea`, so its presence is the signal.
 *
 * One Latin face is paired with one East Asian face in every real deck examined — a
 * designer picks 黑体 for headings and 宋体 for body, and the Latin faces differ along
 * with them. Should a deck ever break that, the most frequent pairing wins, which keeps
 * the common case right instead of dropping both.
 */
function eastAsianByLatin(deck: Deck): Map<string, string> {
  const tally = new Map<string, Map<string, number>>()

  const record = (stack: string | undefined) => {
    if (!stack) return
    const [latin, ea] = facesOf(stack)
    if (!latin || !ea || latin === ea) return
    const byEa = tally.get(latin) ?? new Map<string, number>()
    byEa.set(ea, (byEa.get(ea) ?? 0) + 1)
    tally.set(latin, byEa)
  }

  for (const slide of deck.slides) {
    for (const el of slide.elements) {
      if (el.type === "text") record(el.fontFamily)
      else if (el.type === "shape") record(el.text.fontFamily)
      else if (el.type === "table") record(el.fontFamily)
    }
  }

  const winners = new Map<string, string>()
  for (const [latin, byEa] of tally) {
    const best = [...byEa].sort((a, b) => b[1] - a[1])[0]
    if (best) winners.set(latin, best[0])
  }
  return winners
}

/** Split out from `exportPptx` so the whole mapping can be exercised without a download. */
export async function buildPptx(deck: Deck): Promise<Pptx> {
  const { default: PptxGenJSCtor } = await import("pptxgenjs")

  const pptx = new PptxGenJSCtor()
  pptx.defineLayout({ name: "PPTGO", width: 10, height: 10 * (VIEWPORT_HEIGHT / VIEWPORT_WIDTH) })
  pptx.layout = "PPTGO"
  pptx.title = deck.title

  const slideNumbers = new Map(deck.slides.map((slide, i) => [slide.id, i + 1]))

  for (const slideData of deck.slides) {
    const slide = pptx.addSlide()
    applyBackground(slide, slideData)

    for (const el of slideData.elements) {
      switch (el.type) {
        case "text":
          addText(slide, el, slideNumbers)
          break
        case "shape":
          await addShape(slide, el, slideNumbers)
          break
        case "image":
          await addImage(slide, el, slideNumbers)
          break
        case "line":
          addLine(slide, el)
          break
        case "table":
          addTable(slide, el)
          break
        case "chart":
          addChart(slide, el)
          break
        case "video":
        case "audio":
          addMedia(slide, el)
          break
        case "formula":
          await addFormula(slide, el)
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

function addText(slide: PptxSlide, el: TextElement, slideNumbers: Map<string, number>) {
  const link = hyperlinkOf(el, slideNumbers)
  const runs = withHyperlink(htmlToRuns(el.content, textDefaults(el)), link)
  if (!runs.length) return
  slide.addText(runs, {
    ...frameOf(el),
    align: el.align === "justify" ? "justify" : el.align,
    valign: el.vertical,
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

/** Renders a bespoke path to PNG — OOXML custom geometry is beyond what pptxgenjs emits. */
async function addCustomShape(slide: PptxSlide, el: ShapeElement) {
  const stroke = el.outline?.width ? el.outline : { width: 2, color: "#111827", style: "solid" }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${el.width}" height="${el.height}" ` +
    `viewBox="0 0 ${el.viewBox} ${el.viewBox}" preserveAspectRatio="none">` +
    `<path d="${el.path.replace(/"/g, "'")}" fill="${el.fill === "transparent" ? "none" : el.fill}" ` +
    `stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" ` +
    `stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`

  const png = await svgToPng(svg, el.width, el.height)
  if (png) {
    slide.addImage({ ...frameOf(el), data: png, altText: el.name })
    return
  }
  // No rasteriser available. `{ type: "none" }` makes pptxgenjs omit the fill node entirely,
  // which PowerPoint then fills from the theme — a solid block where a sketch should be.
  // An explicitly transparent fill keeps the placeholder invisible.
  slide.addShape("rect" as PptxGenJS.SHAPE_NAME, {
    ...frameOf(el),
    fill: { color: "FFFFFF", transparency: 100 },
    line: lineProps(el.outline?.width ? el.outline : { style: "solid", width: 2, color: "#111827" }),
  })
}

async function addShape(slide: PptxSlide, el: ShapeElement, slideNumbers: Map<string, number>) {
  const def = SHAPE_MAP.get(el.shapeKey)
  if (!def) {
    await addCustomShape(slide, el)
    return
  }
  const preset = def.preset as PptxGenJS.SHAPE_NAME
  const fill = el.gradient
    ? { color: flattenGradient(el.gradient, toHex(el.fill)) }
    : { color: toHex(el.fill) }
  const shared = {
    ...frameOf(el),
    fill: { ...fill, transparency: transparency(el.opacity) },
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

async function addImage(slide: PptxSlide, el: ImageElement, slideNumbers: Map<string, number>) {
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
    data: isData ? src : undefined,
    path: isData ? undefined : src,
    altText: el.name,
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

function addMedia(slide: PptxSlide, el: MediaElement) {
  const isData = el.src.startsWith("data:")
  // pptxgenjs cannot sniff the container from a data URI, so it is named explicitly
  const mime = isData ? (el.src.match(/^data:([^;,]+)/)?.[1] ?? "") : ""
  const extension = MEDIA_EXTENSION[mime] ?? (el.type === "video" ? "mp4" : "mp3")

  slide.addMedia({
    ...frameOf(el),
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
async function addFormula(slide: PptxSlide, el: FormulaElement) {
  const png = await formulaToPng(el.latex, el.color, el.width, el.height)
  if (png) {
    slide.addImage({ ...frameOf(el), data: png, altText: el.latex })
    return
  }
  slide.addText(el.latex, {
    ...frameOf(el),
    color: toHex(el.color),
    fontSize: pt(el.height * 0.4),
    fontFace: "Courier New",
    align: "center",
    valign: "middle",
  })
}

function addLine(slide: PptxSlide, el: LineElement) {
  const [sx, sy] = el.start
  const [ex, ey] = el.end
  const left = Math.min(sx, ex)
  const top = Math.min(sy, ey)

  slide.addShape((el.curve ? "curvedConnector3" : "line") as PptxGenJS.SHAPE_NAME, {
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

function addTable(slide: PptxSlide, el: TableElement) {
  const rows = el.rows.map((row, r) =>
    row
      .filter((cell) => !cell.merged)
      .map((cell) => ({
        text: cell.text,
        options: {
          colspan: cell.colspan > 1 ? cell.colspan : undefined,
          rowspan: cell.rowspan > 1 ? cell.rowspan : undefined,
          fill: { color: toHex(cellFill(el, cell, r), "FFFFFF") },
          color: toHex(cell.color ?? (isHeader(el, r) ? "#ffffff" : "#111827")),
          fontSize: pt(cell.fontSize ?? el.fontSize),
          fontFace: primaryFont(el.fontFamily),
          bold: cell.bold ?? isHeader(el, r),
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
    colW: el.colWidths.map((w) => inch(el.width * w)),
    rowH: el.rows.map(() => inch(el.height / Math.max(1, el.rows.length))),
    autoPage: false,
  })
}

const isHeader = (el: TableElement, row: number) => el.theme.rowHeader && row === 0

function cellFill(el: TableElement, cell: { fill?: string }, row: number) {
  if (cell.fill) return cell.fill
  if (isHeader(el, row)) return el.theme.color
  if (el.theme.banded && row % 2 === 0) return tint(el.theme.color, 0.88)
  return "#ffffff"
}

/** Mixes a colour towards white — used for banded table rows. */
export function tint(color: string, amount: number): string {
  const hex = toHex(color)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return `#${[0, 2, 4]
    .map((i) => mix(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, "0"))
    .join("")}`
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

function addChart(slide: PptxSlide, el: ChartElement) {
  const isPie = el.chartType === "pie" || el.chartType === "doughnut"
  const type = CHART_NAME_BY_TYPE[el.chartType]

  const data = isPie
    ? [
        {
          name: el.data.series[0]?.name ?? "系列 1",
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
