import { MIN_ELEMENT_SIZE } from "./constants"
import type { SlideElement } from "@/types/slides"

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export type Point = [number, number]

const rad = (deg: number) => (deg * Math.PI) / 180

/** Keeps a rotation in [0, 360) so exports stay inside OOXML's accepted range. */
export const normalizeRotate = (deg: number) => ((deg % 360) + 360) % 360

export function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number): Point {
  if (!deg) return [x, y]
  const cos = Math.cos(rad(deg))
  const sin = Math.sin(rad(deg))
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/**
 * Resize around the handle's opposite corner while honouring the element's own
 * rotation: the drag delta is mapped into element space, then the anchor point is
 * pinned back to where it started.
 */
export function resizeBox(
  box: Box & { rotate: number },
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepRatio = false,
): Box {
  const cos = Math.cos(rad(box.rotate))
  const sin = Math.sin(rad(box.rotate))
  const localDx = dx * cos + dy * sin
  const localDy = -dx * sin + dy * cos

  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0

  let width = Math.max(MIN_ELEMENT_SIZE, box.width + sx * localDx)
  let height = Math.max(MIN_ELEMENT_SIZE, box.height + sy * localDy)

  if (keepRatio && sx !== 0 && sy !== 0) {
    const ratio = box.width / box.height
    if (width / height > ratio) height = width / ratio
    else width = height * ratio
  }

  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const fx = (-sx * box.width) / 2
  const fy = (-sy * box.height) / 2
  const anchorX = cx + fx * cos - fy * sin
  const anchorY = cy + fx * sin + fy * cos

  const nfx = (-sx * width) / 2
  const nfy = (-sy * height) / 2
  const newCx = anchorX - (nfx * cos - nfy * sin)
  const newCy = anchorY - (nfx * sin + nfy * cos)

  return { left: newCx - width / 2, top: newCy - height / 2, width, height }
}

export function elementBounds(el: SlideElement): Box {
  return { left: el.left, top: el.top, width: el.width, height: el.height }
}

/** The four corners of an element after its own rotation is applied. */
export function rotatedCorners(el: SlideElement): Point[] {
  const cx = el.left + el.width / 2
  const cy = el.top + el.height / 2
  const corners: Point[] = [
    [el.left, el.top],
    [el.left + el.width, el.top],
    [el.left + el.width, el.top + el.height],
    [el.left, el.top + el.height],
  ]
  if (!el.rotate) return corners
  return corners.map(([x, y]) => rotatePoint(x, y, cx, cy, el.rotate))
}

/** Axis-aligned box that actually contains the element on screen. */
export function rotatedBounds(el: SlideElement): Box {
  if (!el.rotate) return elementBounds(el)
  const corners = rotatedCorners(el)
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/** Union of the on-screen boxes, so a rotated element is not clipped by its own frame. */
export function unionBounds(elements: SlideElement[]): Box | null {
  if (!elements.length) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const el of elements) {
    const box = rotatedBounds(el)
    left = Math.min(left, box.left)
    top = Math.min(top, box.top)
    right = Math.max(right, box.left + box.width)
    bottom = Math.max(bottom, box.top + box.height)
  }
  return { left, top, width: right - left, height: bottom - top }
}

export function boxesIntersect(a: Box, b: Box) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  )
}

/** Whether `inner` lies wholly inside `outer`. */
export function boxContains(outer: Box, inner: Box) {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  )
}

/**
 * Whether a marquee selects an element — it has to enclose the whole thing, which is what
 * PowerPoint does and therefore what someone dragging a box across a slide expects here.
 * Selecting on mere contact (Figma's rule) means a marquee that only meant to reach the
 * two boxes on the right also picks up the full-width title strip it happened to graze.
 *
 * The element's *rotated* bounds are what get tested, so a turned element is judged by the
 * space it actually occupies rather than by its upright box.
 */
export function marqueeHits(box: Box, el: SlideElement) {
  return boxContains(box, rotatedBounds(el))
}

export interface Transform {
  left: number
  top: number
  width: number
  height: number
  rotate: number
}

/**
 * Scale a set of elements so their collective bounds go from `from` to `to`.
 * Each element keeps its relative position and its own rotation.
 */
export function scaleWithin(el: SlideElement, from: Box, to: Box): Partial<Transform> {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  const cx = el.left + el.width / 2
  const cy = el.top + el.height / 2
  const newCx = to.left + (cx - from.left) * sx
  const newCy = to.top + (cy - from.top) * sy
  const width = Math.max(MIN_ELEMENT_SIZE, el.width * sx)
  const height = Math.max(MIN_ELEMENT_SIZE, el.height * sy)
  return { left: newCx - width / 2, top: newCy - height / 2, width, height }
}

/** Rotate an element around a shared centre, as part of rotating a whole group. */
export function rotateWithin(el: SlideElement, centre: Point, delta: number): Partial<Transform> {
  const cx = el.left + el.width / 2
  const cy = el.top + el.height / 2
  const [nx, ny] = rotatePoint(cx, cy, centre[0], centre[1], delta)
  return {
    left: nx - el.width / 2,
    top: ny - el.height / 2,
    rotate: normalizeRotate(el.rotate + delta),
  }
}

/** Even horizontal or vertical spacing between the outermost elements. */
export function distribute(elements: SlideElement[], axis: "h" | "v") {
  if (elements.length < 3) return []
  const key = axis === "h" ? "left" : "top"
  const size = axis === "h" ? "width" : "height"
  const sorted = [...elements].sort((a, b) => a[key] - b[key])
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = last[key] + last[size] - first[key]
  const totalSize = sorted.reduce((sum, el) => sum + el[size], 0)
  const gap = (span - totalSize) / (sorted.length - 1)

  let cursor = first[key]
  return sorted.map((el) => {
    const patch = { id: el.id, patch: { [key]: cursor } as Partial<Transform> }
    cursor += el[size] + gap
    return patch
  })
}
