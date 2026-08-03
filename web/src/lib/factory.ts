import { nanoid } from "nanoid"
import { DEFAULT_THEME, MIN_ELEMENT_SIZE, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { normalizeRotate } from "./geometry"
import { sanitizeHtml } from "./sanitize"
import { SHAPE_MAP, shapeKeyFromPath } from "./shapes"
import { fallbackTranslate, type Translate } from "./i18n/translate"
import type {
  ChartElement,
  Deck,
  ElementLink,
  FormulaElement,
  ImageElement,
  LineElement,
  MediaElement,
  ShapeElement,
  ShapeText,
  Slide,
  SlideElement,
  TableCell,
  TableElement,
  TextElement,
} from "@/types/slides"

export const newId = () => nanoid(10)

function defaultShapeText(overrides: Partial<ShapeText> = {}): ShapeText {
  return {
    content: "",
    fontFamily: DEFAULT_THEME.fontFamily,
    fontSize: 20,
    color: "#ffffff",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    align: "center",
    vertical: "middle",
    lineHeight: 1.4,
    ...overrides,
  }
}

export function createTextElement(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: newId(),
    type: "text",
    name: "",
    left: 100,
    top: 100,
    width: 400,
    height: 60,
    rotate: 0,
    // callers that create a text box for the user pass the localised prompt; the
    // factory itself stays language-free so nothing Chinese reaches a deck by default
    content: "",
    fontFamily: DEFAULT_THEME.fontFamily,
    fontSize: 24,
    color: DEFAULT_THEME.fontColor,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    align: "left",
    vertical: "top",
    lineHeight: 1.4,
    letterSpacing: 0,
    paragraphSpacing: 0,
    padding: 8,
    ...partial,
  }
}

export function createShapeElement(
  shapeKey: string,
  partial: Partial<ShapeElement> = {},
): ShapeElement {
  const def = SHAPE_MAP.get(shapeKey) ?? SHAPE_MAP.get("rect")!
  return {
    id: newId(),
    type: "shape",
    name: "",
    left: 100,
    top: 100,
    width: 200,
    height: 200,
    rotate: 0,
    shapeKey: def.key,
    path: def.path,
    viewBox: def.viewBox,
    fill: DEFAULT_THEME.themeColors[0],
    text: defaultShapeText(),
    ...partial,
  }
}

export function createImageElement(
  src: string,
  width: number,
  height: number,
  partial: Partial<ImageElement> = {},
): ImageElement {
  return {
    id: newId(),
    type: "image",
    name: "",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    src,
    fixedRatio: true,
    radius: 0,
    flipH: false,
    flipV: false,
    filter: { blur: 0, brightness: 100, contrast: 100, grayscale: 0, saturate: 100, sepia: 0 },
    ...partial,
  }
}

export function createLineElement(partial: Partial<LineElement> = {}): LineElement {
  return {
    id: newId(),
    type: "line",
    name: "",
    left: 100,
    top: 100,
    width: 200,
    height: 0,
    rotate: 0,
    start: [0, 0],
    end: [200, 0],
    color: "#111827",
    style: "solid",
    strokeWidth: 2,
    startCap: "none",
    endCap: "none",
    ...partial,
  }
}

export function createTableCell(text = "", partial: Partial<TableCell> = {}): TableCell {
  return { text, colspan: 1, rowspan: 1, ...partial }
}

export function createTableElement(
  rowCount = 3,
  colCount = 3,
  partial: Partial<TableElement> = {},
  t: Translate = fallbackTranslate,
): TableElement {
  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) =>
      createTableCell(r === 0 ? t("table.column", { n: c + 1 }) : ""),
    ),
  )
  const width = Math.min(700, colCount * 160)
  const height = rowCount * 44
  return {
    id: newId(),
    type: "table",
    name: "",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    colWidths: Array.from({ length: colCount }, () => 1 / colCount),
    rows,
    theme: { color: DEFAULT_THEME.themeColors[0], rowHeader: true, banded: true },
    outline: { style: "solid", width: 1, color: "#d4d4d8" },
    fontFamily: DEFAULT_THEME.fontFamily,
    fontSize: 16,
    ...partial,
  }
}

export function createChartElement(
  partial: Partial<ChartElement> = {},
  t: Translate = fallbackTranslate,
): ChartElement {
  const width = 520
  const height = 320
  return {
    id: newId(),
    type: "chart",
    name: "",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    chartType: "column",
    data: {
      categories: [
        t("chart.sampleQ1"),
        t("chart.sampleQ2"),
        t("chart.sampleQ3"),
        t("chart.sampleQ4"),
      ],
      series: [
        { name: t("chart.series", { n: 1 }), values: [32, 48, 40, 62] },
        { name: t("chart.series", { n: 2 }), values: [20, 30, 52, 38] },
      ],
    },
    themeColors: DEFAULT_THEME.themeColors,
    gridColor: "#e5e7eb",
    textColor: "#4b5563",
    showLegend: true,
    showGrid: true,
    showValue: false,
    ...partial,
  }
}

export function createMediaElement(
  type: "video" | "audio",
  src: string,
  partial: Partial<MediaElement> = {},
): MediaElement {
  const width = type === "video" ? 480 : 320
  const height = type === "video" ? 270 : 64
  return {
    id: newId(),
    type,
    name: "",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    src,
    autoplay: false,
    loop: false,
    ...partial,
  }
}

export function createFormulaElement(partial: Partial<FormulaElement> = {}): FormulaElement {
  const width = 300
  const height = 80
  return {
    id: newId(),
    type: "formula",
    name: "",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    latex: "E = mc^2",
    color: DEFAULT_THEME.fontColor,
    ...partial,
  }
}

export function createSlide(partial: Partial<Slide> = {}): Slide {
  return {
    id: newId(),
    elements: [],
    background: { type: "solid", color: "#ffffff" },
    notes: "",
    transition: "none",
    animations: [],
    ...partial,
  }
}

/**
 * Brings a deck read from disk or localStorage up to the current model: scrubs rich text,
 * backfills fields added after it was written, and clamps values the editor now relies on.
 */
export function normalizeDeck(raw: Deck, t: Translate = fallbackTranslate): Deck {
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).map((slide) => ({
    ...createSlide(),
    ...slide,
    id: slide.id || newId(),
    elements: (Array.isArray(slide.elements) ? slide.elements : [])
      .map((el) => normalizeElement(el))
      .filter((el): el is SlideElement => el !== null),
    animations: (Array.isArray(slide.animations) ? slide.animations : []).filter(
      (a) => a && a.elId,
    ),
  }))

  return {
    version: 1,
    title: typeof raw.title === "string" ? raw.title : t("deck.untitled"),
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: { ...DEFAULT_THEME, ...(raw.theme ?? {}) },
    slides: slides.length ? slides : createDeck(t).slides,
  }
}

/**
 * Names the factories used to stamp onto every element before element labels became a
 * render-time lookup. They are not something anyone typed — there has never been a UI for
 * naming an element — so a stored one is a fossil of the language the app shipped in, and
 * a deck built last year would otherwise keep showing Chinese in the layer panel of an
 * English reader forever. Clearing them lets the label resolve per render like a new
 * element's does.
 */
const LEGACY_NAMES = new Set([
  "文本", "图片", "形状", "线条", "表格", "图表", "视频", "音频", "公式", "手绘",
  "矩形", "圆角矩形", "椭圆", "三角形", "直角三角形", "菱形", "平行四边形", "梯形",
  "五边形", "六边形", "八边形", "五角星", "四角星", "六角星", "右箭头", "左箭头",
  "上箭头", "下箭头", "双向箭头", "V 形", "十字", "心形", "对话框", "云朵", "圆柱",
  "流程", "判断", "起止",
])

const ELEMENT_TYPES = new Set<string>([
  "text", "image", "shape", "line", "table", "chart", "video", "audio", "formula",
])

/** Only schemes a hyperlink may carry; anything else (`javascript:`, `data:`) is dropped. */
const SAFE_LINK = /^(https?:|mailto:|tel:)/i

const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const num = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

const legacyFreeName = (name: string) => (LEGACY_NAMES.has(name) ? "" : name.slice(0, 120))

function normalizeLink(value: unknown): ElementLink | undefined {
  // decks written before links were structured stored a bare url string
  if (typeof value === "string") {
    return SAFE_LINK.test(value.trim()) ? { type: "web", target: value.trim() } : undefined
  }
  const link = object(value)
  const target = text(link.target).trim()
  if (!target) return undefined
  if (link.type === "slide") return { type: "slide", target }
  return SAFE_LINK.test(target) ? { type: "web", target } : undefined
}

/**
 * Brings one element up to the current model. This is the only gate between untrusted
 * markup and `dangerouslySetInnerHTML`, so it is written to survive input that is not an
 * element at all: a deck arrives from storage, an import, a `.json` file or the system
 * clipboard, and none of those are the editor's own output just because they claim to be.
 *
 * Returns null for anything whose type is not one the renderer knows — `ElementView`
 * switches on it exhaustively and would render nothing while the element still occupied
 * the slide, the layer panel and the export.
 */
export function normalizeElement(raw: unknown): SlideElement | null {
  const source = object(raw)
  if (!ELEMENT_TYPES.has(text(source.type))) return null

  const base = {
    ...source,
    id: text(source.id) || newId(),
    name: legacyFreeName(text(source.name)),
    left: num(source.left, 0),
    top: num(source.top, 0),
    width: Math.max(MIN_ELEMENT_SIZE, num(source.width, 200)),
    height: Math.max(MIN_ELEMENT_SIZE, num(source.height, 100)),
    rotate: normalizeRotate(num(source.rotate, 0)),
    link: normalizeLink(source.link),
  } as SlideElement

  if (base.type === "text") {
    return { ...base, content: sanitizeHtml(text(base.content)) }
  }
  if (base.type === "shape") {
    const key = base.shapeKey ?? shapeKeyFromPath(base.path) ?? "rect"
    const def = SHAPE_MAP.get(key)
    const shapeText = object(base.text)
    return {
      ...base,
      // freehand and imported shapes carry a key with no preset behind it; keeping the key
      // is what lets export treat them as bespoke geometry instead of a rectangle
      shapeKey: def ? def.key : key,
      // keep any custom path that came from an import, otherwise re-derive
      path: text(base.path) || def?.path || SHAPE_MAP.get("rect")!.path,
      viewBox: num(base.viewBox, 0) || def?.viewBox || 200,
      text: {
        ...defaultShapeText(),
        ...shapeText,
        content: sanitizeHtml(text(shapeText.content)),
      },
    }
  }
  if (base.type === "table") {
    const rows = (Array.isArray(base.rows) ? base.rows : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => ({
        ...createTableCell(),
        ...object(cell),
        // cells are plain text; markup here would be rendered as text but still travels
        // into the export, so it is flattened rather than trusted
        text: text(object(cell).text),
      })),
    )
    const colCount = rows[0]?.length ?? 1
    const widths =
      base.colWidths?.length === colCount
        ? base.colWidths
        : Array.from({ length: colCount }, () => 1 / colCount)
    return { ...base, rows, colWidths: widths }
  }
  return base
}

/**
 * Elements arriving over the system clipboard. They carry the editor's own marker, but a
 * marker is not provenance — any page can put one on the clipboard — so they go through
 * the same gate a stored deck does, and get fresh ids because the originals may still be
 * on this slide.
 */
export function normalizeIncomingElements(value: unknown): SlideElement[] {
  if (!Array.isArray(value)) return []
  return value
    .map((candidate) => normalizeElement(candidate))
    .filter((el): el is SlideElement => el !== null)
    .map((el) => ({ ...el, id: newId() }))
}

export function createDeck(t: Translate = fallbackTranslate): Deck {
  const cover = createSlide({
    background: { type: "solid", color: "#0f172a" },
    elements: [
      createTextElement({
        content: t("deck.sampleTitle"),
        left: 100,
        top: 200,
        width: 800,
        height: 90,
        fontSize: 60,
        bold: true,
        color: "#ffffff",
        align: "center",
      }),
      createTextElement({
        content: t("deck.sampleSubtitle"),
        left: 100,
        top: 305,
        width: 800,
        height: 40,
        fontSize: 22,
        color: "#94a3b8",
        align: "center",
      }),
      createLineElement({
        left: 430,
        top: 290,
        width: 140,
        start: [0, 0],
        end: [140, 0],
        color: "#38bdf8",
        strokeWidth: 3,
      }),
    ],
  })

  const second = createSlide({
    elements: [
      createTextElement({
        content: t("deck.sampleHeading"),
        left: 70,
        top: 60,
        width: 500,
        height: 56,
        fontSize: 40,
        bold: true,
      }),
      createTextElement({
        content: t("deck.sampleBody"),
        left: 70,
        top: 150,
        width: 520,
        height: 140,
        fontSize: 20,
        lineHeight: 1.8,
        color: "#475569",
      }),
      createShapeElement("roundRect", {
        left: 640,
        top: 120,
        width: 290,
        height: 320,
        fill: "#2563eb",
        text: defaultShapeText({ content: t("deck.sampleShape"), fontSize: 22, bold: true }),
      }),
    ],
  })

  return {
    version: 1,
    title: t("deck.untitled"),
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: DEFAULT_THEME,
    slides: [cover, second],
  }
}
