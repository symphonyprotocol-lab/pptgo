import katex from "katex"
import { svgToPng, wrapForeignObject } from "./raster"

/** Renders LaTeX to KaTeX's HTML. Never throws — a bad expression shows in red instead. */
export function renderFormula(latex: string): string {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
      output: "html",
      strict: false,
    })
  } catch {
    return `<span style="color:#dc2626">${latex.replace(/[<>&]/g, "")}</span>`
  }
}

const STYLE_PROPS = [
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "color",
  "display",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "margin",
  "padding",
  "border",
  "border-bottom",
  "border-top",
  "vertical-align",
  "text-align",
  "line-height",
  "white-space",
  "transform",
  "transform-origin",
]

/**
 * KaTeX's output leans on its stylesheet, which an SVG `foreignObject` cannot reach.
 * Copying the computed values onto each node makes the fragment self-contained.
 */
function inlineStyles(source: Element, clone: Element) {
  const computed = window.getComputedStyle(source)
  const declarations = STYLE_PROPS.map((prop) => `${prop}:${computed.getPropertyValue(prop)}`)
    .filter((decl) => !decl.endsWith(":"))
    .join(";")
  clone.setAttribute("style", declarations)

  const sourceChildren = Array.from(source.children)
  const cloneChildren = Array.from(clone.children)
  for (let i = 0; i < sourceChildren.length; i += 1) {
    if (cloneChildren[i]) inlineStyles(sourceChildren[i], cloneChildren[i])
  }
}

/**
 * Rasterises a formula so it can be embedded in a .pptx. PowerPoint's own equations are
 * OMML, which is a different language from LaTeX, so an image is the faithful option.
 * Returns null when the browser cannot rasterise, letting the caller fall back to text.
 */
export async function formulaToPng(
  latex: string,
  color: string,
  width: number,
  height: number,
  scale = 3,
): Promise<string | null> {
  if (typeof document === "undefined") return null
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) return null

  const host = document.createElement("div")
  host.setAttribute(
    "style",
    `position:fixed;left:-99999px;top:0;color:${color};display:flex;` +
      `align-items:center;justify-content:center;width:${width}px;height:${height}px;`,
  )
  host.innerHTML = renderFormula(latex)
  document.body.appendChild(host)

  try {
    const clone = host.cloneNode(true) as HTMLElement
    inlineStyles(host, clone)
    clone.style.position = "static"
    clone.style.left = "0"
    clone.style.top = "0"

    const xml = new XMLSerializer().serializeToString(clone)
    return await svgToPng(wrapForeignObject(xml, width, height), width, height, scale)
  } catch {
    return null
  } finally {
    host.remove()
  }
}
