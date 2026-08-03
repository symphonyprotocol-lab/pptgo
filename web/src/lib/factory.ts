import { nanoid } from "nanoid"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { normalizeRotate } from "./geometry"
import { sanitizeHtml } from "./sanitize"
import { SHAPE_MAP, shapeKeyFromPath } from "./shapes"
import type {
  ChartElement,
  Deck,
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
    name: "文本",
    left: 100,
    top: 100,
    width: 400,
    height: 60,
    rotate: 0,
    content: "双击编辑文字",
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
    name: def.label,
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
    name: "图片",
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
    name: "线条",
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
): TableElement {
  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) => createTableCell(r === 0 ? `列 ${c + 1}` : "")),
  )
  const width = Math.min(700, colCount * 160)
  const height = rowCount * 44
  return {
    id: newId(),
    type: "table",
    name: "表格",
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

export function createChartElement(partial: Partial<ChartElement> = {}): ChartElement {
  const width = 520
  const height = 320
  return {
    id: newId(),
    type: "chart",
    name: "图表",
    left: (VIEWPORT_WIDTH - width) / 2,
    top: (VIEWPORT_HEIGHT - height) / 2,
    width,
    height,
    rotate: 0,
    chartType: "column",
    data: {
      categories: ["一季度", "二季度", "三季度", "四季度"],
      series: [
        { name: "系列 1", values: [32, 48, 40, 62] },
        { name: "系列 2", values: [20, 30, 52, 38] },
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
    name: type === "video" ? "视频" : "音频",
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
    name: "公式",
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
export function normalizeDeck(raw: Deck): Deck {
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).map((slide) => ({
    ...createSlide(),
    ...slide,
    id: slide.id || newId(),
    elements: (Array.isArray(slide.elements) ? slide.elements : []).map(normalizeElement),
    animations: (slide.animations ?? []).filter((a) => a && a.elId),
  }))

  return {
    version: 1,
    title: typeof raw.title === "string" ? raw.title : "未命名演示文稿",
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: { ...DEFAULT_THEME, ...(raw.theme ?? {}) },
    slides: slides.length ? slides : createDeck().slides,
  }
}

function normalizeElement(el: SlideElement): SlideElement {
  const base = {
    ...el,
    id: el.id || newId(),
    rotate: normalizeRotate(Number(el.rotate) || 0),
    // decks written before links were structured stored a bare url string
    link:
      typeof (el as { link?: unknown }).link === "string"
        ? { type: "web" as const, target: (el as unknown as { link: string }).link }
        : el.link,
  }

  if (base.type === "text") {
    return { ...base, content: sanitizeHtml(base.content ?? "") }
  }
  if (base.type === "shape") {
    const key = base.shapeKey ?? shapeKeyFromPath(base.path) ?? "rect"
    const def = SHAPE_MAP.get(key)
    return {
      ...base,
      // freehand and imported shapes carry a key with no preset behind it; keeping the key
      // is what lets export treat them as bespoke geometry instead of a rectangle
      shapeKey: def ? def.key : key,
      // keep any custom path that came from an import, otherwise re-derive
      path: base.path || def?.path || SHAPE_MAP.get("rect")!.path,
      viewBox: base.viewBox || def?.viewBox || 200,
      text: { ...defaultShapeText(), ...base.text, content: sanitizeHtml(base.text?.content ?? "") },
    }
  }
  if (base.type === "table") {
    const rows = (base.rows ?? []).map((row) => row.map((cell) => ({ ...createTableCell(), ...cell })))
    const colCount = rows[0]?.length ?? 1
    const widths =
      base.colWidths?.length === colCount
        ? base.colWidths
        : Array.from({ length: colCount }, () => 1 / colCount)
    return { ...base, rows, colWidths: widths }
  }
  return base
}

export function createDeck(): Deck {
  const cover = createSlide({
    background: { type: "solid", color: "#0f172a" },
    elements: [
      createTextElement({
        content: "PPTGo 在线演示文稿",
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
        content: "浏览器里编辑幻灯片，导出为 PPTX",
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
        content: "从这里开始",
        left: 70,
        top: 60,
        width: 500,
        height: 56,
        fontSize: 40,
        bold: true,
      }),
      createTextElement({
        content:
          "左侧插入文字、形状、图片、表格和图表<br>拖拽移动，拉动控制点缩放，双击输入内容<br>右侧面板调整样式，顶部可撤销、播放和导出",
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
        text: defaultShapeText({ content: "形状也能写字", fontSize: 22, bold: true }),
      }),
    ],
  })

  return {
    version: 1,
    title: "未命名演示文稿",
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: DEFAULT_THEME,
    slides: [cover, second],
  }
}
