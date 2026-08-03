import { z } from "zod"
import {
  createChartElement,
  createFormulaElement,
  createImageElement,
  createLineElement,
  createShapeElement,
  createTableCell,
  createTableElement,
  createTextElement,
} from "@/lib/factory"
import { SHAPE_LIST } from "@/lib/shapes"
import { toStoredHtml } from "./text"
import type { SlideElement, TableCell } from "@/types/slides"

/**
 * The element vocabulary an agent writes in.
 *
 * Deliberately not a mirror of `SlideElement`. That type carries everything the editor
 * needs to render and everything the exporter needs to emit — `path`, `viewBox`, filter
 * matrices, per-cell spans — and asking a model to supply them is asking it to get them
 * wrong. What is here is the part that is a *decision*: where the thing goes, what it
 * says, what colour it is. Every other field comes from the same factory the editor's own
 * insert buttons use, so an agent's slide and a person's slide are the same shape.
 *
 * Video and audio are absent. They are a file to upload rather than a value to write, and
 * nothing in this round moves bytes.
 */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const colour = z.string().regex(HEX, "colour must be a hex value like #1E293B")

/**
 * Images arrive as a reference, and a reference is a URL the editor will put in `src`.
 * `javascript:` and friends are refused here rather than downstream: this is the only
 * point where a machine-supplied string becomes an attribute in a document a person will
 * open.
 */
const imageSource = z
  .string()
  .refine(
    (value) => /^https?:\/\//i.test(value) || /^data:image\/[a-z+]+;base64,/i.test(value),
    "src must be an http(s) URL or a data:image/… base64 URI",
  )

/**
 * Position and size, in the deck's own 1000 × 562.5 coordinate space.
 *
 * Required rather than defaulted. The factory centres anything it is not told about, which
 * is the right answer for a person clicking "insert" and the wrong one for a model writing
 * six elements in a row — they would land in a stack. Making the model say where things go
 * is the difference between a layout and a pile.
 */
const geometry = {
  left: z.number(),
  top: z.number(),
  width: z.number().positive(),
  height: z.number().min(0),
  rotate: z.number().min(-360).max(360).optional(),
  name: z.string().max(80).optional(),
}

const align = z.enum(["left", "center", "right", "justify"])
const vertical = z.enum(["top", "middle", "bottom"])

const textElement = z.object({
  type: z.literal("text"),
  ...geometry,
  /** plain text — see `toStoredHtml`; newlines become line breaks, markup does not */
  text: z.string().max(20_000),
  fontFamily: z.string().max(80).optional(),
  fontSize: z.number().min(4).max(400).optional(),
  color: colour.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  align: align.optional(),
  vertical: vertical.optional(),
  lineHeight: z.number().min(0.5).max(5).optional(),
  fill: colour.optional(),
})

const SHAPE_KEYS = SHAPE_LIST.map((shape) => shape.key) as [string, ...string[]]

const shapeElement = z.object({
  type: z.literal("shape"),
  ...geometry,
  shapeKey: z.enum(SHAPE_KEYS),
  fill: colour.optional(),
  /** plain text centred in the shape */
  text: z.string().max(2_000).optional(),
  textColor: colour.optional(),
  fontSize: z.number().min(4).max(400).optional(),
  textAlign: align.optional(),
})

const imageElement = z.object({
  type: z.literal("image"),
  ...geometry,
  src: imageSource,
  /** corner radius in canvas units */
  radius: z.number().min(0).optional(),
})

const lineElement = z.object({
  type: z.literal("line"),
  ...geometry,
  /** both ends are relative to `left`/`top`, the way the editor stores them */
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  color: colour.optional(),
  strokeWidth: z.number().min(0.5).max(60).optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  startCap: z.enum(["none", "arrow", "dot"]).optional(),
  endCap: z.enum(["none", "arrow", "dot"]).optional(),
})

const tableElement = z.object({
  type: z.literal("table"),
  ...geometry,
  /** row-major, including the header row when there is one; ragged rows are padded */
  rows: z.array(z.array(z.string().max(2_000))).min(1).max(50),
  /** style the first row as a header */
  header: z.boolean().optional(),
  fontSize: z.number().min(4).max(200).optional(),
  themeColor: colour.optional(),
})

const chartElement = z.object({
  type: z.literal("chart"),
  ...geometry,
  chartType: z.enum(["bar", "column", "line", "area", "scatter", "pie", "doughnut", "radar"]),
  categories: z.array(z.string().max(200)).min(1).max(100),
  series: z
    .array(z.object({ name: z.string().max(200), values: z.array(z.number()) }))
    .min(1)
    .max(20),
  showLegend: z.boolean().optional(),
  showValue: z.boolean().optional(),
  themeColors: z.array(colour).min(1).max(12).optional(),
})

const formulaElement = z.object({
  type: z.literal("formula"),
  ...geometry,
  latex: z.string().max(4_000),
  color: colour.optional(),
})

export const elementSpec = z.discriminatedUnion("type", [
  textElement,
  shapeElement,
  imageElement,
  lineElement,
  tableElement,
  chartElement,
  formulaElement,
])

export type ElementSpec = z.infer<typeof elementSpec>

/** The geometry every variant carries, in the shape the element types want it. */
function box(spec: { left: number; top: number; width: number; height: number; rotate?: number; name?: string }) {
  return {
    left: spec.left,
    top: spec.top,
    width: spec.width,
    height: spec.height,
    rotate: spec.rotate ?? 0,
    name: spec.name ?? "",
  }
}

/** Pad ragged rows so every row is as wide as the widest — the editor assumes a rectangle. */
function rectangular(rows: string[][]): TableCell[][] {
  const columns = Math.max(...rows.map((row) => row.length), 1)
  return rows.map((row) =>
    Array.from({ length: columns }, (_, index) => createTableCell(row[index] ?? "")),
  )
}

/** One validated spec as the element the editor and the exporter both understand. */
export function buildElement(spec: ElementSpec): SlideElement {
  switch (spec.type) {
    case "text":
      return createTextElement({
        ...box(spec),
        content: toStoredHtml(spec.text),
        ...(spec.fontFamily === undefined ? {} : { fontFamily: spec.fontFamily }),
        ...(spec.fontSize === undefined ? {} : { fontSize: spec.fontSize }),
        ...(spec.color === undefined ? {} : { color: spec.color }),
        ...(spec.bold === undefined ? {} : { bold: spec.bold }),
        ...(spec.italic === undefined ? {} : { italic: spec.italic }),
        ...(spec.underline === undefined ? {} : { underline: spec.underline }),
        ...(spec.align === undefined ? {} : { align: spec.align }),
        ...(spec.vertical === undefined ? {} : { vertical: spec.vertical }),
        ...(spec.lineHeight === undefined ? {} : { lineHeight: spec.lineHeight }),
        ...(spec.fill === undefined ? {} : { fill: spec.fill }),
      })

    case "shape": {
      const base = createShapeElement(spec.shapeKey, box(spec))
      return {
        ...base,
        ...(spec.fill === undefined ? {} : { fill: spec.fill }),
        text: {
          ...base.text,
          content: spec.text === undefined ? "" : toStoredHtml(spec.text),
          ...(spec.textColor === undefined ? {} : { color: spec.textColor }),
          ...(spec.fontSize === undefined ? {} : { fontSize: spec.fontSize }),
          ...(spec.textAlign === undefined ? {} : { align: spec.textAlign }),
        },
      }
    }

    case "image":
      return createImageElement(spec.src, spec.width, spec.height, {
        ...box(spec),
        ...(spec.radius === undefined ? {} : { radius: spec.radius }),
      })

    case "line":
      return createLineElement({
        ...box(spec),
        start: spec.start,
        end: spec.end,
        ...(spec.color === undefined ? {} : { color: spec.color }),
        ...(spec.strokeWidth === undefined ? {} : { strokeWidth: spec.strokeWidth }),
        ...(spec.style === undefined ? {} : { style: spec.style }),
        ...(spec.startCap === undefined ? {} : { startCap: spec.startCap }),
        ...(spec.endCap === undefined ? {} : { endCap: spec.endCap }),
      })

    case "table": {
      const rows = rectangular(spec.rows)
      const columns = rows[0].length
      const base = createTableElement(rows.length, columns, box(spec))
      return {
        ...base,
        rows,
        colWidths: Array.from({ length: columns }, () => 1 / columns),
        ...(spec.fontSize === undefined ? {} : { fontSize: spec.fontSize }),
        theme: {
          ...base.theme,
          rowHeader: spec.header ?? true,
          ...(spec.themeColor === undefined ? {} : { color: spec.themeColor }),
        },
      }
    }

    case "chart": {
      const base = createChartElement(box(spec))
      return {
        ...base,
        chartType: spec.chartType,
        data: { categories: spec.categories, series: spec.series },
        ...(spec.showLegend === undefined ? {} : { showLegend: spec.showLegend }),
        ...(spec.showValue === undefined ? {} : { showValue: spec.showValue }),
        ...(spec.themeColors === undefined ? {} : { themeColors: spec.themeColors }),
      }
    }

    case "formula":
      return createFormulaElement({
        ...box(spec),
        latex: spec.latex,
        ...(spec.color === undefined ? {} : { color: spec.color }),
      })
  }
}
