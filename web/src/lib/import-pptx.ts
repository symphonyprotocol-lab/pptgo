import type JSZip from "jszip"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { singleLineFactor } from "./line-metrics"
import {
  createChartElement,
  createImageElement,
  createLineElement,
  createShapeElement,
  createSlide,
  createTableCell,
  createTableElement,
  createTextElement,
  newId,
} from "./factory"
import { escapeHtml } from "./sanitize"
import { SHAPE_LIST, SHAPE_MAP } from "./shapes"
import type {
  AlignHorizontal,
  AlignVertical,
  ChartData,
  ChartType,
  Deck,
  Gradient,
  Shadow,
  Slide,
  SlideBackground,
  SlideElement,
  TableCell,
} from "@/types/slides"

/** OOXML measures everything in English Metric Units. */
const EMU_PER_INCH = 914400
const EMU_PER_POINT = 12700

/** Preset geometry name -> our shape key, for the presets we can draw. */
const KEY_BY_PRESET = new Map(SHAPE_LIST.map((s) => [s.preset, s.key]))
const PRESET_ALIASES: Record<string, string> = {
  roundRect: "roundRect",
  round1Rect: "roundRect",
  round2SameRect: "roundRect",
  snip1Rect: "rect",
  homePlate: "chevron",
  bentArrow: "arrowRight",
  mathPlus: "cross",
  star7: "star6",
  star8: "star6",
  star10: "star6",
  star12: "star6",
  wedgeEllipseCallout: "callout",
  wedgeRoundRectCallout: "callout",
  borderCallout1: "callout",
  flowChartConnector: "ellipse",
  flowChartPredefinedProcess: "flowChartProcess",
  flowChartInputOutput: "parallelogram",
  flowChartDocument: "flowChartProcess",
  actionButtonBlank: "rect",
}

interface ChartSpec {
  chartType: ChartType
  data: ChartData
  showLegend: boolean
}

interface Ctx {
  /** EMU -> canvas units, uniform so the slide keeps its aspect ratio */
  scale: number
  offsetX: number
  offsetY: number
  /** relationship id -> resolved value (data URI for media, url for hyperlinks) */
  rels: Map<string, { type: string; target: string }>
  media: Map<string, string>
  /** scheme colour name -> hex, read from the deck's own theme */
  theme: Record<string, string>
  /** relationship id -> parsed chart, preloaded because the shape walk is synchronous */
  charts: Map<string, ChartSpec>
}

export async function importPptx(file: File): Promise<Deck> {
  const { default: JSZipCtor } = await import("jszip")
  const zip = await JSZipCtor.loadAsync(file)

  const presentation = await readXml(zip, "ppt/presentation.xml")
  if (!presentation) throw new Error("这不是一个有效的 PPTX 文件")

  const sldSz = first(presentation, "p:sldSz")
  const cx = Number(sldSz?.getAttribute("cx")) || 12192000
  const cy = Number(sldSz?.getAttribute("cy")) || 6858000
  const scale = Math.min(VIEWPORT_WIDTH / cx, VIEWPORT_HEIGHT / cy)
  const offsetX = (VIEWPORT_WIDTH - cx * scale) / 2
  const offsetY = (VIEWPORT_HEIGHT - cy * scale) / 2

  const media = await readMedia(zip)
  const slidePaths = await resolveSlideOrder(zip, presentation)
  if (!slidePaths.length) throw new Error("这个 PPTX 里没有找到幻灯片")

  const themeCache = new Map<string, Record<string, string>>()

  const slides: Slide[] = []
  for (const path of slidePaths) {
    const xml = await readXml(zip, path)
    if (!xml) continue
    const rels = await readRels(zip, path)
    const ctx: Ctx = {
      scale,
      offsetX,
      offsetY,
      rels,
      media,
      theme: await resolveTheme(zip, path, themeCache),
      charts: await readCharts(zip, rels),
    }
    slides.push({
      ...createSlide(),
      id: newId(),
      background: readBackground(xml, ctx),
      elements: readShapeTree(first(xml, "p:cSld") ?? xml, ctx),
      notes: await readNotes(zip, path),
    })
  }

  return {
    version: 1,
    title: file.name.replace(/\.pptx$/i, "") || "导入的演示文稿",
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: DEFAULT_THEME,
    slides: slides.length ? slides : [createSlide()],
  }
}

// ---------------------------------------------------------------- package plumbing

async function readXml(zip: JSZip, path: string): Promise<Element | null> {
  const entry = zip.file(path)
  if (!entry) return null
  const text = await entry.async("string")
  const doc = new DOMParser().parseFromString(text, "application/xml")
  if (doc.getElementsByTagName("parsererror").length) return null
  return doc.documentElement
}

async function readRels(zip: JSZip, slidePath: string) {
  const relPath = slidePath.replace(/([^/]+)$/, "_rels/$1.rels")
  const xml = await readXml(zip, relPath)
  const map = new Map<string, { type: string; target: string }>()
  if (!xml) return map
  for (const rel of all(xml, "Relationship")) {
    const id = rel.getAttribute("Id")
    const target = rel.getAttribute("Target") ?? ""
    const type = (rel.getAttribute("Type") ?? "").split("/").pop() ?? ""
    if (id) map.set(id, { type, target })
  }
  return map
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  tiff: "image/tiff",
  emf: "image/emf",
  wmf: "image/wmf",
}

/** Every embedded image, inlined as a data URI so the deck stays self-contained. */
async function readMedia(zip: JSZip): Promise<Map<string, string>> {
  const media = new Map<string, string>()
  const entries = zip.file(/^ppt\/media\//)
  for (const entry of entries) {
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
    const mime = MIME[ext]
    if (!mime) continue
    const base64 = await entry.async("base64")
    media.set(entry.name.split("/").pop()!, `data:${mime};base64,${base64}`)
  }
  return media
}

async function resolveSlideOrder(zip: JSZip, presentation: Element): Promise<string[]> {
  const rels = await readRels(zip, "ppt/presentation.xml")
  const ordered: string[] = []
  for (const ref of all(presentation, "p:sldId")) {
    const id = ref.getAttribute("r:id")
    const target = id ? rels.get(id)?.target : undefined
    if (target) ordered.push(normalizePath(target))
  }
  if (ordered.length) return ordered
  // fall back to whatever slides exist, in name order
  return zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .map((f) => f.name)
    .sort((a, b) => slideNumber(a) - slideNumber(b))
}

const slideNumber = (name: string) => Number(name.match(/slide(\d+)\.xml/)?.[1] ?? 0)

function normalizePath(target: string) {
  const clean = target.replace(/^\.\.\//, "").replace(/^\//, "")
  return clean.startsWith("ppt/") ? clean : `ppt/${clean}`
}

/**
 * Scheme colours live in the theme the slide's layout and master point at. Falls back to
 * the first theme, and finally to PowerPoint's stock palette.
 */
async function resolveTheme(
  zip: JSZip,
  slidePath: string,
  cache: Map<string, Record<string, string>>,
): Promise<Record<string, string>> {
  const themePath = (await findThemePath(zip, slidePath)) ?? "ppt/theme/theme1.xml"
  const cached = cache.get(themePath)
  if (cached) return cached

  const parsed = { ...STOCK_SCHEME, ...(await readClrScheme(zip, themePath)) }
  cache.set(themePath, parsed)
  return parsed
}

async function findThemePath(zip: JSZip, slidePath: string): Promise<string | null> {
  const slideRels = await readRels(zip, slidePath)
  const layout = [...slideRels.values()].find((rel) => rel.type === "slideLayout")
  if (!layout) return null

  const layoutPath = normalizePath(layout.target)
  const layoutRels = await readRels(zip, layoutPath)
  const master = [...layoutRels.values()].find((rel) => rel.type === "slideMaster")
  if (!master) return null

  const masterPath = normalizePath(master.target)
  const masterRels = await readRels(zip, masterPath)
  const theme = [...masterRels.values()].find((rel) => rel.type === "theme")
  return theme ? normalizePath(theme.target) : null
}

async function readClrScheme(zip: JSZip, path: string): Promise<Record<string, string>> {
  const xml = await readXml(zip, path)
  const scheme = xml ? first(xml, "a:clrScheme") : null
  if (!scheme) return {}

  const colors: Record<string, string> = {}
  for (const node of Array.from(scheme.children)) {
    const name = node.tagName.replace(/^a:/, "")
    const srgb = first(node, "a:srgbClr")?.getAttribute("val")
    const sys = first(node, "a:sysClr")?.getAttribute("lastClr")
    const value = srgb ?? sys
    if (value) colors[name] = `#${value}`
  }
  // shapes reference dk1/lt1 as tx1/bg1
  if (colors.dk1) colors.tx1 = colors.dk1
  if (colors.lt1) colors.bg1 = colors.lt1
  if (colors.dk2) colors.tx2 = colors.dk2
  if (colors.lt2) colors.bg2 = colors.lt2
  return colors
}

const CHART_TAGS: { tag: string; type: ChartType }[] = [
  { tag: "c:barChart", type: "column" },
  { tag: "c:bar3DChart", type: "column" },
  { tag: "c:lineChart", type: "line" },
  { tag: "c:areaChart", type: "area" },
  { tag: "c:scatterChart", type: "scatter" },
  { tag: "c:doughnutChart", type: "doughnut" },
  { tag: "c:pieChart", type: "pie" },
  { tag: "c:radarChart", type: "radar" },
]

/** Charts are a separate package part, so they are read up front and keyed by relationship id. */
async function readCharts(
  zip: JSZip,
  rels: Map<string, { type: string; target: string }>,
): Promise<Map<string, ChartSpec>> {
  const charts = new Map<string, ChartSpec>()
  for (const [id, rel] of rels) {
    if (rel.type !== "chart") continue
    const xml = await readXml(zip, normalizePath(rel.target))
    const spec = xml ? readChart(xml) : null
    if (spec) charts.set(id, spec)
  }
  return charts
}

function readChart(xml: Element): ChartSpec | null {
  const plot = first(xml, "c:plotArea")
  if (!plot) return null

  const match = CHART_TAGS.find(({ tag }) => first(plot, tag))
  if (!match) return null
  const node = first(plot, match.tag)!

  // a horizontal bar chart is the same element with barDir="bar"
  const barDir = first(node, "c:barDir")?.getAttribute("val")
  const chartType = match.type === "column" && barDir === "bar" ? "bar" : match.type

  let categories: string[] = []
  const series = children(node, "c:ser").map((ser, index) => {
    const name =
      first(first(ser, "c:tx") ?? ser, "c:v")?.textContent?.trim() || `系列 ${index + 1}`

    const cats = cachedPoints(first(ser, "c:cat"))
    if (cats.length > categories.length) categories = cats

    const values = cachedPoints(first(ser, "c:val") ?? first(ser, "c:yVal")).map((v) => {
      const parsed = Number(v)
      return Number.isFinite(parsed) ? parsed : 0
    })
    return { name, values }
  })

  if (!series.length) return null
  if (!categories.length) {
    categories = series[0].values.map((_, i) => `类别 ${i + 1}`)
  }

  return {
    chartType,
    data: { categories, series },
    showLegend: !!first(xml, "c:legend"),
  }
}

/** Cached values keep their index, so a sparse `c:pt` list still lines up with its categories. */
function cachedPoints(container: Element | null): string[] {
  if (!container) return []
  const points = all(container, "c:pt")
  if (!points.length) return []
  const values: string[] = []
  for (const point of points) {
    const index = Number(point.getAttribute("idx") ?? values.length)
    const value = first(point, "c:v")?.textContent ?? ""
    values[Number.isFinite(index) ? index : values.length] = value
  }
  return Array.from(values, (value) => value ?? "")
}

async function readNotes(zip: JSZip, slidePath: string): Promise<string> {
  const rels = await readRels(zip, slidePath)
  const notesRel = [...rels.values()].find((rel) => rel.type === "notesSlide")
  if (!notesRel) return ""
  const xml = await readXml(zip, normalizePath(notesRel.target))
  if (!xml) return ""
  return all(xml, "a:p")
    .map((p) => all(p, "a:t").map((t) => t.textContent ?? "").join(""))
    .filter(Boolean)
    .join("\n")
}

// ---------------------------------------------------------------- xml helpers

const all = (root: Element, tag: string): Element[] =>
  Array.from(root.getElementsByTagName(tag))

const first = (root: Element, tag: string): Element | null =>
  root.getElementsByTagName(tag)[0] ?? null

/** Direct children only — `p:spTree` nests shape trees inside groups. */
function children(root: Element, tag: string): Element[] {
  return Array.from(root.children).filter((child) => child.tagName === tag)
}

function colorOf(
  node: Element | null,
  theme: Record<string, string>,
  fallback?: string,
): string | undefined {
  if (!node) return fallback
  const srgb = first(node, "a:srgbClr")
  if (srgb) return withAlpha(`#${srgb.getAttribute("val")}`, srgb)
  const scheme = first(node, "a:schemeClr")
  if (scheme) {
    const name = scheme.getAttribute("val") ?? ""
    return withAlpha(theme[name] ?? fallback ?? "#000000", scheme)
  }
  const sys = first(node, "a:sysClr")
  if (sys) return `#${sys.getAttribute("lastClr") ?? "000000"}`
  return fallback
}

/** Used when the package has no theme part, or the theme omits a slot. */
const STOCK_SCHEME: Record<string, string> = {
  bg1: "#ffffff",
  lt1: "#ffffff",
  bg2: "#e7e6e6",
  lt2: "#e7e6e6",
  tx1: "#000000",
  dk1: "#000000",
  tx2: "#44546a",
  dk2: "#44546a",
  accent1: "#4472c4",
  accent2: "#ed7d31",
  accent3: "#a5a5a5",
  accent4: "#ffc000",
  accent5: "#5b9bd5",
  accent6: "#70ad47",
  hlink: "#0563c1",
  folHlink: "#954f72",
}

function withAlpha(hex: string, node: Element): string {
  const alpha = first(node, "a:alpha")?.getAttribute("val")
  if (!alpha) return hex
  const ratio = Number(alpha) / 100000
  if (!Number.isFinite(ratio) || ratio >= 1) return hex
  const value = hex.replace("#", "")
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(ratio * 100) / 100})`
}

// ---------------------------------------------------------------- slide content

function readBackground(xml: Element, ctx: Ctx): SlideBackground {
  const theme = ctx.theme
  const bg = first(xml, "p:bg")
  if (!bg) return { type: "solid", color: "#ffffff" }

  const blip = first(bg, "a:blip")
  const embed = blip?.getAttribute("r:embed")
  if (embed) {
    const image = resolveImage(embed, ctx)
    if (image) return { type: "image", color: "#ffffff", image, imageSize: "cover" }
  }

  const gradient = gradientOf(first(bg, "a:gradFill"), theme)
  if (gradient) return { type: "gradient", color: gradient.stops[0].color, gradient }

  const solid = first(bg, "a:solidFill")
  return { type: "solid", color: colorOf(solid, theme, "#ffffff")! }
}

function resolveImage(relId: string, ctx: Ctx): string | undefined {
  const target = ctx.rels.get(relId)?.target
  if (!target) return undefined
  return ctx.media.get(target.split("/").pop() ?? "")
}

interface Placement {
  left: number
  top: number
  width: number
  height: number
  rotate: number
  flipH: boolean
  flipV: boolean
}

function placementOf(node: Element, ctx: Ctx, parent?: GroupTransform): Placement {
  const xfrm = first(node, "a:xfrm")
  const off = xfrm ? first(xfrm, "a:off") : null
  const ext = xfrm ? first(xfrm, "a:ext") : null

  let x = Number(off?.getAttribute("x") ?? 0)
  let y = Number(off?.getAttribute("y") ?? 0)
  let cx = Number(ext?.getAttribute("cx") ?? 0)
  let cy = Number(ext?.getAttribute("cy") ?? 0)

  if (parent) {
    // children of a group are authored in the group's own coordinate space
    x = parent.x + (x - parent.chX) * parent.scaleX
    y = parent.y + (y - parent.chY) * parent.scaleY
    cx *= parent.scaleX
    cy *= parent.scaleY
  }

  return {
    left: ctx.offsetX + x * ctx.scale,
    top: ctx.offsetY + y * ctx.scale,
    width: Math.max(1, cx * ctx.scale),
    height: Math.max(1, cy * ctx.scale),
    rotate: Math.round(Number(xfrm?.getAttribute("rot") ?? 0) / 60000) % 360,
    flipH: xfrm?.getAttribute("flipH") === "1",
    flipV: xfrm?.getAttribute("flipV") === "1",
  }
}

interface GroupTransform {
  x: number
  y: number
  chX: number
  chY: number
  scaleX: number
  scaleY: number
}

function groupTransformOf(node: Element, parent?: GroupTransform): GroupTransform | undefined {
  const xfrm = first(node, "a:xfrm")
  if (!xfrm) return parent
  const off = first(xfrm, "a:off")
  const ext = first(xfrm, "a:ext")
  const chOff = first(xfrm, "a:chOff")
  const chExt = first(xfrm, "a:chExt")

  let x = Number(off?.getAttribute("x") ?? 0)
  let y = Number(off?.getAttribute("y") ?? 0)
  const cx = Number(ext?.getAttribute("cx") ?? 0)
  const cy = Number(ext?.getAttribute("cy") ?? 0)
  const chX = Number(chOff?.getAttribute("x") ?? 0)
  const chY = Number(chOff?.getAttribute("y") ?? 0)
  const chCx = Number(chExt?.getAttribute("cx") ?? cx) || cx || 1
  const chCy = Number(chExt?.getAttribute("cy") ?? cy) || cy || 1

  if (parent) {
    x = parent.x + (x - parent.chX) * parent.scaleX
    y = parent.y + (y - parent.chY) * parent.scaleY
  }

  return {
    x,
    y,
    chX,
    chY,
    scaleX: (cx || chCx) / chCx,
    scaleY: (cy || chCy) / chCy,
  }
}

function readShapeTree(root: Element, ctx: Ctx, parent?: GroupTransform, groupId?: string): SlideElement[] {
  const tree = first(root, "p:spTree") ?? root
  const elements: SlideElement[] = []

  for (const node of Array.from(tree.children)) {
    switch (node.tagName) {
      case "p:sp": {
        const element = readShape(node, ctx, parent, groupId)
        if (element) elements.push(element)
        break
      }
      case "p:pic": {
        const element = readPicture(node, ctx, parent, groupId)
        if (element) elements.push(element)
        break
      }
      case "p:cxnSp": {
        const element = readConnector(node, ctx, parent, groupId)
        if (element) elements.push(element)
        break
      }
      case "p:graphicFrame": {
        elements.push(...readGraphicFrame(node, ctx, parent, groupId))
        break
      }
      case "p:grpSp": {
        const id = newId()
        elements.push(...readShapeTree(node, ctx, groupTransformOf(node, parent), id))
        break
      }
    }
  }
  return elements
}

function readShape(
  node: Element,
  ctx: Ctx,
  parent?: GroupTransform,
  groupId?: string,
): SlideElement | null {
  const place = placementOf(node, ctx, parent)
  if (place.width < 1 && place.height < 1) return null

  const spPr = first(node, "p:spPr")
  const preset = first(node, "a:prstGeom")?.getAttribute("prst") ?? ""
  const body = first(node, "p:txBody")
  const paragraphs = body ? readParagraphs(body, ctx.theme, ctx.scale) : null
  const hasText = !!paragraphs?.html

  // A plain rectangle with text and no fill of its own is a text box, not a shape —
  // PowerPoint also marks most of them with txBox="1".
  const declaredTextBox = first(node, "p:cNvSpPr")?.getAttribute("txBox") === "1"
  const isTextBox =
    hasText && (declaredTextBox || ((preset === "" || preset === "rect") && !hasVisibleFill(spPr)))

  const link = readLink(node, ctx)

  if (isTextBox) {
    return {
      ...createTextElement({
        ...boxOf(place),
        rotate: place.rotate,
        content: paragraphs!.html,
        fontSize: paragraphs!.fontSize,
        color: paragraphs!.color,
        bold: paragraphs!.bold,
        italic: paragraphs!.italic,
        align: paragraphs!.align,
        vertical: verticalOf(body),
        fontFamily: paragraphs!.fontFamily ?? DEFAULT_THEME.fontFamily,
        lineHeight: paragraphs!.lineHeight,
        // only carried when the source forbids wrapping, so decks that say nothing keep
        // the editor's own default rather than gaining a field that means "unset"
        ...(wrapsOf(body) ? {} : { wrap: false }),
      }),
      groupId,
      link,
    }
  }

  const key = KEY_BY_PRESET.get(preset) ?? PRESET_ALIASES[preset] ?? "rect"
  const def = SHAPE_MAP.get(key)!
  const fill = colorOf(first(spPr ?? node, "a:solidFill"), ctx.theme, undefined)
  // gradients were only ever used to answer "is this filled at all", so a gradient shape
  // imported as the fallback grey and lost the fill it was drawn with
  const gradient = gradientOf(first(spPr ?? node, "a:gradFill"), ctx.theme)
  const shadow = shadowOf(spPr, ctx.theme, ctx.scale)
  const outline = readOutline(spPr, ctx.theme)

  return {
    ...createShapeElement(key, {
      ...boxOf(place),
      rotate: place.rotate,
      path: def.path,
      viewBox: def.viewBox,
      fill: fill ?? gradient?.stops[0].color ?? "#cbd5e1",
      gradient,
      shadow,
      flipH: place.flipH || undefined,
      flipV: place.flipV || undefined,
      outline,
      text: {
        content: paragraphs?.html ?? "",
        fontFamily: paragraphs?.fontFamily ?? DEFAULT_THEME.fontFamily,
        fontSize: paragraphs?.fontSize ?? 20,
        color: paragraphs?.color ?? "#ffffff",
        bold: paragraphs?.bold ?? false,
        italic: paragraphs?.italic ?? false,
        underline: false,
        strikethrough: false,
        align: paragraphs?.align ?? "center",
        vertical: verticalOf(body),
        lineHeight: paragraphs?.lineHeight ?? singleLineFactor(DEFAULT_THEME.fontFamily),
      },
    }),
    groupId,
    link,
  }
}

const boxOf = (place: Placement) => ({
  left: place.left,
  top: place.top,
  width: place.width,
  height: place.height,
})

function hasVisibleFill(spPr: Element | null): boolean {
  if (!spPr) return false
  if (children(spPr, "a:noFill").length) return false
  return !!(children(spPr, "a:solidFill").length || children(spPr, "a:gradFill").length)
}

/**
 * A linear gradient fill, shared by slide backgrounds and shapes. OOXML angles are in
 * 60000ths of a degree and stop positions in 1000ths of a percent.
 */
function gradientOf(node: Element | null, theme: Record<string, string>): Gradient | undefined {
  if (!node) return undefined
  const stops = all(node, "a:gs")
    .map((gs) => ({
      pos: Number(gs.getAttribute("pos") ?? 0) / 1000,
      color: colorOf(gs, theme, "#ffffff")!,
    }))
    .sort((a, b) => a.pos - b.pos)
  if (stops.length < 2) return undefined
  const angle = Number(first(node, "a:lin")?.getAttribute("ang") ?? 0) / 60000
  return { type: "linear", rotate: Math.round(angle), stops }
}

/**
 * `a:outerShdw` states a distance and a direction; the editor stores the offset already
 * resolved onto screen axes. Blur and distance arrive in EMU, so both go through the
 * deck scale rather than a fixed constant — the same reason type does.
 */
function shadowOf(
  spPr: Element | null,
  theme: Record<string, string>,
  scale: number,
): Shadow | undefined {
  const shadow = spPr ? first(spPr, "a:outerShdw") : null
  if (!shadow) return undefined
  const distance = Number(shadow.getAttribute("dist") ?? 0) * scale
  const direction = (Number(shadow.getAttribute("dir") ?? 0) / 60000) * (Math.PI / 180)
  return {
    h: Math.round(Math.cos(direction) * distance * 10) / 10,
    v: Math.round(Math.sin(direction) * distance * 10) / 10,
    blur: Math.round(Number(shadow.getAttribute("blurRad") ?? 0) * scale * 10) / 10,
    color: colorOf(shadow, theme, "rgba(0,0,0,0.35)")!,
  }
}

function readOutline(spPr: Element | null, theme: Record<string, string>) {
  const ln = spPr ? first(spPr, "a:ln") : null
  if (!ln || first(ln, "a:noFill")) return undefined
  const color = colorOf(first(ln, "a:solidFill"), theme)
  if (!color) return undefined
  const widthEmu = Number(ln.getAttribute("w") ?? 0)
  const dash = first(ln, "a:prstDash")?.getAttribute("val") ?? "solid"
  return {
    style: (dash.includes("dot") ? "dotted" : dash.includes("dash") ? "dashed" : "solid") as
      | "solid"
      | "dashed"
      | "dotted",
    width: Math.max(1, Math.round(widthEmu / EMU_PER_POINT)),
    color,
  }
}

function readLink(node: Element, ctx: Ctx) {
  const click = first(node, "a:hlinkClick")
  const id = click?.getAttribute("r:id")
  if (!id) return undefined
  const target = ctx.rels.get(id)?.target
  if (!target || !/^https?:|^mailto:/i.test(target)) return undefined
  return { type: "web" as const, target }
}

function verticalOf(body: Element | null): AlignVertical {
  const anchor = body ? first(body, "a:bodyPr")?.getAttribute("anchor") : null
  return anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top"
}

/**
 * `wrap="none"` means PowerPoint sized the box to the text and the text must not reflow.
 * Anything else — including the attribute being absent, where the default is "square" —
 * wraps as normal.
 */
function wrapsOf(body: Element | null): boolean {
  return (body ? first(body, "a:bodyPr")?.getAttribute("wrap") : null) !== "none"
}

interface ParsedText {
  html: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  align: AlignHorizontal
  fontFamily?: string
  /** already converted to a CSS multiplier; see `lineHeightOf` */
  lineHeight: number
}

/**
 * Builds a CSS font stack from the run's per-script faces.
 *
 * PPTX names fonts by script: `a:latin` for Latin text, `a:ea` for East Asian. A Chinese
 * deck routinely sets both — Arial Black for a headline's Latin, SimHei for its Chinese —
 * and reading only the Latin one dropped every Chinese face in the file, flattening decks
 * that used 黑体 / 宋体 / 楷体 to separate heading from body into a single fallback.
 *
 * A CSS list says the same thing OOXML does: the browser resolves it per character, so
 * Latin first and East Asian second reproduces the pairing rather than picking a winner.
 * Theme references (`+mj-lt`, `+mn-lt`) are skipped — they are placeholders, not families,
 * and would otherwise be emitted as a font name that resolves to nothing.
 */
function fontStackOf(rPr: Element): string | null {
  const faces = ["a:latin", "a:ea"]
    .map((tag) => first(rPr, tag)?.getAttribute("typeface"))
    .filter((face): face is string => !!face && !face.startsWith("+"))
  const unique = [...new Set(faces)]
  if (!unique.length) return null
  return [...unique.map((face) => `'${face}'`), "sans-serif"].join(", ")
}

/**
 * Rebuilds paragraphs as the editor's HTML, keeping per-run bold / colour / size.
 *
 * `scale` is the deck's own EMU-to-canvas ratio, and type has to be converted with it
 * for the same reason every box is: a point is a fixed 12700 EMU, so how many canvas
 * pixels it comes to depends entirely on how wide the source slide is. Converting type
 * with a constant instead silently assumes a 10in slide — right for the old 4:3 decks,
 * 33% too large for the 13.333in widescreen that every modern deck uses, which is enough
 * to make imported headings wrap and collide with whatever sits below them.
 */
function readParagraphs(
  body: Element,
  theme: Record<string, string>,
  scale: number,
): ParsedText {
  /** PPTX stores `sz` in hundredths of a point. */
  const pxOf = (sz: number) => (sz / 100) * EMU_PER_POINT * scale
  const paragraphs = all(body, "a:p")
  const blocks: string[] = []
  let fontSize = 0
  let color = ""
  let bold = false
  let italic = false
  let align: AlignHorizontal = "left"
  let fontFamily: string | undefined
  let lineHeight: number | undefined
  let first_ = true

  for (const paragraph of paragraphs) {
    const pPr = first(paragraph, "a:pPr")
    const algn = pPr?.getAttribute("algn")
    const lnSpc = pPr ? first(pPr, "a:lnSpc") : null
    const runs: string[] = []

    for (const run of all(paragraph, "a:r")) {
      const text = all(run, "a:t").map((t) => t.textContent ?? "").join("")
      if (!text) continue
      const rPr = first(run, "a:rPr")
      const size = Number(rPr?.getAttribute("sz") ?? 0)
      const runBold = rPr?.getAttribute("b") === "1"
      const runItalic = rPr?.getAttribute("i") === "1"
      const runUnderline = (rPr?.getAttribute("u") ?? "none") !== "none"
      const runColor = colorOf(rPr ? first(rPr, "a:solidFill") : null, theme)
      const face = rPr ? fontStackOf(rPr) : null

      if (first_) {
        // the first run sets the element-level defaults
        if (size) fontSize = pxOf(size)
        if (runColor) color = runColor
        bold = runBold
        italic = runItalic
        if (algn) align = alignOf(algn)
        if (face) fontFamily = face
        first_ = false
      }

      const styles: string[] = []
      if (size && Math.abs(pxOf(size) - fontSize) > 0.5) {
        styles.push(`font-size:${Math.round(pxOf(size))}px`)
      }
      if (runColor && runColor !== color) styles.push(`color:${runColor}`)
      if (runBold !== bold) styles.push(`font-weight:${runBold ? 700 : 400}`)
      if (runItalic !== italic) styles.push(`font-style:${runItalic ? "italic" : "normal"}`)
      if (runUnderline) styles.push("text-decoration:underline")

      const escaped = escapeHtml(text)
      runs.push(styles.length ? `<span style="${styles.join(";")}">${escaped}</span>` : escaped)
    }

    // line spacing is a paragraph property but the element carries only one, so the
    // first paragraph that states one wins — the same rule the size and colour above
    // already follow. It is read after the runs because a fixed spacing is only
    // meaningful next to the size it was set against.
    if (lineHeight === undefined && lnSpc)
      lineHeight = lineHeightOf(lnSpc, fontSize, pxOf, singleLineFactor(fontFamily ?? DEFAULT_THEME.fontFamily))

    if (runs.length) blocks.push(`<div>${runs.join("")}</div>`)
    else if (blocks.length) blocks.push("<div><br></div>")
  }

  return {
    html: blocks.join(""),
    fontSize: fontSize || 18,
    color: color || "#111827",
    bold,
    italic,
    align,
    fontFamily,
    lineHeight: lineHeight ?? singleLineFactor(fontFamily ?? DEFAULT_THEME.fontFamily),
  }
}

/**
 * `a:lnSpc` comes in two flavours. `spcPct` is a percentage of single spacing, so it
 * needs the factor above. `spcPts` is an absolute height in points, which only becomes a
 * CSS multiplier once divided by the size it applies to — both are converted through the
 * same deck scale, so it reduces to a plain points-over-points ratio.
 */
function lineHeightOf(
  lnSpc: Element,
  fontSize: number,
  pxOf: (v: number) => number,
  single: number,
): number | undefined {
  const pct = Number(first(lnSpc, "a:spcPct")?.getAttribute("val") ?? 0)
  if (pct > 0) return (pct / 100000) * single

  const pts = Number(first(lnSpc, "a:spcPts")?.getAttribute("val") ?? 0)
  if (pts > 0 && fontSize > 0) return pxOf(pts) / fontSize

  return undefined
}

const alignOf = (value: string): AlignHorizontal =>
  value === "ctr" ? "center" : value === "r" ? "right" : value === "just" ? "justify" : "left"

function readPicture(
  node: Element,
  ctx: Ctx,
  parent?: GroupTransform,
  groupId?: string,
): SlideElement | null {
  const embed = first(node, "a:blip")?.getAttribute("r:embed")
  const src = embed ? resolveImage(embed, ctx) : undefined
  if (!src) return null

  const place = placementOf(node, ctx, parent)
  const crop = first(node, "a:srcRect")
  const clip = crop
    ? {
        range: [
          [pct(crop.getAttribute("l")), pct(crop.getAttribute("t"))],
          [1 - pct(crop.getAttribute("r")), 1 - pct(crop.getAttribute("b"))],
        ] as [[number, number], [number, number]],
      }
    : undefined

  return {
    ...createImageElement(src, place.width, place.height, {
      ...boxOf(place),
      rotate: place.rotate,
      flipH: place.flipH,
      flipV: place.flipV,
      clip,
    }),
    groupId,
    link: readLink(node, ctx),
  }
}

const pct = (value: string | null) => {
  const parsed = Number(value ?? 0) / 100000
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0
}

function readConnector(
  node: Element,
  ctx: Ctx,
  parent?: GroupTransform,
  groupId?: string,
): SlideElement | null {
  const place = placementOf(node, ctx, parent)
  const outline = readOutline(first(node, "p:spPr"), ctx.theme)
  const ln = first(node, "a:ln")
  const hasHead = !!(ln && first(ln, "a:headEnd")?.getAttribute("type") === "triangle")
  const hasTail = !!(ln && first(ln, "a:tailEnd")?.getAttribute("type") === "triangle")

  // flips tell us which way round the two endpoints sit inside the bounding box
  const start: [number, number] = [place.flipH ? place.width : 0, place.flipV ? place.height : 0]
  const end: [number, number] = [place.flipH ? 0 : place.width, place.flipV ? 0 : place.height]

  return {
    ...createLineElement({
      ...boxOf(place),
      start,
      end,
      color: outline?.color ?? "#111827",
      style: outline?.style ?? "solid",
      strokeWidth: outline?.width ?? 2,
      startCap: hasHead ? "arrow" : "none",
      endCap: hasTail ? "arrow" : "none",
    }),
    groupId,
  }
}

function readGraphicFrame(
  node: Element,
  ctx: Ctx,
  parent?: GroupTransform,
  groupId?: string,
): SlideElement[] {
  const place = placementOf(node, ctx, parent)
  const table = first(node, "a:tbl")
  if (table) {
    const element = readTable(table, place, ctx.theme, groupId)
    return element ? [element] : []
  }
  // The frame carries position and size; the series live in a chart part that was read up
  // front, keyed by the relationship this frame points at.
  const uri = first(node, "a:graphicData")?.getAttribute("uri") ?? ""
  if (!uri.includes("/chart")) return []

  const relId = first(node, "c:chart")?.getAttribute("r:id")
  const spec = relId ? ctx.charts.get(relId) : undefined
  return [
    {
      ...createChartElement({
        ...boxOf(place),
        ...(spec && {
          chartType: spec.chartType,
          data: spec.data,
          showLegend: spec.showLegend,
        }),
      }),
      groupId,
    },
  ]
}

function readTable(
  table: Element,
  place: Placement,
  theme: Record<string, string>,
  groupId?: string,
): SlideElement | null {
  const gridCols = all(table, "a:gridCol")
  const rowNodes = all(table, "a:tr")
  if (!gridCols.length || !rowNodes.length) return null

  const widths = gridCols.map((col) => Number(col.getAttribute("w") ?? 1))
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) || 1

  const rows: TableCell[][] = rowNodes.map((tr) =>
    children(tr, "a:tc").map((tc) => {
      const text = all(tc, "a:t").map((t) => t.textContent ?? "").join("")
      const fill = colorOf(first(tc, "a:solidFill"), theme)
      return createTableCell(text, {
        colspan: Number(tc.getAttribute("gridSpan") ?? 1),
        rowspan: Number(tc.getAttribute("rowSpan") ?? 1),
        merged: tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1",
        fill,
      })
    }),
  )

  // pad ragged rows so the renderer can assume a rectangular grid
  const columns = gridCols.length
  for (const row of rows) {
    while (row.length < columns) row.push(createTableCell(""))
  }

  return {
    ...createTableElement(rows.length, columns, {
      ...boxOf(place),
      rotate: place.rotate,
      rows,
      colWidths: widths.map((w) => w / totalWidth),
    }),
    groupId,
  }
}

export const __testing = { EMU_PER_INCH, alignOf, pct }
