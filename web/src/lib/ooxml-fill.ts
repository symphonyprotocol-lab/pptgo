import { alphaOf, toHex } from "./color"
import type { Gradient } from "@/types/slides"

/**
 * `a:gradFill` for a gradient pptxgenjs has no way to express.
 *
 * Until now a gradient exported as the average of its stops — a native, recolourable
 * shape, but a flat one, so every gradient panel in a deck came out of the round trip as
 * a single muddy colour. OOXML states gradients directly; the average is still written
 * first as the solid fill, and stays in the file whenever the shape cannot be found, so a
 * failure here loses the gradient rather than the shape.
 */

/**
 * CSS measures a gradient's angle clockwise from straight up; OOXML measures it clockwise
 * from the positive x axis. The editor renders through CSS, so what is stored is what CSS
 * means, and a quarter turn separates the two.
 */
const OOXML_ANGLE_OFFSET = -90

export function gradFillXml(gradient: Gradient, opacity = 1, fallback = "FFFFFF"): string | null {
  const stops = [...(gradient.stops ?? [])]
    .filter(Boolean)
    .sort((a, b) => a.pos - b.pos)
  // a single stop is a solid colour, and PowerPoint rejects a gradient list shorter than two
  if (stops.length < 2) return null

  const gsLst = stops
    .map((stop) => {
      const pos = Math.round(Math.min(100, Math.max(0, stop.pos)) * 1000)
      const alpha = alphaOf(stop.color) * Math.min(1, Math.max(0, opacity))
      const transparency =
        alpha >= 1 ? "" : `<a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/>`
      return `<a:gs pos="${pos}"><a:srgbClr val="${toHex(stop.color, fallback)}">${transparency}</a:srgbClr></a:gs>`
    })
    .join("")

  const shape =
    gradient.type === "radial"
      ? '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>'
      : `<a:lin ang="${ooxmlAngle(gradient.rotate)}" scaled="0"/>`

  return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${gsLst}</a:gsLst>${shape}</a:gradFill>`
}

/** Degrees as the editor stores them, in the 60000ths of a degree OOXML counts in. */
export function ooxmlAngle(cssDegrees: number): number {
  const degrees = ((((cssDegrees || 0) + OOXML_ANGLE_OFFSET) % 360) + 360) % 360
  return Math.round(degrees * 60000)
}

/** The inverse, for the importer. */
export function cssAngle(ooxmlUnits: number): number {
  const degrees = ooxmlUnits / 60000 - OOXML_ANGLE_OFFSET
  return Math.round(((degrees % 360) + 360) % 360)
}
