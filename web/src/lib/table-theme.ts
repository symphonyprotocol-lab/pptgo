import { toHex } from "./color"
import type { TableCell, TableElement } from "@/types/slides"

/**
 * How a table cell is coloured. Shared by the on-canvas renderer and the PPTX export,
 * which is the point: the two used to carry byte-identical copies of these three rules,
 * so a change to banding on screen would have quietly stopped matching what got exported.
 */
export const isHeaderRow = (el: TableElement, row: number) => el.theme.rowHeader && row === 0

export function cellBackground(el: TableElement, cell: Pick<TableCell, "fill">, row: number) {
  if (cell.fill) return cell.fill
  if (isHeaderRow(el, row)) return el.theme.color
  if (el.theme.banded && row % 2 === 0) return tint(el.theme.color, 0.88)
  return "#ffffff"
}

export function cellTextColor(el: TableElement, cell: Pick<TableCell, "color">, row: number) {
  return cell.color ?? (isHeaderRow(el, row) ? "#ffffff" : "#111827")
}

/** Mixes a colour towards white — used for banded table rows. */
export function tint(color: string, amount: number): string {
  const hex = toHex(color)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return `#${[0, 2, 4]
    .map((i) => mix(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, "0"))
    .join("")}`
}
