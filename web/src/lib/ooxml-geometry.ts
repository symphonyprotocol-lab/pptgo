import { alphaOf } from "./color"
import { SHAPE_MAP } from "./shapes"
import { parsePath } from "./svg-path"
import type { ShapeElement } from "@/types/slides"

/**
 * `a:custGeom` for a shape the preset list does not cover.
 *
 * pptxgenjs only writes `a:prstGeom`, so a freehand stroke or an imported ribbon used to
 * be rendered to a PNG and embedded as a picture — the drawing survived, but PowerPoint
 * saw a bitmap: no recolouring, no outline, no crisp edge when the slide is projected.
 * Custom geometry is the same contour said in OOXML's own words, and comes back editable.
 *
 * The importer already does this in reverse, normalising `a:custGeom` into the 200-unit
 * box the renderer stretches over an element; this is that trip back out.
 */

/**
 * Path-space units per canvas unit. OOXML point coordinates are integers, so the 200-unit
 * box the editor draws in would quantise every curve to whole units; multiplying up first
 * keeps a hundredth of a unit, which is finer than any deck can show.
 */
const PATH_SCALE = 100

interface Options {
  /**
   * Whether the interior is painted. An open stroke that is left `norm` gets its implied
   * closing line filled by PowerPoint, which turns a signature into a blob.
   */
  filled: boolean
}

/**
 * The geometry a shape needs written for it, or `null` when its preset already says it.
 *
 * Both the exporter and the patch pass ask this, and both have to reach the same answer:
 * one decides whether to place a shape at all rather than rasterising it, the other
 * decides what to put in its `p:spPr`.
 */
export function shapeGeometryXml(el: ShapeElement): string | null {
  if (SHAPE_MAP.has(el.shapeKey)) return null
  return custGeomXml(el.path, el.viewBox, { filled: !!el.gradient || alphaOf(el.fill) > 0 })
}

export function custGeomXml(path: string, viewBox: number, { filled }: Options): string | null {
  const segments = parsePath(path)
  // OOXML paths begin at a stated point; anything else is not something we can convert
  if (!segments || segments[0].type !== "M") return null

  const size = Math.round(Math.max(1, viewBox) * PATH_SCALE)
  const coordinate = (value: number) => Math.round(value * PATH_SCALE)
  const point = (x: number, y: number) => `<a:pt x="${coordinate(x)}" y="${coordinate(y)}"/>`

  const steps: string[] = []
  for (const segment of segments) {
    switch (segment.type) {
      case "M":
        steps.push(`<a:moveTo>${point(segment.points[0], segment.points[1])}</a:moveTo>`)
        break
      case "L":
        steps.push(`<a:lnTo>${point(segment.points[0], segment.points[1])}</a:lnTo>`)
        break
      case "Q": {
        const [cx, cy, x, y] = segment.points
        steps.push(`<a:quadBezTo>${point(cx, cy)}${point(x, y)}</a:quadBezTo>`)
        break
      }
      case "C": {
        const [c1x, c1y, c2x, c2y, x, y] = segment.points
        steps.push(`<a:cubicBezTo>${point(c1x, c1y)}${point(c2x, c2y)}${point(x, y)}</a:cubicBezTo>`)
        break
      }
      case "Z":
        steps.push("<a:close/>")
        break
    }
  }

  return (
    "<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>" +
    `<a:rect l="0" t="0" r="${size}" b="${size}"/>` +
    `<a:pathLst><a:path w="${size}" h="${size}"${filled ? "" : ' fill="none"'}>` +
    steps.join("") +
    "</a:path></a:pathLst></a:custGeom>"
  )
}
