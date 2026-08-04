import type JSZip from "jszip"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { MAX_DECK_BYTES } from "./deck-schema"
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
import { cssAngle } from "./ooxml-fill"
import { escapeHtml } from "./sanitize"
import { fallbackTranslate, type Translate } from "./i18n/translate"
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
/**
 * Presets the registry does not draw itself, sent to the nearest one that it does. A
 * source shape only lands here when no entry in `SHAPE_LIST` claims its preset, so the
 * table shrinks as the registry grows — and every alias is a shape that comes back out of
 * the round trip as something slightly different from what went in, which is the reason to
 * prefer adding a preset over adding a line here.
 */
const PRESET_ALIASES: Record<string, string> = {
  round2SameRect: "roundRect",
  round2DiagRect: "roundRect",
  snip2SameRect: "snip1Rect",
  snip2DiagRect: "snip1Rect",
  snipRoundRect: "round1Rect",
  mathPlus: "cross",
  star10: "star8",
  star12: "star8",
  star16: "star8",
  star24: "star8",
  star32: "star8",
  wedgeRoundRectCallout: "callout",
  borderCallout1: "callout",
  borderCallout2: "callout",
  borderCallout3: "callout",
  accentCallout1: "callout",
  cloudCallout: "cloud",
  flowChartAlternateProcess: "roundRect",
  flowChartPredefinedProcess: "flowChartProcess",
  flowChartInternalStorage: "flowChartProcess",
  flowChartManualOperation: "trapezoid",
  flowChartManualInput: "parallelogram",
  flowChartMagneticDisk: "cylinder",
  flowChartMagneticDrum: "cylinder",
  flowChartOffpageConnector: "flowChartDocument",
  flowChartMerge: "triangle",
  flowChartExtract: "triangle",
  flowChartSort: "diamond",
  flowChartOr: "flowChartConnector",
  flowChartSummingJunction: "flowChartConnector",
  flowChartDelay: "flowChartTerminator",
  flowChartDisplay: "flowChartTerminator",
  flowChartPunchedTape: "flowChartDocument",
  actionButtonBlank: "rect",
  rightArrowCallout: "arrowRight",
  leftArrowCallout: "arrowLeft",
  upArrowCallout: "arrowUp",
  downArrowCallout: "arrowDown",
  stripedRightArrow: "arrowRight",
  curvedRightArrow: "arrowRight",
  curvedLeftArrow: "arrowLeft",
  curvedUpArrow: "arrowUp",
  curvedDownArrow: "arrowDown",
  bentUpArrow: "bentArrow",
  uturnArrow: "bentArrow",
  leftUpArrow: "quadArrow",
  quadArrowCallout: "quadArrow",
  leftRightUpArrow: "quadArrow",
  halfFrame: "frame",
  corner: "frame",
  bevel: "plaque",
  can: "cylinder",
  cube: "rect",
  blockArc: "donut",
  chord: "pie",
  arc: "pie",
  noSmoking: "donut",
  irregularSeal1: "star8",
  irregularSeal2: "star8",
  seal: "star8",
  mathMultiply: "cross",
  diagStripe: "rightTriangle",
}

interface ChartSpec {
  chartType: ChartType
  data: ChartData
  showLegend: boolean
  /** per-series colours, present when the source states at least one */
  colors?: string[]
}

interface ThemeInfo {
  /** scheme colour name -> hex, read from the deck's own theme */
  colors: Record<string, string>
  /** `a:fillStyleLst` and `a:bgFillStyleLst`, which `p:bgRef` indexes into */
  fills: { fill: Element[]; bg: Element[] }
  /** `mj-lt` / `mn-ea` / … -> family, which a `+`-prefixed typeface names */
  fonts: Record<string, string>
}

interface Ctx {
  t: Translate
  /** EMU -> canvas units, uniform so the slide keeps its aspect ratio */
  scale: number
  offsetX: number
  offsetY: number
  /** relationship id -> resolved value (data URI for media, url for hyperlinks) */
  rels: Map<string, { type: string; target: string }>
  media: Map<string, string>
  theme: Record<string, string>
  themeFills: ThemeInfo["fills"]
  themeFonts: Record<string, string>
  /** relationship id -> parsed chart, preloaded because the shape walk is synchronous */
  charts: Map<string, ChartSpec>
}

/**
 * A .pptx is an untrusted archive: every number in it is attacker-controlled, and the
 * whole thing is decoded in the reader's own tab. These are the ceilings that keep a
 * malformed or hostile file from taking the tab down with it.
 */
/**
 * The archive itself, held to the same ceiling as the document it becomes. A .pptx is
 * already compressed, so one at the limit unpacks to more than the limit — but the media
 * budget below is what actually bounds the result, and refusing the file up front is the
 * only refusal that can happen before anything has been decoded.
 */
const MAX_PPTX_BYTES = MAX_DECK_BYTES
const MAX_SLIDES = 500
/**
 * Total decoded media. Each image also becomes a base64 data URI, which is ~4/3 of this —
 * so this is what decides whether the imported deck can be saved at all, and it is set
 * against `MAX_DECK_BYTES` with room left over for the text, geometry and structure that
 * share the document with it.
 */
const MAX_MEDIA_BYTES = Math.floor((MAX_DECK_BYTES * 0.9 * 3) / 4)
/** Cached chart points are addressed by `idx`; a sparse array is only cheap while it is small. */
const MAX_CHART_POINTS = 4096

export async function importPptx(file: File, t: Translate = fallbackTranslate): Promise<Deck> {
  if (file.size > MAX_PPTX_BYTES) {
    throw new Error(t("error.pptxTooLarge", { limit: formatBytes(MAX_PPTX_BYTES) }))
  }

  const { default: JSZipCtor } = await import("jszip")
  const zip = await JSZipCtor.loadAsync(file)

  const presentation = await readXml(zip, "ppt/presentation.xml")
  if (!presentation) throw new Error(t("error.pptxInvalid"))

  const sldSz = first(presentation, "p:sldSz")
  const cx = Number(sldSz?.getAttribute("cx")) || 12192000
  const cy = Number(sldSz?.getAttribute("cy")) || 6858000
  const scale = Math.min(VIEWPORT_WIDTH / cx, VIEWPORT_HEIGHT / cy)
  const offsetX = (VIEWPORT_WIDTH - cx * scale) / 2
  const offsetY = (VIEWPORT_HEIGHT - cy * scale) / 2

  const media = await readMedia(zip)
  const slidePaths = (await resolveSlideOrder(zip, presentation)).slice(0, MAX_SLIDES)
  if (!slidePaths.length) throw new Error(t("error.pptxNoSlides"))

  const base = { t, scale, offsetX, offsetY, media }
  const themeCache = new Map<string, ThemeInfo>()
  const templateCache = new Map<string, Template>()

  const slides: Slide[] = []
  const budget = { media: MAX_MEDIA_BYTES }
  for (const path of slidePaths) {
    const xml = await readXml(zip, path)
    if (!xml) continue
    const ctx = await contextFor(zip, path, base, themeCache)
    const template = await resolveTemplate(zip, path, xml, base, themeCache, templateCache)
    slides.push({
      ...createSlide(),
      id: newId(),
      background: readBackground(xml, ctx) ?? template.background,
      elements: [
        ...backdropOf(template, budget),
        ...readShapeTree(first(xml, "p:cSld") ?? xml, ctx),
      ],
      notes: await readNotes(zip, path),
    })
  }

  return {
    version: 1,
    title: file.name.replace(/\.pptx$/i, "") || t("deck.imported"),
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

/**
 * Formats a browser will actually paint. EMF and WMF are common in decks authored on
 * Windows and used to be carried through as `image/emf` / `image/wmf`, which no browser
 * renders — the import "succeeded" and produced a slide of broken-image icons. Leaving
 * them out drops the picture, which at least looks like something missing rather than
 * something corrupt.
 */
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
}

/**
 * Every embedded image, inlined as a data URI so the deck stays self-contained.
 *
 * Bounded in total, not per file: the deck this builds has to fit through a 25MB save,
 * and decoding an unbounded archive into base64 in the reader's tab is a way to be handed
 * an out-of-memory crash by a file someone emailed them.
 */
async function readMedia(zip: JSZip): Promise<Map<string, string>> {
  const media = new Map<string, string>()
  const entries = zip.file(/^ppt\/media\//)
  let budget = MAX_MEDIA_BYTES
  for (const entry of entries) {
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
    const mime = MIME[ext]
    if (!mime) continue
    const base64 = await entry.async("base64")
    // base64 carries 3 bytes per 4 characters
    const bytes = Math.floor((base64.length * 3) / 4)
    if (bytes > budget) continue
    budget -= bytes
    media.set(entry.name.split("/").pop()!, `data:${mime};base64,${base64}`)
  }
  return media
}

const UNITS = ["B", "KB", "MB", "GB"]

export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${Math.round(value * 10) / 10}${UNITS[unit]}`
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
  partPath: string,
  cache: Map<string, ThemeInfo>,
): Promise<ThemeInfo> {
  const themePath = (await findThemePath(zip, partPath)) ?? "ppt/theme/theme1.xml"
  const cached = cache.get(themePath)
  if (cached) return cached

  const xml = await readXml(zip, themePath)
  const fmt = xml ? first(xml, "a:fmtScheme") : null
  const parsed: ThemeInfo = {
    colors: { ...STOCK_SCHEME, ...readClrScheme(xml) },
    fills: {
      fill: fmt ? Array.from(first(fmt, "a:fillStyleLst")?.children ?? []) : [],
      bg: fmt ? Array.from(first(fmt, "a:bgFillStyleLst")?.children ?? []) : [],
    },
    fonts: readFontScheme(xml),
  }
  cache.set(themePath, parsed)
  return parsed
}

/**
 * The theme's two font pairs, keyed the way a typeface reference names them.
 *
 * A run does not have to name a family: it can point at the theme with `+mn-ea` ("the
 * minor — i.e. body — East Asian font"), and Chinese decks do this constantly, because it
 * is how one theme change restyles the whole deck. Those references were being dropped as
 * unresolvable, so 400-odd runs in a deck like this lost their face and fell back to the
 * app default — the single biggest reason an imported Chinese deck looks nothing like the
 * original even when every size and colour is right.
 */
function readFontScheme(xml: Element | null): Record<string, string> {
  const scheme = xml ? first(xml, "a:fontScheme") : null
  if (!scheme) return {}

  const fonts: Record<string, string> = {}
  for (const [prefix, tag] of [
    ["mj", "a:majorFont"],
    ["mn", "a:minorFont"],
  ] as const) {
    const node = first(scheme, tag)
    if (!node) continue
    for (const [suffix, child] of [
      ["lt", "a:latin"],
      ["ea", "a:ea"],
      ["cs", "a:cs"],
    ] as const) {
      const face = children(node, child)[0]?.getAttribute("typeface")
      // the theme writes `typeface=""` for a slot it does not set
      if (face) fonts[`${prefix}-${suffix}`] = face
    }
  }
  return fonts
}

/**
 * A theme is reached the same way from anywhere in the chain, so this walks whichever
 * link the part in hand has: a slide points at its layout, a layout at its master, a
 * master at the theme itself.
 */
async function findThemePath(zip: JSZip, partPath: string): Promise<string | null> {
  let path: string | null = partPath
  for (let hop = 0; path && hop < 4; hop += 1) {
    const rels: Map<string, { type: string; target: string }> = await readRels(zip, path)
    const values = [...rels.values()]
    const theme = values.find((rel) => rel.type === "theme")
    if (theme) return normalizePath(theme.target)
    const next = values.find((rel) => rel.type === "slideMaster" || rel.type === "slideLayout")
    path = next ? normalizePath(next.target) : null
  }
  return null
}

function readClrScheme(xml: Element | null): Record<string, string> {
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
  t: Translate,
  theme: Record<string, string>,
): Promise<Map<string, ChartSpec>> {
  const charts = new Map<string, ChartSpec>()
  for (const [id, rel] of rels) {
    if (rel.type !== "chart") continue
    const path = normalizePath(rel.target)
    const xml = await readXml(zip, path)
    if (!xml) continue
    // a chart may carry its own colour scheme in a themeOverride part; without it the
    // series painted accent1/2/3 resolve against the slide's theme and come out wrong
    const chartRels = await readRels(zip, path)
    const override = [...chartRels.values()].find((r) => r.type === "themeOverride")
    const overrideXml = override ? await readXml(zip, normalizePath(override.target)) : null
    const colors = overrideXml ? { ...theme, ...readClrScheme(overrideXml) } : theme
    const spec = readChart(xml, t, colors)
    if (spec) charts.set(id, spec)
  }
  return charts
}

/**
 * The colour a series is painted with. A solid fill is itself; a gradient is represented
 * by its most saturated stop (the last one, the way Office authors them); a line series
 * keeps its colour on the outline rather than the fill.
 */
function seriesColor(ser: Element, theme: Record<string, string>): string | undefined {
  const spPr = first(ser, "c:spPr")
  if (!spPr) return undefined

  const solid = children(spPr, "a:solidFill")[0]
  if (solid) return colorOf(solid, theme)

  const grad = children(spPr, "a:gradFill")[0]
  if (grad) {
    const stops = all(grad, "a:gs").sort(
      (a, b) => Number(a.getAttribute("pos") ?? 0) - Number(b.getAttribute("pos") ?? 0),
    )
    const last = stops[stops.length - 1]
    return last ? colorOf(last, theme) : undefined
  }

  const ln = children(spPr, "a:ln")[0]
  const lnFill = ln ? children(ln, "a:solidFill")[0] : null
  return lnFill ? colorOf(lnFill, theme) : undefined
}

function readChart(
  xml: Element,
  t: Translate,
  theme: Record<string, string> = STOCK_SCHEME,
): ChartSpec | null {
  const plot = first(xml, "c:plotArea")
  if (!plot) return null

  const match = CHART_TAGS.find(({ tag }) => first(plot, tag))
  if (!match) return null
  const node = first(plot, match.tag)!

  // a horizontal bar chart is the same element with barDir="bar"
  const barDir = first(node, "c:barDir")?.getAttribute("val")
  const chartType = match.type === "column" && barDir === "bar" ? "bar" : match.type

  let categories: string[] = []
  const colors: (string | undefined)[] = []
  const series = children(node, "c:ser").map((ser, index) => {
    const name =
      first(first(ser, "c:tx") ?? ser, "c:v")?.textContent?.trim() ||
      t("chart.series", { n: index + 1 })

    const cats = cachedPoints(first(ser, "c:cat"))
    if (cats.length > categories.length) categories = cats

    colors[index] = seriesColor(ser, theme)

    const values = cachedPoints(first(ser, "c:val") ?? first(ser, "c:yVal")).map((v) => {
      const parsed = Number(v)
      return Number.isFinite(parsed) ? parsed : 0
    })
    return { name, values }
  })

  if (!series.length) return null
  if (!categories.length) {
    categories = series[0].values.map((_, i) => t("chart.category", { n: i + 1 }))
  }

  return {
    chartType,
    data: { categories, series },
    showLegend: !!first(xml, "c:legend"),
    // only carried when the source states at least one series colour; a chart that says
    // nothing keeps the editor's own palette
    colors: colors.some(Boolean)
      ? colors.map((c, i) => c ?? DEFAULT_THEME.themeColors[i % DEFAULT_THEME.themeColors.length])
      : undefined,
  }
}

/**
 * Cached values keep their index, so a sparse `c:pt` list still lines up with its
 * categories.
 *
 * `idx` comes out of the file, so it is clamped. Writing straight to `values[idx]` made
 * `<c:pt idx="999999999">` allocate a billion-slot array on the next `Array.from`, which
 * is a crashed tab from a single attribute in a file the reader only meant to open.
 */
function cachedPoints(container: Element | null): string[] {
  if (!container) return []
  const points = all(container, "c:pt")
  if (!points.length) return []
  const values: string[] = []
  for (const point of points) {
    const raw = Number(point.getAttribute("idx") ?? values.length)
    const index =
      Number.isInteger(raw) && raw >= 0 && raw < MAX_CHART_POINTS ? raw : values.length
    if (index >= MAX_CHART_POINTS) break
    values[index] = first(point, "c:v")?.textContent ?? ""
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
  phClr?: string,
): string | undefined {
  if (!node) return fallback
  const srgb = first(node, "a:srgbClr")
  if (srgb) return shaded(`#${srgb.getAttribute("val")}`, srgb)
  const scheme = first(node, "a:schemeClr")
  if (scheme) {
    const name = scheme.getAttribute("val") ?? ""
    // `phClr` is the placeholder a theme fill style leaves for whoever references it
    const base = name === "phClr" ? phClr : theme[name]
    return shaded(base ?? fallback ?? "#000000", scheme)
  }
  const sys = first(node, "a:sysClr")
  if (sys) return shaded(`#${sys.getAttribute("lastClr") ?? "000000"}`, sys)
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

/**
 * A colour slot is a base colour plus a list of transforms, and decks lean on them hard:
 * a template picks one accent and derives its whole palette with `lumMod` / `shade`, so
 * a reader that takes the base and drops the transforms paints a dozen distinct tones as
 * the same flat swatch — the divider that was meant to be a 15% grey comes out pure white
 * and disappears.
 *
 * Transforms apply in document order, which matters: `lumMod` then `lumOff` is the
 * standard "85% of the luminance, then add 15%" pair and reversing them is a different
 * colour.
 */
function shaded(hex: string, node: Element): string {
  // the overwhelming majority of colour slots carry no transform at all; returning the
  // literal keeps them byte-identical to the file rather than round-tripping through RGB
  if (!node.children.length) return hex

  let [r, g, b] = channelsOf(hex)
  let alpha = 1

  for (const child of Array.from(node.children)) {
    const value = Number(child.getAttribute("val") ?? 0) / 100000
    if (!Number.isFinite(value)) continue
    switch (child.tagName) {
      // shade darkens towards black, tint lightens towards white
      case "a:shade":
        ;[r, g, b] = [r * value, g * value, b * value]
        break
      case "a:tint":
        ;[r, g, b] = [r, g, b].map((c) => c * value + 255 * (1 - value)) as [number, number, number]
        break
      case "a:lumMod":
      case "a:lumOff":
      case "a:satMod": {
        const [h, s, l] = toHsl(r, g, b)
        const next =
          child.tagName === "a:lumMod"
            ? ([h, s, l * value] as const)
            : child.tagName === "a:lumOff"
              ? ([h, s, l + value] as const)
              : ([h, s * value, l] as const)
        ;[r, g, b] = fromHsl(next[0], clamp01(next[1]), clamp01(next[2]))
        break
      }
      case "a:alpha":
        alpha = clamp01(value)
        break
    }
  }

  const [rr, gg, bb] = [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))))
  if (alpha >= 1) return `#${[rr, gg, bb].map((c) => c.toString(16).padStart(2, "0")).join("")}`
  return `rgba(${rr}, ${gg}, ${bb}, ${Math.round(alpha * 100) / 100})`
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function channelsOf(hex: string): [number, number, number] {
  const value = hex.replace("#", "")
  const wide = value.length >= 6
  const at = (i: number) =>
    wide ? parseInt(value.slice(i * 2, i * 2 + 2), 16) : parseInt(value[i] ?? "0", 16) * 17
  const parsed = [at(0), at(1), at(2)]
  return parsed.every(Number.isFinite) ? (parsed as [number, number, number]) : [0, 0, 0]
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6
  return [h, s, l]
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const shifted = (t + 1) % 1
    if (shifted < 1 / 6) return p + (q - p) * 6 * shifted
    if (shifted < 1 / 2) return q
    if (shifted < 2 / 3) return p + (q - p) * (2 / 3 - shifted) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

// ---------------------------------------------------------------- slide content

/**
 * Returns null when the part states no background at all, which is the normal case for a
 * slide: the answer lives further up the chain and the caller keeps looking.
 */
function readBackground(xml: Element, ctx: Ctx): SlideBackground | null {
  const theme = ctx.theme
  const bg = first(xml, "p:bg")
  if (!bg) return null

  const blip = first(bg, "a:blip")
  const embed = blip?.getAttribute("r:embed")
  if (embed) {
    const image = resolveImage(embed, ctx)
    if (image) return { type: "image", color: "#ffffff", image, imageSize: "cover" }
  }

  // `p:bgRef` names one of the theme's background fill styles and supplies the colour it
  // was authored to be recoloured with
  const ref = first(bg, "p:bgRef")
  if (ref) {
    const phClr = colorOf(ref, theme, "#ffffff")
    const style = themeBackgroundFill(ctx, ref.getAttribute("idx"))
    const gradient = style ? gradientOf(first(style, "a:gradFill") ?? style, theme, phClr) : undefined
    if (gradient) return { type: "gradient", color: gradient.stops[0].color, gradient }
    return { type: "solid", color: colorOf(style, theme, phClr, phClr) ?? phClr! }
  }

  const gradient = gradientOf(first(bg, "a:gradFill"), theme)
  if (gradient) return { type: "gradient", color: gradient.stops[0].color, gradient }

  const solid = first(bg, "a:solidFill")
  return { type: "solid", color: colorOf(solid, theme, "#ffffff")! }
}

/** `idx` is 1-based into `fillStyleLst` below 1000 and into `bgFillStyleLst` above it. */
function themeBackgroundFill(ctx: Ctx, idx: string | null): Element | null {
  const index = Number(idx ?? 0)
  if (!Number.isInteger(index) || index < 1) return null
  const list = ctx.themeFills[index >= 1000 ? "bg" : "fill"]
  return list[index >= 1000 ? index - 1001 : index - 1] ?? null
}

// ---------------------------------------------------------------- layout and master

/** What a slide inherits from the layout and master it was built on. */
interface Template {
  background: SlideBackground
  /** master shapes first, then the layout's — the order PowerPoint paints them in */
  elements: SlideElement[]
  /** decoded size of the pictures above, so repeating them across slides stays bounded */
  bytes: number
}

const BLANK: SlideBackground = { type: "solid", color: "#ffffff" }

async function contextFor(
  zip: JSZip,
  path: string,
  base: Omit<Ctx, "rels" | "theme" | "themeFills" | "themeFonts" | "charts">,
  themeCache: Map<string, ThemeInfo>,
): Promise<Ctx> {
  const rels = await readRels(zip, path)
  const theme = await resolveTheme(zip, path, themeCache)
  return {
    ...base,
    rels,
    theme: theme.colors,
    themeFills: theme.fills,
    themeFonts: theme.fonts,
    charts: await readCharts(zip, rels, base.t, theme.colors),
  }
}

/**
 * A slide is only the top layer of what PowerPoint draws. Underneath sit the layout's
 * shapes and, under those, the master's — and the background belongs to the first of the
 * three that states one.
 *
 * Reading the slide alone is what made an imported deck arrive stripped: templates keep
 * the photograph behind every page, the header band, the footer rule and the page-number
 * chip on the master, so a themed deck lost its entire visual identity and came back as
 * black text floating on white. Worse, decks that set white type against a dark master
 * background imported as white-on-white — the text was there, and invisible.
 *
 * Placeholders are deliberately left behind. On a layout they hold prompt text ("Click to
 * edit Master title style") that PowerPoint never paints, and the real content is already
 * on the slide.
 */
async function resolveTemplate(
  zip: JSZip,
  slidePath: string,
  slideXml: Element,
  base: Omit<Ctx, "rels" | "theme" | "themeFills" | "themeFonts" | "charts">,
  themeCache: Map<string, ThemeInfo>,
  cache: Map<string, Template>,
): Promise<Template> {
  const layoutPath = await linkedPart(zip, slidePath, "slideLayout")
  if (!layoutPath) return { background: BLANK, elements: [], bytes: 0 }

  // `showMasterSp` is the slide's own switch, so it belongs in the key rather than the
  // layout's identity
  const inheritsMaster = slideXml.getAttribute("showMasterSp") !== "0"
  const key = `${layoutPath}|${inheritsMaster}`
  const cached = cache.get(key)
  if (cached) return cached

  const layoutXml = await readXml(zip, layoutPath)
  const layoutCtx = await contextFor(zip, layoutPath, base, themeCache)
  const masterPath = await linkedPart(zip, layoutPath, "slideMaster")
  const masterXml = masterPath ? await readXml(zip, masterPath) : null
  const masterCtx = masterPath ? await contextFor(zip, masterPath, base, themeCache) : null

  const elements: SlideElement[] = []
  const showMaster =
    inheritsMaster && (!layoutXml || layoutXml.getAttribute("showMasterSp") !== "0")
  if (showMaster && masterXml && masterCtx) {
    elements.push(...readShapeTree(first(masterXml, "p:cSld") ?? masterXml, masterCtx, undefined, undefined, true))
  }
  if (layoutXml) {
    elements.push(...readShapeTree(first(layoutXml, "p:cSld") ?? layoutXml, layoutCtx, undefined, undefined, true))
  }

  const template: Template = {
    background:
      (layoutXml && readBackground(layoutXml, layoutCtx)) ??
      (masterXml && masterCtx ? readBackground(masterXml, masterCtx) : null) ??
      BLANK,
    elements,
    bytes: elements.reduce(
      (sum, el) => sum + (el.type === "image" ? Math.floor((el.src.length * 3) / 4) : 0),
      0,
    ),
  }
  cache.set(key, template)
  return template
}

async function linkedPart(zip: JSZip, path: string, type: string): Promise<string | null> {
  const rels = await readRels(zip, path)
  const rel = [...rels.values()].find((r) => r.type === type)
  return rel ? normalizePath(rel.target) : null
}

/**
 * How much of the slide an element has to cover before it is locked on the way in.
 *
 * Only a backdrop earns it. Locking every template shape — which is what this used to do —
 * meant more than half of an imported deck refused to move or open: on a typical slide of
 * this one, eleven of sixteen elements, and among them the company name, the tagline and
 * the header band, all of which read as ordinary slide content to whoever opens the file.
 * The reason for locking never applied to those: it is that a full-bleed image sitting at
 * the bottom of the z-order swallows every click meant for empty canvas, and a logo in the
 * corner swallows nothing.
 */
const BACKDROP_COVERAGE = 0.9

/**
 * The template's shapes, copied onto one slide.
 *
 * The pictures among them repeat on every slide that shares the layout, which is the one
 * way this import can multiply its input — so their decoded size draws down a budget, and
 * once it is gone later slides keep the drawn furniture and drop the imagery rather than
 * growing a deck no browser can hold.
 */
function backdropOf(template: Template, budget: { media: number }): SlideElement[] {
  const withImages = template.bytes <= budget.media
  if (withImages) budget.media -= template.bytes

  const slideArea = VIEWPORT_WIDTH * VIEWPORT_HEIGHT
  const groups = new Map<string, string>()
  const elements: SlideElement[] = []
  for (const el of template.elements) {
    if (!withImages && el.type === "image") continue
    if (el.groupId && !groups.has(el.groupId)) groups.set(el.groupId, newId())
    elements.push({
      ...el,
      id: newId(),
      lock: el.width * el.height >= slideArea * BACKDROP_COVERAGE,
      ...(el.groupId ? { groupId: groups.get(el.groupId) } : {}),
    })
  }
  return elements
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
  /** the extent still in EMU — custom geometry is authored against it */
  cx: number
  cy: number
}

function placementOf(node: Element, ctx: Ctx, parent?: GroupTransform): Placement {
  // Shapes carry `a:xfrm`; a `p:graphicFrame` — every table and chart in a deck — states
  // the same thing as `p:xfrm`. Reading only the first left frames with no offset and no
  // extent at all, so each one landed in the top-left corner at the 1-unit floor below:
  // a table collapsed to a black hairline down the edge of the slide.
  const xfrm = first(node, "a:xfrm") ?? first(node, "p:xfrm")
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
    cx,
    cy,
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

function readShapeTree(
  root: Element,
  ctx: Ctx,
  parent?: GroupTransform,
  groupId?: string,
  /** reading a layout or master, where placeholders are prompts rather than content */
  template = false,
): SlideElement[] {
  const tree = first(root, "p:spTree") ?? root
  const elements: SlideElement[] = []

  for (const node of Array.from(tree.children)) {
    switch (node.tagName) {
      case "p:sp": {
        if (template && first(node, "p:ph")) break
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
        elements.push(...readShapeTree(node, ctx, groupTransformOf(node, parent), id, template))
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
  const paragraphs = body ? readParagraphs(body, ctx.theme, ctx.scale, ctx.themeFonts) : null
  const hasText = !!paragraphs?.html

  const { fill, gradient } = fillOf(node, spPr, ctx.theme)

  // A plain rectangle with text and no fill of its own is a text box, not a shape —
  // PowerPoint also marks most of them with txBox="1".
  //
  // "No fill of its own" has to mean the fill the shape actually resolves to, not just
  // the one written inside `spPr`. A bar chart drawn by hand is a column of rectangles
  // that take their colour from `p:style`, each labelled with its value; judging them on
  // `spPr` alone called every one a text box and threw the bars away, leaving the labels
  // floating over an empty slide.
  const declaredTextBox = first(node, "p:cNvSpPr")?.getAttribute("txBox") === "1"
  const painted = (!!fill && fill !== "transparent") || !!gradient
  const isTextBox =
    hasText && (declaredTextBox || ((preset === "" || preset === "rect") && !painted))

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
        letterSpacing: paragraphs!.letterSpacing,
        ...(paddingOf(body, ctx.scale) === undefined ? {} : { padding: paddingOf(body, ctx.scale) }),
        // only carried when the source forbids wrapping, so decks that say nothing keep
        // the editor's own default rather than gaining a field that means "unset"
        ...(wrapsOf(body) ? {} : { wrap: false }),
      }),
      groupId,
      link,
    }
  }

  const geometry = geometryOf(node, preset, place)
  const shadow = shadowOf(spPr, ctx.theme, ctx.scale)
  const outline = readOutline(node, spPr, ctx.theme)

  return {
    ...createShapeElement(geometry.key, {
      ...boxOf(place),
      rotate: place.rotate,
      shapeKey: geometry.key,
      path: geometry.path,
      viewBox: geometry.viewBox,
      fill: fill ?? gradient?.stops[0].color ?? "transparent",
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

/** Custom geometry is drawn with a key of its own, so export rasterises it instead of
 * guessing a preset that does not exist. */
const CUSTOM_KEY = "custom"

/** Every shape path in this editor is authored inside a 200 x 200 box. */
const PATH_BOX = 200

function geometryOf(node: Element, preset: string, place: Placement) {
  const custom = first(node, "a:custGeom")
  const path = custom ? customPath(custom, place) : null
  if (path) return { key: CUSTOM_KEY, path, viewBox: PATH_BOX }

  const key = KEY_BY_PRESET.get(preset) ?? PRESET_ALIASES[preset] ?? "rect"
  const def = SHAPE_MAP.get(key)!
  return { key, path: def.path, viewBox: def.viewBox }
}

/**
 * `a:custGeom` into an SVG path.
 *
 * The two describe the same thing in almost the same words — a subpath list of moves,
 * lines and béziers — so the conversion is mostly renaming. What it is not is optional:
 * a deck that draws its ribbons, chevrons and callouts as custom geometry (WPS and
 * Keynote both export that way for anything the preset list does not cover) previously
 * fell through to `rect`, and every one of those became an opaque coloured block sitting
 * over the slide.
 *
 * Coordinates are stated in the path's own `w` x `h` space, or in EMU against the shape's
 * extent when the path does not give one; either way they are normalised into the 200-unit
 * box the renderer stretches over the element.
 */
function customPath(custom: Element, place: Placement): string | null {
  const paths = all(custom, "a:path")
  if (!paths.length) return null

  const commands: string[] = []
  for (const path of paths) {
    const w = Number(path.getAttribute("w")) || place.cx || 1
    const h = Number(path.getAttribute("h")) || place.cy || 1
    const sx = PATH_BOX / w
    const sy = PATH_BOX / h
    const round = (value: number) => Math.round(value * 100) / 100
    /** the pen, in path space, so `arcTo` can work out where its ellipse is centred */
    let penX = 0
    let penY = 0
    const point = (pt: Element) => {
      penX = Number(pt.getAttribute("x") ?? 0)
      penY = Number(pt.getAttribute("y") ?? 0)
      return `${round(penX * sx)} ${round(penY * sy)}`
    }

    for (const step of Array.from(path.children)) {
      const pts = children(step, "a:pt")
      switch (step.tagName) {
        case "a:moveTo":
          if (pts[0]) commands.push(`M ${point(pts[0])}`)
          break
        case "a:lnTo":
          if (pts[0]) commands.push(`L ${point(pts[0])}`)
          break
        case "a:quadBezTo":
          if (pts.length >= 2) commands.push(`Q ${point(pts[0])} ${point(pts[1])}`)
          break
        case "a:cubicBezTo":
          if (pts.length >= 3)
            commands.push(`C ${point(pts[0])} ${point(pts[1])} ${point(pts[2])}`)
          break
        case "a:arcTo": {
          // OOXML states an arc as radii plus a start and swing angle measured from the
          // pen; SVG wants the far endpoint, so the ellipse centre has to be recovered.
          const rx = Number(step.getAttribute("wR") ?? 0)
          const ry = Number(step.getAttribute("hR") ?? 0)
          const start = (Number(step.getAttribute("stAng") ?? 0) / 60000) * (Math.PI / 180)
          const swing = (Number(step.getAttribute("swAng") ?? 0) / 60000) * (Math.PI / 180)
          const cxArc = penX - rx * Math.cos(start)
          const cyArc = penY - ry * Math.sin(start)
          penX = cxArc + rx * Math.cos(start + swing)
          penY = cyArc + ry * Math.sin(start + swing)
          const large = Math.abs(swing) > Math.PI ? 1 : 0
          const sweep = swing > 0 ? 1 : 0
          commands.push(
            `A ${round(rx * sx)} ${round(ry * sy)} 0 ${large} ${sweep} ` +
              `${round(penX * sx)} ${round(penY * sy)}`,
          )
          break
        }
        case "a:close":
          commands.push("Z")
          break
      }
    }
  }

  return commands.length > 1 ? commands.join(" ") : null
}

/**
 * The fill a shape paints, in the order OOXML resolves it: what `spPr` says, then what
 * the shape's `p:style` points at in the theme.
 *
 * Both halves used to be missing. `a:noFill` was read only to decide whether a rectangle
 * counted as a text box, so every unfilled circle and rounded frame — the ones a deck
 * uses as outlines around a photo, or as invisible hit targets — imported as an opaque
 * grey block. And the fill was looked up anywhere below `spPr`, which on a `noFill` shape
 * found the *outline's* colour instead and painted the shape with it.
 */
function fillOf(node: Element, spPr: Element | null, theme: Record<string, string>) {
  const scope = spPr ?? node
  if (children(scope, "a:noFill").length) return { fill: "transparent" }

  const solid = children(scope, "a:solidFill")[0]
  if (solid) return { fill: colorOf(solid, theme) }

  // gradients were only ever used to answer "is this filled at all", so a gradient shape
  // imported as the fallback grey and lost the fill it was drawn with
  const gradient = gradientOf(children(scope, "a:gradFill")[0] ?? null, theme)
  if (gradient) return { gradient }

  // a shape whose picture fill we cannot inline still has a shape's dimensions, so it is
  // left empty rather than blocking the slide with a placeholder colour
  if (children(scope, "a:blipFill").length || children(scope, "a:pattFill").length) {
    return { fill: "transparent" }
  }

  const ref = first(node, "p:style") ? first(first(node, "p:style")!, "a:fillRef") : null
  if (ref) {
    // idx 0 is the theme's "no fill" slot; the rest resolve to a theme fill whose colour
    // the reference itself supplies, which for the solid styles decks actually use is the
    // whole answer
    if (ref.getAttribute("idx") === "0") return { fill: "transparent" }
    return { fill: colorOf(ref, theme) }
  }

  return {}
}

/**
 * A linear gradient fill, shared by slide backgrounds and shapes. OOXML angles are in
 * 60000ths of a degree and stop positions in 1000ths of a percent.
 *
 * The angle is turned a quarter: the editor stores what CSS means, and CSS measures a
 * gradient clockwise from straight up while OOXML measures it clockwise from the positive
 * x axis. Carrying the OOXML number through unchanged made every imported gradient run
 * ninety degrees off from the deck it came from — invisible while gradients exported as a
 * flat average, and plainly wrong the moment they export as gradients again.
 */
function gradientOf(
  node: Element | null,
  theme: Record<string, string>,
  phClr?: string,
): Gradient | undefined {
  if (!node) return undefined
  const stops = all(node, "a:gs")
    .map((gs) => ({
      pos: Number(gs.getAttribute("pos") ?? 0) / 1000,
      color: colorOf(gs, theme, "#ffffff", phClr)!,
    }))
    .sort((a, b) => a.pos - b.pos)
  if (stops.length < 2) return undefined
  const isRadial = !!first(node, "a:path")
  const rotate = cssAngle(Number(first(node, "a:lin")?.getAttribute("ang") ?? 0))
  return { type: isRadial ? "radial" : "linear", rotate, stops }
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

function readOutline(node: Element, spPr: Element | null, theme: Record<string, string>) {
  const ln = spPr ? children(spPr, "a:ln")[0] : null
  if (ln && first(ln, "a:noFill")) return undefined

  // a shape that states no line of its own draws the one its `p:style` points at
  const style = first(node, "p:style")
  const lnRef = style ? first(style, "a:lnRef") : null
  if (!ln) {
    const color = lnRef && lnRef.getAttribute("idx") !== "0" ? colorOf(lnRef, theme) : undefined
    return color ? { style: "solid" as const, width: 1, color } : undefined
  }

  const color = colorOf(children(ln, "a:solidFill")[0] ?? null, theme) ?? colorOf(lnRef, theme)
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

/**
 * The text body's left inset, which is what the editor's single `padding` stands for.
 *
 * OOXML's default is 0.1in a side and the editor's default is close enough to it that
 * decks which say nothing look right. Decks that say `lIns="0"` are the problem: they
 * sized the box to exactly fit the line, so the 8 units of padding assumed on their
 * behalf pushed the last character onto a second line and left every tight label in the
 * deck broken across two rows.
 */
function paddingOf(body: Element | null, scale: number): number | undefined {
  const inset = body ? first(body, "a:bodyPr")?.getAttribute("lIns") : null
  if (inset === null || inset === undefined) return undefined
  const parsed = Number(inset)
  return Number.isFinite(parsed) ? Math.max(0, parsed * scale) : undefined
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
  letterSpacing: number
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
function fontStackOf(rPr: Element, fonts: Record<string, string> = {}): string | null {
  const faces = ["a:latin", "a:ea"]
    .map((tag) => first(rPr, tag)?.getAttribute("typeface"))
    .map((face) => {
      if (!face) return undefined
      // `+mj-lt` / `+mn-ea` point at the theme's major or minor pair rather than naming a
      // family; an unresolvable one is dropped, not emitted as a literal "+mn-ea"
      if (!face.startsWith("+")) return face
      return fonts[face.slice(1)]
    })
    .filter((face): face is string => !!face)
  const unique = [...new Set(faces)]
  if (!unique.length) return null
  return [...unique.map((face) => `'${face}'`), "sans-serif"].join(", ")
}

/**
 * Decks written in Office draw their manual bullets by switching a one-character run into
 * a symbol font: an "n" in Wingdings is the filled square ■, an "l" the filled circle ●.
 * No reader outside Office maps those fonts, so carrying the letter through verbatim
 * turned every bulleted list into lines prefixed with a bare "n".
 *
 * The run is translated to the Unicode character the glyph stands for — but only when
 * every non-space character in it maps. A run this table only half-covers keeps its
 * original text and font, which renders the glyph wherever the font exists and degrades
 * to a letter where it does not, rather than mixing the two in one run.
 */
const SYMBOL_MAPS: Record<string, Record<string, string>> = {
  wingdings: {
    J: "☺",
    L: "☹",
    l: "●",
    n: "■",
    o: "❑",
    u: "◆",
    v: "❖",
    w: "◈",
    "§": "▪",
    "¨": "□",
    "Ø": "➢",
    "à": "→",
    "è": "→",
    "û": "✗",
    "ü": "✓",
    "ý": "☒",
    "þ": "☑",
  },
  symbol: { "·": "•", "¾": "—" },
}

function decodeSymbolText(text: string, rPr: Element | null): string | null {
  if (!rPr) return null
  const map = ["a:latin", "a:ea", "a:sym"]
    .map((tag) => first(rPr, tag)?.getAttribute("typeface")?.toLowerCase())
    .map((face) => (face ? SYMBOL_MAPS[face] : undefined))
    .find(Boolean)
  if (!map) return null

  let out = ""
  for (const ch of text) {
    if (/\s/.test(ch)) {
      out += ch
      continue
    }
    // symbol glyphs are often stored in the U+F000 private-use block; fold them back
    const code = ch.codePointAt(0)!
    const folded =
      code >= 0xf000 && code <= 0xf0ff ? String.fromCharCode(code - 0xf000) : ch
    const mapped = map[folded]
    if (mapped === undefined) return null
    out += mapped
  }
  return out
}

/** Run properties a paragraph level's `a:defRPr` supplies when the run itself is silent. */
interface RunDefaults {
  size?: number
  bold?: boolean
  italic?: boolean
  color?: string
  face?: string
  spc?: number
  align?: string
}

/**
 * The defaults a text body's own `a:lstStyle` states, by outline level.
 *
 * Office and WPS routinely put the entire look of a title there — `<a:defRPr sz="2800"
 * b="1">` with a colour — and leave the run properties empty. Reading only the runs
 * imported those titles at the 18px fallback in the default colour, which is most of what
 * "the fonts are wrong" complaints look like.
 */
function listDefaults(
  body: Element,
  theme: Record<string, string>,
  fonts: Record<string, string>,
): (RunDefaults | undefined)[] {
  const lst = first(body, "a:lstStyle")
  if (!lst) return []

  const levels: (RunDefaults | undefined)[] = []
  for (let lvl = 0; lvl < 9; lvl += 1) {
    const pPr = first(lst, `a:lvl${lvl + 1}pPr`)
    if (!pPr) continue
    const defRPr = first(pPr, "a:defRPr")
    const defaults: RunDefaults = { align: pPr.getAttribute("algn") ?? undefined }
    if (defRPr) {
      const size = Number(defRPr.getAttribute("sz") ?? 0)
      if (size) defaults.size = size
      const bold = defRPr.getAttribute("b")
      if (bold !== null) defaults.bold = bold === "1"
      const italic = defRPr.getAttribute("i")
      if (italic !== null) defaults.italic = italic === "1"
      const spc = Number(defRPr.getAttribute("spc") ?? 0)
      if (spc) defaults.spc = spc
      defaults.color = colorOf(children(defRPr, "a:solidFill")[0] ?? null, theme)
      defaults.face = fontStackOf(defRPr, fonts) ?? undefined
    }
    levels[lvl] = defaults
  }
  return levels
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
  fonts: Record<string, string> = {},
): ParsedText {
  // `normAutofit` is PowerPoint recording that it already shrank this text to fit its box.
  // The sizes on the runs are the sizes before that shrink, so a body carrying
  // fontScale="25000" renders four times too large without it — the text overflows its
  // box and lands on whatever it was carefully placed above.
  const autofit = first(body, "a:normAutofit")
  const fontScale = ratio(autofit?.getAttribute("fontScale"), 1)
  const lineScale = 1 - ratio(autofit?.getAttribute("lnSpcReduction"), 0)

  /** PPTX stores `sz` in hundredths of a point. */
  const pxOf = (sz: number) => (sz / 100) * EMU_PER_POINT * scale * fontScale
  const paragraphs = all(body, "a:p")
  const blocks: string[] = []
  let fontSize = 0
  let color = ""
  let bold = false
  let italic = false
  let align: AlignHorizontal = "left"
  let fontFamily: string | undefined
  let lineHeight: number | undefined
  let letterSpacing = 0
  let first_ = true

  const defaults = listDefaults(body, theme, fonts)

  for (const paragraph of paragraphs) {
    const pPr = first(paragraph, "a:pPr")
    const rawLvl = Number(pPr?.getAttribute("lvl") ?? 0)
    const def = defaults[Number.isInteger(rawLvl) && rawLvl >= 0 && rawLvl < 9 ? rawLvl : 0]
    const algn = pPr?.getAttribute("algn") ?? def?.align
    const lnSpc = pPr ? first(pPr, "a:lnSpc") : null
    const runs: string[] = []

    for (const run of all(paragraph, "a:r")) {
      let text = all(run, "a:t").map((t) => t.textContent ?? "").join("")
      if (!text) continue
      const rPr = first(run, "a:rPr")
      const decoded = decodeSymbolText(text, rPr)
      if (decoded !== null) text = decoded
      const size = Number(rPr?.getAttribute("sz") ?? 0) || def?.size || 0
      const boldAttr = rPr?.getAttribute("b")
      const runBold = boldAttr != null ? boldAttr === "1" : def?.bold ?? false
      const italicAttr = rPr?.getAttribute("i")
      const runItalic = italicAttr != null ? italicAttr === "1" : def?.italic ?? false
      const runUnderline = (rPr?.getAttribute("u") ?? "none") !== "none"
      const runColor = colorOf(rPr ? first(rPr, "a:solidFill") : null, theme) ?? def?.color
      // a decoded bullet must not keep its symbol font — the mapped character would be
      // painted through the symbol font's own glyph table and come out as noise again
      const face =
        decoded !== null
          ? def?.face ?? null
          : (rPr ? fontStackOf(rPr, fonts) : null) ?? def?.face ?? null

      if (first_) {
        // the first run sets the element-level defaults
        if (size) fontSize = pxOf(size)
        if (runColor) color = runColor
        bold = runBold
        italic = runItalic
        if (algn) align = alignOf(algn)
        if (face) fontFamily = face
        // `spc` tightens or opens the tracking, in hundredths of a point like `sz`. Decks
        // use it to make a label fit its box exactly, so dropping it re-broke the line.
        const spc = Number(rPr?.getAttribute("spc") ?? 0) || def?.spc || 0
        if (spc) letterSpacing = pxOf(spc)
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
    lineHeight:
      (lineHeight ?? singleLineFactor(fontFamily ?? DEFAULT_THEME.fontFamily)) * lineScale,
    letterSpacing,
  }
}

/** A per-100000 attribute, which is how OOXML writes every proportion. */
function ratio(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value ?? NaN) / 100000
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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

const span = (value: string | null) => {
  const parsed = Number(value ?? 1)
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 1000) : 1
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
  const outline = readOutline(node, first(node, "p:spPr"), ctx.theme)
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
    const element = readTable(table, place, ctx.theme, ctx.scale, groupId)
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
          ...(spec.colors && { themeColors: spec.colors }),
        }),
      }),
      groupId,
    },
  ]
}

/**
 * The border a table draws, taken from the cells themselves.
 *
 * OOXML has no table-level border: every edge is stated per cell, on `a:tcPr` as `a:lnL`,
 * `a:lnR`, `a:lnT` and `a:lnB`. The editor's table carries one outline for the whole grid,
 * so the honest reduction — the one PPTist also makes — is to take the edge that appears
 * most often and let it stand for the table.
 *
 * Doing nothing was not neutral: the element kept the editor's own default, a 1px #d4d4d8
 * hairline, so every imported table came back in pale grey no matter what it was drawn
 * with. This deck rules its tables in solid black, and looked visibly washed out.
 */
function tableOutline(
  table: Element,
  theme: Record<string, string>,
): { style: "solid" | "dashed" | "dotted"; width: number; color: string } | undefined {
  const tally = new Map<string, { count: number; value: NonNullable<ReturnType<typeof tableOutline>> }>()

  for (const tcPr of all(table, "a:tcPr")) {
    for (const side of ["a:lnL", "a:lnR", "a:lnT", "a:lnB"]) {
      const ln = children(tcPr, side)[0]
      // an edge the author turned off is a real answer, but not one worth painting
      if (!ln || children(ln, "a:noFill").length) continue
      const color = colorOf(children(ln, "a:solidFill")[0] ?? null, theme)
      if (!color) continue

      const dash = first(ln, "a:prstDash")?.getAttribute("val") ?? "solid"
      const value = {
        style: (dash.includes("dot") ? "dotted" : dash.includes("dash") ? "dashed" : "solid") as
          | "solid"
          | "dashed"
          | "dotted",
        // sub-pixel rules still have to be drawn; a table ruled at 0.5pt reads as ruled,
        // and rounding it to zero would silently erase the grid
        width: Math.max(1, Math.round(Number(ln.getAttribute("w") ?? 0) / EMU_PER_POINT)),
        color,
      }
      const key = `${value.style}|${value.width}|${value.color}`
      const seen = tally.get(key)
      if (seen) seen.count += 1
      else tally.set(key, { count: 1, value })
    }
  }

  let best: { count: number; value: NonNullable<ReturnType<typeof tableOutline>> } | undefined
  for (const entry of tally.values()) if (!best || entry.count > best.count) best = entry
  return best?.value
}

function readTable(
  table: Element,
  place: Placement,
  theme: Record<string, string>,
  scale: number,
  groupId?: string,
): SlideElement | null {
  const gridCols = all(table, "a:gridCol")
  const rowNodes = all(table, "a:tr")
  if (!gridCols.length || !rowNodes.length) return null

  const widths = gridCols.map((col) => Number(col.getAttribute("w") ?? 1))
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) || 1

  const rows: TableCell[][] = rowNodes.map((tr) =>
    children(tr, "a:tc").map((tc) => {
      // paragraph per line, the way the cell was authored — flattening them glued every
      // multi-line cell into one unbroken string
      const text = all(tc, "a:p")
        .map((p) =>
          all(p, "a:r")
            .map((r) => {
              const runText = all(r, "a:t").map((t) => t.textContent ?? "").join("")
              return decodeSymbolText(runText, first(r, "a:rPr")) ?? runText
            })
            .join(""),
        )
        .join("\n")
        .replace(/\n+$/, "")

      // The cell's own fill lives in `a:tcPr`, and only there. Searching the whole cell
      // for a `a:solidFill` found the first one anywhere inside it — which for a cell with
      // no fill of its own is the colour of its *text*, so a table of black type imported
      // as a table of black blocks with the type invisible inside them.
      const tcPr = children(tc, "a:tcPr")[0] ?? null
      const fill = tcPr && !children(tcPr, "a:noFill").length
        ? colorOf(children(tcPr, "a:solidFill")[0] ?? null, theme)
        : undefined

      const rPr = first(tc, "a:rPr") ?? first(tc, "a:endParaRPr")
      const color = rPr ? colorOf(children(rPr, "a:solidFill")[0] ?? null, theme) : undefined
      const size = Number(rPr?.getAttribute("sz") ?? 0)

      return createTableCell(text, {
        // a span is a count, and a NaN one reaches React's `colSpan` and the export
        colspan: span(tc.getAttribute("gridSpan")),
        rowspan: span(tc.getAttribute("rowSpan")),
        merged: tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1",
        fill,
        color,
        ...(size ? { fontSize: (size / 100) * EMU_PER_POINT * scale } : {}),
        ...(rPr?.getAttribute("b") === "1" ? { bold: true } : {}),
        align: alignOf(first(tc, "a:pPr")?.getAttribute("algn") ?? "l"),
      })
    }),
  )

  // pad ragged rows so the renderer can assume a rectangular grid
  const columns = gridCols.length
  for (const row of rows) {
    while (row.length < columns) row.push(createTableCell(""))
  }

  // Cell insets and line spacing decide how tall the table really is. The source states
  // both — this deck squeezes six rows into the frame with 9842-EMU insets — and
  // rendering with the editor's roomier defaults instead inflated every imported table
  // far past its frame and onto whatever sat below it.
  const tcPr = first(table, "a:tcPr")
  const inset = (attr: string, fallback: number) => {
    const value = Number(tcPr?.getAttribute(attr) ?? NaN)
    return Number.isFinite(value) && value >= 0 ? value : fallback
  }
  const cellPadding: [number, number] = [
    Math.round(((inset("marT", 45720) + inset("marB", 45720)) / 2) * scale * 10) / 10,
    Math.round(((inset("marL", 91440) + inset("marR", 91440)) / 2) * scale * 10) / 10,
  ]
  const lnSpc = first(table, "a:lnSpc")
  const spcPct = lnSpc ? Number(first(lnSpc, "a:spcPct")?.getAttribute("val") ?? 0) : 0
  const lineHeight = Math.round((spcPct > 0 ? spcPct / 100000 : 1) * 1.2 * 100) / 100

  const firstSize = rows.flat().find((cell) => cell.fontSize)?.fontSize
  const outline = tableOutline(table, theme)

  const base = createTableElement(rows.length, columns)
  return {
    ...base,
    ...boxOf(place),
    rotate: place.rotate,
    rows,
    colWidths: widths.map((w) => w / totalWidth),
    // an imported table already carries whatever fills its author gave it; the editor's
    // own header tint and banding would paint rows the source deliberately left plain
    theme: { ...base.theme, rowHeader: false, banded: false },
    cellPadding,
    lineHeight,
    ...(firstSize ? { fontSize: Math.round(firstSize) } : {}),
    ...(outline ? { outline } : {}),
    groupId,
  }
}

export const __testing = { EMU_PER_INCH, alignOf, pct }
