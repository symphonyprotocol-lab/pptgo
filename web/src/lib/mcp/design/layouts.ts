import { z } from "zod"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import {
  CONTENT_BOTTOM,
  CONTENT_HEIGHT,
  CONTENT_LEFT,
  CONTENT_TOP,
  CONTENT_WIDTH,
  GUTTER,
  MARGIN,
  MIN_READABLE,
  colLeft,
  estimateHeight,
  fitFontSize,
  mix,
  ramp,
  span,
  track,
} from "./tokens"
import type { ResolvedTheme } from "./themes"
import type { ElementSpec } from "../element-schema"

/**
 * Page types, as functions.
 *
 * ppt-master keeps its layouts as SVG files because its pipeline compiles SVG into
 * DrawingML. pptgo has no such step — an agent writes elements at coordinates — so a
 * layout here is not a file at all. It is `(content, theme) => elements`, and that turns
 * out to be the whole argument for doing this server-side: the model supplies the words
 * and the server supplies the arithmetic, which is the half the model cannot check because
 * it cannot see the result.
 *
 * Two rules everything below obeys. Nothing is placed outside the margins unless it is
 * deliberately full-bleed, and body text inside a panel uses `ink` rather than `muted` —
 * `muted` is calibrated for contrast against the page background, and a surface is not the
 * page background.
 *
 * What comes out is ordinary elements. The person who opens the deck afterwards drags them
 * around like anything else; a layout is a starting point, not a frame.
 */

export interface LayoutResult {
  elements: ElementSpec[]
  background: { type: "solid"; color: string }
}

// ── slot contracts ─────────────────────────────────────────────────────────────

const line = z.string().min(1).max(300)
const prose = z.string().min(1).max(1_200)
const optionalLine = z.string().max(300).optional()

const chartSlot = z.object({
  chartType: z.enum(["bar", "column", "line", "area", "scatter", "pie", "doughnut", "radar"]),
  categories: z.array(z.string().max(200)).min(1).max(100),
  series: z
    .array(z.object({ name: z.string().max(200), values: z.array(z.number()) }))
    .min(1)
    .max(20),
  showLegend: z.boolean().optional(),
  showValue: z.boolean().optional(),
})

const imageSlot = z
  .string()
  .refine(
    (value) => /^https?:\/\//i.test(value) || /^data:image\/[a-z+]+;base64,/i.test(value),
    "image must be an http(s) URL or a data:image/… base64 URI",
  )

const sideSlot = z.enum(["left", "right"]).optional()

export const layoutSpec = z.discriminatedUnion("layout", [
  z.object({
    layout: z.literal("cover"),
    title: line,
    subtitle: optionalLine,
    meta: optionalLine,
  }),
  z.object({
    layout: z.literal("agenda"),
    title: optionalLine,
    items: z.array(line).min(2).max(8),
  }),
  z.object({
    layout: z.literal("section"),
    title: line,
    number: z.string().max(8).optional(),
    kicker: optionalLine,
  }),
  z.object({
    layout: z.literal("statement"),
    text: z.string().min(1).max(400),
    attribution: optionalLine,
  }),
  z.object({
    layout: z.literal("bullets"),
    title: line,
    kicker: optionalLine,
    points: z.array(prose).min(1).max(6),
  }),
  z.object({
    layout: z.literal("two-column"),
    title: line,
    left: z.object({ heading: optionalLine, body: prose }),
    right: z.object({ heading: optionalLine, body: prose }),
  }),
  z.object({
    layout: z.literal("cards"),
    title: line,
    cards: z
      .array(z.object({ heading: line, body: z.string().max(500).optional() }))
      .min(2)
      .max(4),
  }),
  z.object({
    layout: z.literal("kpis"),
    title: optionalLine,
    kpis: z
      .array(z.object({ value: z.string().max(24), label: line, note: optionalLine }))
      .min(2)
      .max(4),
  }),
  z.object({
    layout: z.literal("chart-focus"),
    title: line,
    chart: chartSlot,
    takeaway: z.string().max(400).optional(),
  }),
  z.object({
    layout: z.literal("chart-plus-text"),
    title: line,
    chart: chartSlot,
    points: z.array(prose).min(1).max(5),
    side: sideSlot,
  }),
  z.object({
    layout: z.literal("image-full"),
    image: imageSlot,
    title: optionalLine,
    subtitle: optionalLine,
  }),
  z.object({
    layout: z.literal("image-split"),
    title: line,
    image: imageSlot,
    body: z.string().max(800).optional(),
    points: z.array(prose).max(4).optional(),
    side: sideSlot,
  }),
  z.object({
    layout: z.literal("timeline"),
    title: line,
    steps: z.array(z.object({ when: z.string().max(60), what: prose })).min(2).max(5),
  }),
  z.object({
    layout: z.literal("comparison"),
    title: line,
    left: z.object({ heading: line, points: z.array(prose).min(1).max(5) }),
    right: z.object({ heading: line, points: z.array(prose).min(1).max(5) }),
  }),
  z.object({
    layout: z.literal("matrix"),
    title: line,
    axes: z.object({ x: z.string().max(80), y: z.string().max(80) }),
    quadrants: z
      .array(z.object({ heading: line, body: z.string().max(300).optional() }))
      .length(4),
  }),
  z.object({
    layout: z.literal("table"),
    title: line,
    rows: z.array(z.array(z.string().max(500))).min(2).max(12),
    header: z.boolean().optional(),
    caption: optionalLine,
  }),
  z.object({
    layout: z.literal("quote"),
    text: z.string().min(1).max(500),
    attribution: optionalLine,
  }),
  z.object({
    layout: z.literal("closing"),
    title: line,
    subtitle: optionalLine,
    meta: optionalLine,
  }),
])

export type LayoutSpec = z.infer<typeof layoutSpec>
export type LayoutId = LayoutSpec["layout"]

/** What the catalogue tool prints, so a model can pick without guessing at slot names. */
export const LAYOUT_CATALOGUE: { layout: LayoutId; slots: string; use: string }[] = [
  { layout: "cover", slots: "title, subtitle?, meta?", use: "The first page. Title, one line of context, and who/when." },
  { layout: "agenda", slots: "title?, items[2-8]", use: "What the deck covers, numbered." },
  { layout: "section", slots: "title, number?, kicker?", use: "A divider between parts. A colour block carries the numeral." },
  { layout: "statement", slots: "text, attribution?", use: "One sentence at full size. The page that makes the argument." },
  { layout: "bullets", slots: "title, points[1-6], kicker?", use: "The workhorse. Over six points means two slides, not smaller type." },
  { layout: "two-column", slots: "title, left{heading?, body}, right{heading?, body}", use: "Two paragraphs that belong side by side." },
  { layout: "cards", slots: "title, cards[2-4]{heading, body?}", use: "Parallel items of equal weight — pillars, features, workstreams." },
  { layout: "kpis", slots: "title?, kpis[2-4]{value, label, note?}", use: "Numbers as the message. The figure is the largest thing on the page." },
  { layout: "chart-focus", slots: "title, chart, takeaway?", use: "One chart, full width, with the conclusion written under it." },
  { layout: "chart-plus-text", slots: "title, chart, points[1-5], side?", use: "A chart and the reading of it, side by side." },
  { layout: "image-full", slots: "image, title?, subtitle?", use: "Full-bleed picture with a caption plate along the bottom." },
  { layout: "image-split", slots: "title, image, body?, points[0-4]?, side?", use: "Half picture, half argument." },
  { layout: "timeline", slots: "title, steps[2-5]{when, what}", use: "A sequence in time, or a phased plan." },
  { layout: "comparison", slots: "title, left{heading, points[1-5]}, right{heading, points[1-5]}", use: "Before/after, us/them, option A/option B." },
  { layout: "matrix", slots: "title, axes{x, y}, quadrants[4]{heading, body?}", use: "A 2×2. Quadrants read top-left, top-right, bottom-left, bottom-right." },
  { layout: "table", slots: "title, rows[2-12][], header?, caption?", use: "A real table — rows stay editable data, not a picture." },
  { layout: "quote", slots: "text, attribution?", use: "Someone else's words, given the whole page." },
  { layout: "closing", slots: "title, subtitle?, meta?", use: "The last page. Thanks, the ask, or how to reach you." },
]

export const LAYOUT_IDS = LAYOUT_CATALOGUE.map((one) => one.layout) as [LayoutId, ...LayoutId[]]

// ── element builders ───────────────────────────────────────────────────────────

interface TextArgs {
  name: string
  left: number
  top: number
  width: number
  height: number
  text: string
  size: number
  color: string
  font?: string
  bold?: boolean
  italic?: boolean
  align?: "left" | "center" | "right" | "justify"
  vertical?: "top" | "middle" | "bottom"
  lineHeight?: number
  fill?: string
}

const textBox = (args: TextArgs): ElementSpec => ({
  type: "text",
  name: args.name,
  left: args.left,
  top: args.top,
  width: args.width,
  height: args.height,
  text: args.text,
  fontSize: Math.max(MIN_READABLE, Math.round(args.size)),
  color: args.color,
  ...(args.font ? { fontFamily: args.font } : {}),
  ...(args.bold ? { bold: true } : {}),
  ...(args.italic ? { italic: true } : {}),
  align: args.align ?? "left",
  vertical: args.vertical ?? "top",
  lineHeight: args.lineHeight ?? 1.4,
  ...(args.fill ? { fill: args.fill } : {}),
})

const plate = (
  name: string,
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
  radius: number,
): ElementSpec => ({
  type: "shape",
  name,
  shapeKey: radius > 0 ? "roundRect" : "rect",
  left,
  top,
  width,
  height,
  fill,
})

const rule = (
  name: string,
  left: number,
  top: number,
  length: number,
  color: string,
  width: number,
): ElementSpec => ({
  type: "line",
  name,
  left,
  top,
  width: length,
  height: 0,
  start: [0, 0],
  end: [length, 0],
  color,
  strokeWidth: Math.max(0.5, width),
})

/**
 * The header band every content page shares.
 *
 * Anchored to its bottom rather than its top: a title that wraps to two lines grows
 * upward into the space above it instead of pushing the body down, which is what keeps the
 * first line of content on the same baseline across a deck whose titles are not all the
 * same length.
 */
const TITLE_BOTTOM = 134
const TITLE_MAX = 74
const RULE_Y = 144

const KICKER_HEIGHT = 22

function header(theme: ResolvedTheme, title: string, kicker?: string): ElementSpec[] {
  /*
    A kicker takes its room off the top of the title's, not off the top margin.

    Growing the title upward is right until there is a line above it, at which point the
    line is the thing that would be pushed over the margin. So when a kicker is present the
    band is anchored from the top instead and the title gets what is left — which for a
    long title means one size smaller, and never means a caption sitting 5 units under the
    edge of the page.
  */
  const ceiling = kicker ? TITLE_BOTTOM - (MARGIN + KICKER_HEIGHT + 6) : TITLE_MAX
  const size = fitFontSize(title, CONTENT_WIDTH, ceiling, ramp(theme.scale.title, 3), 1.15)
  const height = Math.min(ceiling, Math.max(size * 1.2, estimateHeight(title, CONTENT_WIDTH, size, 1.15)))
  const top = TITLE_BOTTOM - height

  return [
    ...(kicker
      ? [
          textBox({
            name: "kicker",
            left: CONTENT_LEFT,
            top: MARGIN,
            width: CONTENT_WIDTH,
            height: KICKER_HEIGHT,
            text: kicker,
            size: theme.scale.caption,
            color: theme.colors.accent,
            bold: true,
          }),
        ]
      : []),
    textBox({
      name: "title",
      left: CONTENT_LEFT,
      top,
      width: CONTENT_WIDTH,
      height,
      text: title,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      vertical: "bottom",
      lineHeight: 1.15,
    }),
    rule("title-rule", CONTENT_LEFT, RULE_Y, CONTENT_WIDTH, mix(theme.colors.ink, theme.colors.background, 0.72), theme.rule),
  ]
}

/** Body text sized to fit the box it was given, stepping down before it overflows. */
function bodyIn(
  name: string,
  text: string,
  box: { left: number; top: number; width: number; height: number },
  theme: ResolvedTheme,
  color = theme.colors.ink,
): ElementSpec {
  const size = fitFontSize(text, box.width, box.height, ramp(theme.scale.body, 3), 1.5)
  return textBox({ ...box, name, text, size, color, lineHeight: 1.5 })
}

const heightsAt = (items: string[], width: number, size: number, lineHeight: number) =>
  items.map((item) => Math.max(size * lineHeight, estimateHeight(item, width, size, lineHeight)))

/**
 * One size for a whole list, chosen so that every column of it fits.
 *
 * Sizing each row against its own box is what produces a list set in three different
 * sizes; the list is one thing, so it gets one size. Taking *stacks* rather than a flat
 * array is what makes the same function right for a single column of bullets, two columns
 * of an agenda, and a timeline's five side-by-side captions — in the last case each stack
 * holds one item, so "every stack fits" reduces to "the tallest one fits", which is the
 * question a row of captions actually asks.
 */
function fitStacks(
  stacks: string[][],
  width: number,
  available: number,
  gap: number,
  theme: ResolvedTheme,
  lineHeight = 1.45,
): number {
  for (const size of ramp(theme.scale.body, 4)) {
    const fits = stacks.every((stack) => {
      const total =
        heightsAt(stack, width, size, lineHeight).reduce((sum, one) => sum + one, 0) +
        gap * (stack.length - 1)
      return total <= available
    })
    if (fits) return size
  }
  return MIN_READABLE
}

/** Split a list into `columns` stacks the way the layouts fill them: top to bottom, then across. */
function chunk<T>(items: T[], columns: number): T[][] {
  const per = Math.ceil(items.length / columns)
  return Array.from({ length: columns }, (_, i) => items.slice(i * per, (i + 1) * per))
}

// ── the layouts ────────────────────────────────────────────────────────────────

function cover(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "cover" }>): ElementSpec[] {
  const width = span(10)
  const size = fitFontSize(spec.title, width, 190, ramp(theme.scale.display, 4), 1.1)
  const height = Math.min(190, Math.max(size * 1.15, estimateHeight(spec.title, width, size, 1.1)))
  const top = 196

  const out: ElementSpec[] = [
    rule("accent-rule", CONTENT_LEFT, top - 30, 110, theme.colors.accent, Math.max(4, theme.rule * 2)),
    textBox({
      name: "title",
      left: CONTENT_LEFT,
      top,
      width,
      height,
      text: spec.title,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      lineHeight: 1.1,
    }),
  ]

  if (spec.subtitle) {
    out.push(
      textBox({
        name: "subtitle",
        left: CONTENT_LEFT,
        top: top + height + theme.gap,
        width: span(8),
        height: 56,
        text: spec.subtitle,
        size: theme.scale.subtitle,
        color: theme.colors.muted,
        lineHeight: 1.4,
      }),
    )
  }

  if (spec.meta) {
    out.push(
      textBox({
        name: "meta",
        left: CONTENT_LEFT,
        top: CONTENT_BOTTOM - 24,
        width: CONTENT_WIDTH,
        height: 24,
        text: spec.meta,
        size: theme.scale.caption,
        color: theme.colors.muted,
      }),
    )
  }

  return out
}

function agenda(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "agenda" }>): ElementSpec[] {
  const out = header(theme, spec.title ?? "Agenda")
  const columns = spec.items.length > 4 ? 2 : 1
  const cells = track(columns)
  const perColumn = Math.ceil(spec.items.length / columns)
  const numberWidth = 46
  const textWidth = cells[0].width - numberWidth
  const size = fitStacks(chunk(spec.items, columns), textWidth, CONTENT_HEIGHT, theme.gap, theme)
  const heights = heightsAt(spec.items, textWidth, size, 1.45)

  let column = 0
  let y = CONTENT_TOP
  spec.items.forEach((item, index) => {
    if (index > 0 && index % perColumn === 0) {
      column += 1
      y = CONTENT_TOP
    }
    const cell = cells[column]
    out.push(
      textBox({
        name: `number-${index + 1}`,
        left: cell.left,
        top: y,
        width: numberWidth - 10,
        height: heights[index],
        text: String(index + 1).padStart(2, "0"),
        size,
        color: theme.colors.accent,
        bold: true,
        lineHeight: 1.45,
      }),
      textBox({
        name: `item-${index + 1}`,
        left: cell.left + numberWidth,
        top: y,
        width: textWidth,
        height: heights[index],
        text: item,
        size,
        color: theme.colors.ink,
        lineHeight: 1.45,
      }),
    )
    y += heights[index] + theme.gap
  })

  return out
}

/**
 * A section divider, with the numeral on a colour block rather than tinted into the field.
 *
 * The tempting version — a big faded numeral on a full-colour page — is the one that fails
 * contrast: a numeral mixed halfway toward the page colour lands around 2:1 no matter how
 * large it is set. Put the block beside the title instead and both halves are full strength.
 */
function section(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "section" }>): ElementSpec[] {
  const blockWidth = 300
  const textLeft = blockWidth + 60
  const textWidth = VIEWPORT_WIDTH - textLeft - MARGIN

  const out: ElementSpec[] = [
    plate("block", 0, 0, blockWidth, VIEWPORT_HEIGHT, theme.colors.primary, 0),
  ]

  if (spec.number) {
    out.push(
      textBox({
        name: "number",
        left: 0,
        top: VIEWPORT_HEIGHT / 2 - 60,
        width: blockWidth,
        height: 120,
        text: spec.number,
        size: theme.scale.display * 1.5,
        color: theme.colors.onPrimary,
        font: theme.fonts.display,
        bold: true,
        align: "center",
        vertical: "middle",
        lineHeight: 1,
      }),
    )
  }

  const size = fitFontSize(spec.title, textWidth, 150, ramp(theme.scale.display * 0.8, 4), 1.15)
  const height = Math.min(150, Math.max(size * 1.2, estimateHeight(spec.title, textWidth, size, 1.15)))

  out.push(
    textBox({
      name: "title",
      left: textLeft,
      top: VIEWPORT_HEIGHT / 2 - height / 2,
      width: textWidth,
      height,
      text: spec.title,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      vertical: "middle",
      lineHeight: 1.15,
    }),
  )

  if (spec.kicker) {
    out.push(
      textBox({
        name: "kicker",
        left: textLeft,
        top: VIEWPORT_HEIGHT / 2 - height / 2 - 34,
        width: textWidth,
        height: 24,
        text: spec.kicker,
        size: theme.scale.caption,
        color: theme.colors.accent,
        bold: true,
      }),
    )
  }

  return out
}

function statement(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "statement" }>,
): ElementSpec[] {
  const width = span(10)
  const size = fitFontSize(spec.text, width, 300, ramp(theme.scale.display * 0.85, 5), 1.2)
  const height = Math.min(300, Math.max(size * 1.25, estimateHeight(spec.text, width, size, 1.2)))
  const top = (VIEWPORT_HEIGHT - height) / 2

  const out: ElementSpec[] = [
    rule("accent-rule", CONTENT_LEFT, top - 34, 90, theme.colors.accent, Math.max(4, theme.rule * 2)),
    textBox({
      name: "statement",
      left: CONTENT_LEFT,
      top,
      width,
      height,
      text: spec.text,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      lineHeight: 1.2,
    }),
  ]

  if (spec.attribution) {
    out.push(
      textBox({
        name: "attribution",
        left: CONTENT_LEFT,
        top: top + height + theme.gap,
        width,
        height: 26,
        text: spec.attribution,
        size: theme.scale.caption,
        color: theme.colors.mutedSurface,
      }),
    )
  }

  return out
}

function bullets(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "bullets" }>): ElementSpec[] {
  const out = header(theme, spec.title, spec.kicker)
  const markerColumn = 28
  const width = CONTENT_WIDTH - markerColumn
  const size = fitStacks([spec.points], width, CONTENT_HEIGHT, theme.gap, theme)
  const heights = heightsAt(spec.points, width, size, 1.45)

  let y = CONTENT_TOP
  spec.points.forEach((point, index) => {
    out.push(
      {
        type: "shape",
        name: `marker-${index + 1}`,
        shapeKey: "ellipse",
        left: CONTENT_LEFT,
        top: y + size * 0.45,
        width: 10,
        height: 10,
        fill: theme.colors.accent,
      },
      textBox({
        name: `point-${index + 1}`,
        left: CONTENT_LEFT + markerColumn,
        top: y,
        width,
        height: heights[index],
        text: point,
        size,
        color: theme.colors.ink,
        lineHeight: 1.45,
      }),
    )
    y += heights[index] + theme.gap
  })

  return out
}

function twoColumn(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "two-column" }>,
): ElementSpec[] {
  const out = header(theme, spec.title)
  const cells = track(2)

  ;[spec.left, spec.right].forEach((side, index) => {
    const cell = cells[index]
    const name = index === 0 ? "left" : "right"
    let y = CONTENT_TOP

    if (side.heading) {
      out.push(
        textBox({
          name: `${name}-heading`,
          left: cell.left,
          top: y,
          width: cell.width,
          height: 32,
          text: side.heading,
          size: theme.scale.subtitle,
          color: theme.colors.primary,
          font: theme.fonts.display,
          bold: true,
          lineHeight: 1.3,
        }),
      )
      y += 32 + theme.gap * 0.6
    }

    out.push(
      bodyIn(
        `${name}-body`,
        side.body,
        { left: cell.left, top: y, width: cell.width, height: CONTENT_BOTTOM - y },
        theme,
      ),
    )
  })

  return out
}

function cards(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "cards" }>): ElementSpec[] {
  const out = header(theme, spec.title)
  const cells = track(spec.cards.length)
  const pad = 22
  const inner = cells[0].width - pad * 2

  const headingSize = spec.cards.length > 3 ? theme.scale.body + 2 : theme.scale.subtitle
  const bodies = spec.cards.map((card) => card.body ?? "")
  const headingHeights = spec.cards.map((card) =>
    estimateHeight(card.heading, inner, headingSize, 1.25),
  )
  const tallestHeading = Math.max(...headingHeights)
  const bodyRoom = CONTENT_HEIGHT - pad * 2 - tallestHeading - theme.gap * 0.6
  const bodySize = bodies.some(Boolean)
    ? fitFontSize(
        bodies.reduce((longest, one) => (one.length > longest.length ? one : longest), ""),
        inner,
        bodyRoom,
        ramp(theme.scale.body, 3),
        1.5,
      )
    : theme.scale.body

  const needed = Math.max(
    ...spec.cards.map((card, index) => {
      const body = card.body ? estimateHeight(card.body, inner, bodySize, 1.5) : 0
      return pad * 2 + headingHeights[index] + (card.body ? theme.gap * 0.6 + body : 0)
    }),
  )
  const cardHeight = Math.min(CONTENT_HEIGHT, Math.max(150, needed))

  spec.cards.forEach((card, index) => {
    const cell = cells[index]
    out.push(
      plate(
        `card-${index + 1}`,
        cell.left,
        CONTENT_TOP,
        cell.width,
        cardHeight,
        theme.colors.surface,
        theme.radius,
      ),
      textBox({
        name: `card-${index + 1}-heading`,
        left: cell.left + pad,
        top: CONTENT_TOP + pad,
        width: inner,
        height: tallestHeading,
        text: card.heading,
        size: headingSize,
        color: theme.colors.primary,
        font: theme.fonts.display,
        bold: true,
        lineHeight: 1.25,
      }),
    )

    if (card.body) {
      const top = CONTENT_TOP + pad + tallestHeading + theme.gap * 0.6
      out.push(
        textBox({
          name: `card-${index + 1}-body`,
          left: cell.left + pad,
          top,
          width: inner,
          height: CONTENT_TOP + cardHeight - pad - top,
          text: card.body,
          size: bodySize,
          color: theme.colors.ink,
          lineHeight: 1.5,
        }),
      )
    }
  })

  return out
}

function kpis(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "kpis" }>): ElementSpec[] {
  const out = spec.title ? header(theme, spec.title) : []
  const top = spec.title ? CONTENT_TOP + 40 : 200
  const cells = track(spec.kpis.length)
  const valueSize = spec.kpis.length > 3 ? theme.scale.display * 0.72 : theme.scale.display

  spec.kpis.forEach((kpi, index) => {
    const cell = cells[index]
    const size = fitFontSize(kpi.value, cell.width, valueSize * 1.2, ramp(valueSize, 4), 1.1)

    out.push(
      rule(`kpi-${index + 1}-rule`, cell.left, top, cell.width, theme.colors.accent, Math.max(3, theme.rule * 2)),
      textBox({
        name: `kpi-${index + 1}-value`,
        left: cell.left,
        top: top + 16,
        width: cell.width,
        height: size * 1.2,
        text: kpi.value,
        size,
        color: theme.colors.primary,
        font: theme.fonts.display,
        bold: true,
        lineHeight: 1.1,
      }),
      textBox({
        name: `kpi-${index + 1}-label`,
        left: cell.left,
        top: top + 16 + size * 1.2 + 8,
        width: cell.width,
        height: 52,
        text: kpi.label,
        size: theme.scale.body,
        color: theme.colors.ink,
        lineHeight: 1.35,
      }),
    )

    if (kpi.note) {
      out.push(
        textBox({
          name: `kpi-${index + 1}-note`,
          left: cell.left,
          top: top + 16 + size * 1.2 + 66,
          width: cell.width,
          height: 44,
          text: kpi.note,
          size: theme.scale.caption,
          color: theme.colors.muted,
          lineHeight: 1.4,
        }),
      )
    }
  })

  return out
}

const chartElement = (
  name: string,
  box: { left: number; top: number; width: number; height: number },
  chart: z.infer<typeof chartSlot>,
  theme: ResolvedTheme,
): ElementSpec => ({
  type: "chart",
  name,
  ...box,
  chartType: chart.chartType,
  categories: chart.categories,
  series: chart.series,
  ...(chart.showLegend === undefined ? {} : { showLegend: chart.showLegend }),
  ...(chart.showValue === undefined ? {} : { showValue: chart.showValue }),
  themeColors: theme.chart,
})

function chartFocus(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "chart-focus" }>,
): ElementSpec[] {
  const out = header(theme, spec.title)
  const takeawayHeight = spec.takeaway ? 68 : 0
  const chartHeight = CONTENT_HEIGHT - (takeawayHeight ? takeawayHeight + theme.gap : 0)

  out.push(
    chartElement(
      "chart",
      { left: CONTENT_LEFT, top: CONTENT_TOP, width: CONTENT_WIDTH, height: chartHeight },
      spec.chart,
      theme,
    ),
  )

  if (spec.takeaway) {
    const top = CONTENT_TOP + chartHeight + theme.gap
    out.push(
      plate("takeaway-plate", CONTENT_LEFT, top, CONTENT_WIDTH, takeawayHeight, theme.colors.surface, theme.radius),
      textBox({
        name: "takeaway",
        left: CONTENT_LEFT + 20,
        top: top + 12,
        width: CONTENT_WIDTH - 40,
        height: takeawayHeight - 24,
        text: spec.takeaway,
        size: fitFontSize(spec.takeaway, CONTENT_WIDTH - 40, takeawayHeight - 24, ramp(theme.scale.body, 3), 1.4),
        color: theme.colors.ink,
        bold: true,
        vertical: "middle",
        lineHeight: 1.4,
      }),
    )
  }

  return out
}

function chartPlusText(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "chart-plus-text" }>,
): ElementSpec[] {
  const out = header(theme, spec.title)
  const chartOnLeft = (spec.side ?? "left") === "left"
  const chartBox = {
    left: chartOnLeft ? CONTENT_LEFT : colLeft(5),
    top: CONTENT_TOP,
    width: span(7),
    height: CONTENT_HEIGHT,
  }
  const textLeft = chartOnLeft ? colLeft(7) + GUTTER : CONTENT_LEFT
  const textWidth = span(5) - GUTTER

  out.push(chartElement("chart", chartBox, spec.chart, theme))

  const markerColumn = 22
  const width = textWidth - markerColumn
  const size = fitStacks([spec.points], width, CONTENT_HEIGHT, theme.gap, theme)
  const heights = heightsAt(spec.points, width, size, 1.45)

  let y = CONTENT_TOP
  spec.points.forEach((point, index) => {
    out.push(
      {
        type: "shape",
        name: `marker-${index + 1}`,
        shapeKey: "ellipse",
        left: textLeft,
        top: y + size * 0.45,
        width: 8,
        height: 8,
        fill: theme.colors.accent,
      },
      textBox({
        name: `point-${index + 1}`,
        left: textLeft + markerColumn,
        top: y,
        width,
        height: heights[index],
        text: point,
        size,
        color: theme.colors.ink,
        lineHeight: 1.45,
      }),
    )
    y += heights[index] + theme.gap
  })

  return out
}

/**
 * Full-bleed picture with a solid caption plate rather than a gradient scrim.
 *
 * A scrim would need a translucent fill, and translucency is the one thing that does not
 * survive every route out of here identically. A solid plate reads the same in the editor,
 * in the PPTX and in the PDF, and text on it has a contrast ratio that can be checked.
 */
function imageFull(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "image-full" }>,
): ElementSpec[] {
  const captioned = Boolean(spec.title || spec.subtitle)
  // deep enough that the caption itself still finishes above the bottom margin — the plate
  // is full-bleed, the words on it are not
  const plateHeight = captioned ? (spec.subtitle ? 170 : 120) : 0
  const plateTop = VIEWPORT_HEIGHT - plateHeight

  const out: ElementSpec[] = [
    {
      type: "image",
      name: "image",
      left: 0,
      top: 0,
      width: VIEWPORT_WIDTH,
      height: captioned ? plateTop : VIEWPORT_HEIGHT,
      src: spec.image,
    },
  ]

  if (!captioned) return out

  out.push(plate("caption-plate", 0, plateTop, VIEWPORT_WIDTH, plateHeight, theme.colors.background, 0))

  if (spec.title) {
    const size = fitFontSize(spec.title, CONTENT_WIDTH, 50, ramp(theme.scale.title, 3), 1.15)
    out.push(
      textBox({
        name: "title",
        left: CONTENT_LEFT,
        top: plateTop + 26,
        width: CONTENT_WIDTH,
        height: 50,
        text: spec.title,
        size,
        color: theme.colors.ink,
        font: theme.fonts.display,
        bold: true,
        lineHeight: 1.15,
      }),
    )
  }

  if (spec.subtitle) {
    const top = spec.title ? plateTop + 84 : plateTop + 26
    out.push(
      textBox({
        name: "subtitle",
        left: CONTENT_LEFT,
        top,
        width: CONTENT_WIDTH,
        height: CONTENT_BOTTOM - top,
        text: spec.subtitle,
        size: theme.scale.body,
        color: theme.colors.muted,
        lineHeight: 1.4,
      }),
    )
  }

  return out
}

function imageSplit(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "image-split" }>,
): ElementSpec[] {
  const imageOnRight = (spec.side ?? "right") === "right"
  const half = VIEWPORT_WIDTH / 2
  const textLeft = imageOnRight ? MARGIN : half + MARGIN
  const textWidth = half - MARGIN * 2

  const out: ElementSpec[] = [
    {
      type: "image",
      name: "image",
      left: imageOnRight ? half : 0,
      top: 0,
      width: half,
      height: VIEWPORT_HEIGHT,
      src: spec.image,
    },
  ]

  const size = fitFontSize(spec.title, textWidth, 120, ramp(theme.scale.title, 3), 1.15)
  const titleHeight = Math.min(120, Math.max(size * 1.2, estimateHeight(spec.title, textWidth, size, 1.15)))
  let y = 96

  out.push(
    textBox({
      name: "title",
      left: textLeft,
      top: y,
      width: textWidth,
      height: titleHeight,
      text: spec.title,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      lineHeight: 1.15,
    }),
  )
  y += titleHeight + theme.gap

  if (spec.body) {
    const height = Math.min(160, estimateHeight(spec.body, textWidth, theme.scale.body, 1.5))
    out.push(
      bodyIn("body", spec.body, { left: textLeft, top: y, width: textWidth, height }, theme),
    )
    y += height + theme.gap
  }

  const points = spec.points ?? []
  if (points.length) {
    const markerColumn = 22
    const width = textWidth - markerColumn
    const pointSize = fitStacks([points], width, CONTENT_BOTTOM - y, theme.gap * 0.8, theme)
    const heights = heightsAt(points, width, pointSize, 1.45)

    points.forEach((point, index) => {
      out.push(
        {
          type: "shape",
          name: `marker-${index + 1}`,
          shapeKey: "ellipse",
          left: textLeft,
          top: y + pointSize * 0.45,
          width: 8,
          height: 8,
          fill: theme.colors.accent,
        },
        textBox({
          name: `point-${index + 1}`,
          left: textLeft + markerColumn,
          top: y,
          width,
          height: heights[index],
          text: point,
          size: pointSize,
          color: theme.colors.ink,
          lineHeight: 1.45,
        }),
      )
      y += heights[index] + theme.gap * 0.8
    })
  }

  return out
}

function timeline(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "timeline" }>): ElementSpec[] {
  const out = header(theme, spec.title)
  const cells = track(spec.steps.length)
  const axisY = CONTENT_TOP + 76
  const whenSize = Math.max(MIN_READABLE, Math.round(theme.scale.subtitle * 0.9))

  out.push(
    rule(
      "axis",
      CONTENT_LEFT,
      axisY,
      CONTENT_WIDTH,
      mix(theme.colors.ink, theme.colors.background, 0.7),
      Math.max(1.5, theme.rule),
    ),
  )

  // each caption is its own stack: they sit side by side, so what has to fit is the
  // tallest of them, not their sum
  const whats = spec.steps.map((step) => step.what)
  const room = CONTENT_BOTTOM - (axisY + 28)
  const size = fitStacks(whats.map((what) => [what]), cells[0].width, room, 0, theme)
  const tallest = Math.min(room, Math.max(...heightsAt(whats, cells[0].width, size, 1.45)))

  spec.steps.forEach((step, index) => {
    const cell = cells[index]
    out.push(
      textBox({
        name: `when-${index + 1}`,
        left: cell.left,
        top: axisY - 52,
        width: cell.width,
        height: 34,
        text: step.when,
        size: whenSize,
        color: theme.colors.accent,
        font: theme.fonts.display,
        bold: true,
        vertical: "bottom",
        lineHeight: 1.2,
      }),
      {
        type: "shape",
        name: `dot-${index + 1}`,
        shapeKey: "ellipse",
        left: cell.left,
        top: axisY - 7,
        width: 14,
        height: 14,
        fill: theme.colors.accent,
      },
      textBox({
        name: `what-${index + 1}`,
        left: cell.left,
        top: axisY + 28,
        width: cell.width,
        height: tallest,
        text: step.what,
        size,
        color: theme.colors.ink,
        lineHeight: 1.45,
      }),
    )
  })

  return out
}

function comparison(
  theme: ResolvedTheme,
  spec: Extract<LayoutSpec, { layout: "comparison" }>,
): ElementSpec[] {
  const out = header(theme, spec.title)
  const cells = track(2)
  const bandHeight = 52
  const pad = 20
  const sides = [
    { key: "left" as const, side: spec.left, fill: theme.colors.primary, on: theme.colors.onPrimary },
    { key: "right" as const, side: spec.right, fill: theme.colors.accent, on: theme.colors.onAccent },
  ]

  const inner = cells[0].width - pad * 2
  const room = CONTENT_HEIGHT - bandHeight - pad * 2
  const size = fitStacks(
    [spec.left.points, spec.right.points],
    inner - 18,
    room,
    theme.gap * 0.7,
    theme,
  )

  sides.forEach(({ key, side, fill, on }, index) => {
    const cell = cells[index]
    out.push(
      plate(`${key}-panel`, cell.left, CONTENT_TOP, cell.width, CONTENT_HEIGHT, theme.colors.surface, theme.radius),
      plate(`${key}-band`, cell.left, CONTENT_TOP, cell.width, bandHeight, fill, theme.radius),
      textBox({
        name: `${key}-heading`,
        left: cell.left + pad,
        top: CONTENT_TOP,
        width: inner,
        height: bandHeight,
        text: side.heading,
        size: theme.scale.subtitle,
        color: on,
        font: theme.fonts.display,
        bold: true,
        vertical: "middle",
        lineHeight: 1.2,
      }),
    )

    let y = CONTENT_TOP + bandHeight + pad
    side.points.forEach((point, at) => {
      const height = Math.max(size * 1.45, estimateHeight(point, inner - 18, size, 1.45))
      out.push(
        {
          type: "shape",
          name: `${key}-marker-${at + 1}`,
          shapeKey: "ellipse",
          left: cell.left + pad,
          top: y + size * 0.45,
          width: 8,
          height: 8,
          fill,
        },
        textBox({
          name: `${key}-point-${at + 1}`,
          left: cell.left + pad + 18,
          top: y,
          width: inner - 18,
          height,
          text: point,
          size,
          color: theme.colors.ink,
          lineHeight: 1.45,
        }),
      )
      y += height + theme.gap * 0.7
    })
  })

  return out
}

/**
 * A 2×2 with its axis labels set flat rather than rotated.
 *
 * A rotated label is the obvious way to letter a y-axis and the wrong way here: an element
 * is stored by its unrotated box, so a 200-wide label stood on its end still *reads* as
 * 200 wide to the outline, the lint, and anything else measuring the page — and at the
 * left margin that box hangs off the canvas.
 */
function matrix(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "matrix" }>): ElementSpec[] {
  const out = header(theme, spec.title)
  const gridTop = CONTENT_TOP + 24
  const gridHeight = CONTENT_HEIGHT - 24 - 26
  const cells = track(2)
  const rowHeight = (gridHeight - GUTTER) / 2
  const pad = 18

  out.push(
    textBox({
      name: "y-axis",
      left: CONTENT_LEFT,
      top: CONTENT_TOP - 2,
      width: CONTENT_WIDTH,
      height: 22,
      text: `↑ ${spec.axes.y}`,
      size: theme.scale.caption,
      color: theme.colors.muted,
    }),
    textBox({
      name: "x-axis",
      left: CONTENT_LEFT,
      top: gridTop + gridHeight + 4,
      width: CONTENT_WIDTH,
      height: 22,
      text: `${spec.axes.x} →`,
      size: theme.scale.caption,
      color: theme.colors.muted,
      align: "right",
    }),
  )

  spec.quadrants.forEach((quadrant, index) => {
    const cell = cells[index % 2]
    const top = gridTop + Math.floor(index / 2) * (rowHeight + GUTTER)
    const inner = cell.width - pad * 2

    out.push(
      plate(`quadrant-${index + 1}`, cell.left, top, cell.width, rowHeight, theme.colors.surface, theme.radius),
      textBox({
        name: `quadrant-${index + 1}-heading`,
        left: cell.left + pad,
        top: top + pad,
        width: inner,
        height: 30,
        text: quadrant.heading,
        size: theme.scale.subtitle,
        color: theme.colors.primary,
        font: theme.fonts.display,
        bold: true,
        lineHeight: 1.25,
      }),
    )

    if (quadrant.body) {
      out.push(
        bodyIn(
          `quadrant-${index + 1}-body`,
          quadrant.body,
          {
            left: cell.left + pad,
            top: top + pad + 36,
            width: inner,
            height: rowHeight - pad * 2 - 36,
          },
          theme,
        ),
      )
    }
  })

  return out
}

function table(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "table" }>): ElementSpec[] {
  const out = header(theme, spec.title)
  const captionHeight = spec.caption ? 30 : 0
  const rowHeight = Math.min(52, (CONTENT_HEIGHT - captionHeight) / spec.rows.length)
  const height = rowHeight * spec.rows.length

  out.push({
    type: "table",
    name: "table",
    left: CONTENT_LEFT,
    top: CONTENT_TOP,
    width: CONTENT_WIDTH,
    height,
    rows: spec.rows,
    header: spec.header ?? true,
    fontSize: Math.max(MIN_READABLE, Math.min(theme.scale.body, Math.round(rowHeight * 0.42))),
    themeColor: theme.colors.primary,
  })

  if (spec.caption) {
    out.push(
      textBox({
        name: "caption",
        left: CONTENT_LEFT,
        top: Math.min(CONTENT_TOP + height + 10, CONTENT_BOTTOM - 24),
        width: CONTENT_WIDTH,
        height: 24,
        text: spec.caption,
        size: theme.scale.caption,
        color: theme.colors.muted,
      }),
    )
  }

  return out
}

function quote(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "quote" }>): ElementSpec[] {
  const width = span(9)
  const left = colLeft(1)
  const size = fitFontSize(spec.text, width, 250, ramp(theme.scale.title * 1.2, 5), 1.35)
  const height = Math.min(250, Math.max(size * 1.4, estimateHeight(spec.text, width, size, 1.35)))
  const top = (VIEWPORT_HEIGHT - height) / 2 - 10

  const out: ElementSpec[] = [
    textBox({
      name: "quote-mark",
      left: CONTENT_LEFT,
      top: top - 6,
      width: 60,
      height: 80,
      text: "“",
      size: Math.round(theme.scale.display * 1.2),
      color: theme.colors.accent,
      font: theme.fonts.display,
      bold: true,
      lineHeight: 1,
    }),
    textBox({
      name: "quote",
      left,
      top,
      width,
      height,
      text: spec.text,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      italic: true,
      lineHeight: 1.35,
    }),
  ]

  if (spec.attribution) {
    out.push(
      textBox({
        name: "attribution",
        left,
        top: top + height + theme.gap,
        width,
        height: 26,
        text: `— ${spec.attribution}`,
        size: theme.scale.body,
        color: theme.colors.mutedSurface,
      }),
    )
  }

  return out
}

function closing(theme: ResolvedTheme, spec: Extract<LayoutSpec, { layout: "closing" }>): ElementSpec[] {
  const width = span(10)
  const left = (VIEWPORT_WIDTH - width) / 2
  const size = fitFontSize(spec.title, width, 150, ramp(theme.scale.display * 0.9, 4), 1.15)
  const height = Math.min(150, Math.max(size * 1.2, estimateHeight(spec.title, width, size, 1.15)))
  const top = (VIEWPORT_HEIGHT - height) / 2 - 20

  const out: ElementSpec[] = [
    textBox({
      name: "title",
      left,
      top,
      width,
      height,
      text: spec.title,
      size,
      color: theme.colors.ink,
      font: theme.fonts.display,
      bold: true,
      align: "center",
      lineHeight: 1.15,
    }),
    rule(
      "accent-rule",
      (VIEWPORT_WIDTH - 110) / 2,
      top + height + theme.gap,
      110,
      theme.colors.accent,
      Math.max(4, theme.rule * 2),
    ),
  ]

  if (spec.subtitle) {
    out.push(
      textBox({
        name: "subtitle",
        left,
        top: top + height + theme.gap + 22,
        width,
        height: 50,
        text: spec.subtitle,
        size: theme.scale.subtitle,
        color: theme.colors.muted,
        align: "center",
        lineHeight: 1.4,
      }),
    )
  }

  if (spec.meta) {
    out.push(
      textBox({
        name: "meta",
        left: CONTENT_LEFT,
        top: CONTENT_BOTTOM - 24,
        width: CONTENT_WIDTH,
        height: 24,
        text: spec.meta,
        size: theme.scale.caption,
        color: theme.colors.muted,
        align: "center",
      }),
    )
  }

  return out
}

// ── the switch ─────────────────────────────────────────────────────────────────

/** Layouts that paint over the whole page rather than sitting on the deck background. */
function backgroundFor(theme: ResolvedTheme, spec: LayoutSpec): string {
  return spec.layout === "quote" || spec.layout === "statement"
    ? theme.colors.surface
    : theme.colors.background
}

export function renderLayout(spec: LayoutSpec, theme: ResolvedTheme): LayoutResult {
  const elements = (() => {
    switch (spec.layout) {
      case "cover":
        return cover(theme, spec)
      case "agenda":
        return agenda(theme, spec)
      case "section":
        return section(theme, spec)
      case "statement":
        return statement(theme, spec)
      case "bullets":
        return bullets(theme, spec)
      case "two-column":
        return twoColumn(theme, spec)
      case "cards":
        return cards(theme, spec)
      case "kpis":
        return kpis(theme, spec)
      case "chart-focus":
        return chartFocus(theme, spec)
      case "chart-plus-text":
        return chartPlusText(theme, spec)
      case "image-full":
        return imageFull(theme, spec)
      case "image-split":
        return imageSplit(theme, spec)
      case "timeline":
        return timeline(theme, spec)
      case "comparison":
        return comparison(theme, spec)
      case "matrix":
        return matrix(theme, spec)
      case "table":
        return table(theme, spec)
      case "quote":
        return quote(theme, spec)
      case "closing":
        return closing(theme, spec)
    }
  })()

  return {
    elements: elements.map(round),
    background: { type: "solid", color: backgroundFor(theme, spec) },
  }
}

/**
 * Coordinates to a tenth of a unit.
 *
 * Fitting produces numbers like 187.33333333333334, and a deck full of those is a deck
 * whose outline is unreadable and whose stored JSON is bigger than it needs to be. A tenth
 * of a canvas unit is 0.072pt — well under the resolution of anything downstream.
 */
function round<T extends ElementSpec>(element: T): T {
  const at = (value: number) => Math.round(value * 10) / 10
  return {
    ...element,
    left: at(element.left),
    top: at(element.top),
    width: at(element.width),
    height: at(element.height),
  }
}
