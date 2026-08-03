import { DEFAULT_THEME } from "./constants"
import { createShapeElement } from "./factory"
import type { ShapeElement } from "@/types/slides"

/** Freehand strokes are shapes with a bespoke path rather than a preset geometry. */
export const FREEHAND_KEY = "freehand"

const PAD = 6

/**
 * Turns a captured stroke into a shape. The path is normalised into the element's own
 * 0..viewBox space so it scales with the element like every other shape.
 */
export function freehandElement(points: [number, number][]): ShapeElement | null {
  if (points.length < 2) return null

  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const left = Math.min(...xs) - PAD
  const top = Math.min(...ys) - PAD
  const width = Math.max(...xs) - Math.min(...xs) + PAD * 2
  const height = Math.max(...ys) - Math.min(...ys) + PAD * 2
  const viewBox = 200

  // a stroke drawn in a straight line has no thickness on one axis; keep the divisor sane
  const sx = viewBox / Math.max(1, width)
  const sy = viewBox / Math.max(1, height)
  const path = smoothPath(points.map(([x, y]) => [(x - left) * sx, (y - top) * sy]))

  return createShapeElement(FREEHAND_KEY, {
    // the key is not in SHAPE_MAP, so it has to be set explicitly rather than derived
    shapeKey: FREEHAND_KEY,
    name: "手绘",
    left,
    top,
    width: Math.max(1, width),
    height: Math.max(1, height),
    path,
    viewBox,
    // the stroke is the drawing; the interior stays empty
    fill: "transparent",
    outline: { style: "solid", width: 2, color: DEFAULT_THEME.fontColor },
  })
}

/** Quadratic segments through the midpoints, which reads much smoother than raw line joins. */
function smoothPath(points: [number, number][]): string {
  const round = (n: number) => Math.round(n * 10) / 10
  if (points.length === 2) {
    return `M ${round(points[0][0])} ${round(points[0][1])} L ${round(points[1][0])} ${round(points[1][1])}`
  }

  let d = `M ${round(points[0][0])} ${round(points[0][1])}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    d += ` Q ${round(cx)} ${round(cy)} ${round((cx + nx) / 2)} ${round((cy + ny) / 2)}`
  }
  const last = points[points.length - 1]
  return `${d} L ${round(last[0])} ${round(last[1])}`
}

/** Preview path drawn while the pointer is still down, in canvas coordinates. */
export function strokePreviewPath(points: [number, number][]): string {
  if (points.length < 2) return ""
  return smoothPath(points)
}
