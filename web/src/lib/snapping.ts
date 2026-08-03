import { SNAP_THRESHOLD, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import type { Box } from "./geometry"
import type { SlideElement } from "@/types/slides"

export interface GuideLine {
  axis: "v" | "h"
  position: number
}

interface SnapResult {
  dx: number
  dy: number
  lines: GuideLine[]
}

/** Returns the nudge that puts `box` onto the nearest edge/center of its neighbours. */
export function computeSnap(box: Box, others: SlideElement[], scale: number): SnapResult {
  const threshold = SNAP_THRESHOLD / scale

  const verticals = [0, VIEWPORT_WIDTH / 2, VIEWPORT_WIDTH]
  const horizontals = [0, VIEWPORT_HEIGHT / 2, VIEWPORT_HEIGHT]
  for (const el of others) {
    verticals.push(el.left, el.left + el.width / 2, el.left + el.width)
    horizontals.push(el.top, el.top + el.height / 2, el.top + el.height)
  }

  const boxVerticals = [box.left, box.left + box.width / 2, box.left + box.width]
  const boxHorizontals = [box.top, box.top + box.height / 2, box.top + box.height]

  let dx = 0
  let dy = 0
  let bestX = threshold
  let bestY = threshold
  const lines: GuideLine[] = []

  for (const target of verticals) {
    for (const source of boxVerticals) {
      const diff = target - source
      if (Math.abs(diff) <= bestX) {
        bestX = Math.abs(diff)
        dx = diff
      }
    }
  }
  for (const target of horizontals) {
    for (const source of boxHorizontals) {
      const diff = target - source
      if (Math.abs(diff) <= bestY) {
        bestY = Math.abs(diff)
        dy = diff
      }
    }
  }

  const epsilon = 0.01
  for (const target of verticals) {
    if (boxVerticals.some((s) => Math.abs(s + dx - target) < epsilon)) {
      lines.push({ axis: "v", position: target })
    }
  }
  for (const target of horizontals) {
    if (boxHorizontals.some((s) => Math.abs(s + dy - target) < epsilon)) {
      lines.push({ axis: "h", position: target })
    }
  }

  return { dx, dy, lines }
}
