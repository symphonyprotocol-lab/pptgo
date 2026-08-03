import type PptxGenJS from "pptxgenjs"
import { UNIT_TO_PT, toHex } from "./color"

type Run = PptxGenJS.TextProps
type RunOptions = NonNullable<Run["options"]>

export interface RunDefaults {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color: string
  fontSize: number
  fontFace: string
}

interface Style {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  fontFace?: string
  fontSize?: number
  highlight?: string
  subscript?: boolean
  superscript?: boolean
  hyperlink?: string
}

interface ListContext {
  type: "bullet" | "number"
  level: number
}

interface Paragraph {
  runs: { text: string; style: Style }[]
  bullet?: "bullet" | "number"
  indent: number
}

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE"])

/**
 * Turns the editor's stored HTML into pptxgenjs text runs so that formatting applied to
 * *part* of a paragraph survives export instead of being flattened to plain text.
 */
export function htmlToRuns(html: string, defaults: RunDefaults): Run[] {
  if (typeof window === "undefined" || !html) return []
  const template = document.createElement("template")
  template.innerHTML = html

  const paragraphs: Paragraph[] = []
  let current: Paragraph = { runs: [], indent: 0 }

  const flush = (force = false) => {
    if (current.runs.length || force) paragraphs.push(current)
    current = { runs: [], indent: 0 }
  }

  const walk = (node: Node, style: Style, list: ListContext | null) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/ /g, " ")
        if (text) current.runs.push({ text, style })
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue

      const el = child as HTMLElement
      const tag = el.tagName

      if (tag === "BR") {
        flush(true)
        continue
      }
      if (tag === "UL" || tag === "OL") {
        flush()
        walk(el, style, {
          type: tag === "UL" ? "bullet" : "number",
          level: list ? list.level + 1 : 0,
        })
        flush()
        continue
      }

      const next = extendStyle(style, el)

      if (BLOCK_TAGS.has(tag)) {
        flush()
        if (tag === "LI" && list) {
          current.bullet = list.type
          current.indent = list.level
        }
        walk(el, next, list)
        flush()
        continue
      }
      walk(el, next, list)
    }
  }

  walk(template.content, {}, null)
  flush()

  const runs: Run[] = []
  paragraphs.forEach((paragraph, pIndex) => {
    const last = pIndex === paragraphs.length - 1
    if (!paragraph.runs.length) {
      runs.push({ text: "", options: { breakLine: !last } })
      return
    }
    paragraph.runs.forEach((run, rIndex) => {
      const options: RunOptions = toOptions(run.style, defaults)
      if (paragraph.bullet) {
        options.bullet = paragraph.bullet === "number" ? { type: "number" } : true
        if (paragraph.indent) options.indentLevel = paragraph.indent
      }
      if (rIndex === paragraph.runs.length - 1 && !last) options.breakLine = true
      runs.push({ text: run.text, options })
    })
  })

  return runs
}

function extendStyle(style: Style, el: HTMLElement): Style {
  const next: Style = { ...style }
  switch (el.tagName) {
    case "B":
    case "STRONG":
      next.bold = true
      break
    case "I":
    case "EM":
      next.italic = true
      break
    case "U":
      next.underline = true
      break
    case "S":
    case "STRIKE":
      next.strike = true
      break
    case "SUB":
      next.subscript = true
      break
    case "SUP":
      next.superscript = true
      break
    case "MARK":
      next.highlight = next.highlight ?? "FFFF00"
      break
    case "CODE":
      next.fontFace = "Courier New"
      break
    case "A": {
      const href = el.getAttribute("href")
      if (href) next.hyperlink = href
      break
    }
    case "FONT": {
      const color = el.getAttribute("color")
      if (color) next.color = toHex(color)
      const face = el.getAttribute("face")
      if (face) next.fontFace = primaryFont(face)
      break
    }
  }

  const css = el.style
  if (css.fontWeight) next.bold = css.fontWeight === "bold" || Number(css.fontWeight) >= 600
  if (css.fontStyle) next.italic = css.fontStyle === "italic"
  if (css.color) next.color = toHex(css.color)
  if (css.backgroundColor) next.highlight = toHex(css.backgroundColor)
  if (css.fontFamily) next.fontFace = primaryFont(css.fontFamily)
  if (css.fontSize) {
    const size = parseFloat(css.fontSize)
    if (Number.isFinite(size)) next.fontSize = Math.max(1, Math.round(size * UNIT_TO_PT))
  }
  if (css.textDecoration || css.textDecorationLine) {
    const decoration = `${css.textDecoration} ${css.textDecorationLine}`
    if (decoration.includes("underline")) next.underline = true
    if (decoration.includes("line-through")) next.strike = true
  }
  return next
}

function toOptions(style: Style, defaults: RunDefaults): RunOptions {
  const bold = style.bold ?? defaults.bold
  const italic = style.italic ?? defaults.italic
  const underline = style.underline ?? defaults.underline
  const strike = style.strike ?? defaults.strike

  const options: RunOptions = {
    bold,
    italic,
    color: style.color ?? defaults.color,
    fontSize: style.fontSize ?? defaults.fontSize,
    fontFace: style.fontFace ?? defaults.fontFace,
  }
  if (underline) options.underline = { style: "sng" }
  if (strike) options.strike = "sngStrike"
  if (style.highlight) options.highlight = style.highlight
  if (style.subscript) options.subscript = true
  if (style.superscript) options.superscript = true
  if (style.hyperlink) options.hyperlink = { url: style.hyperlink }
  return options
}

export function primaryFont(family: string): string {
  return family.split(",")[0].replace(/['"]/g, "").trim()
}
