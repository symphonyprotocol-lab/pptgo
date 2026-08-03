"use client"

import type { CSSProperties } from "react"
import { tint } from "@/lib/export"
import type { TableCell, TableElement } from "@/types/slides"

export const isHeaderRow = (el: TableElement, row: number) => el.theme.rowHeader && row === 0

export function cellBackground(el: TableElement, cell: TableCell, row: number): string {
  if (cell.fill) return cell.fill
  if (isHeaderRow(el, row)) return el.theme.color
  if (el.theme.banded && row % 2 === 0) return tint(el.theme.color, 0.88)
  return "#ffffff"
}

export function cellTextColor(el: TableElement, cell: TableCell, row: number): string {
  return cell.color ?? (isHeaderRow(el, row) ? "#ffffff" : "#111827")
}

export function cellStyle(el: TableElement, cell: TableCell, row: number): CSSProperties {
  return {
    background: cellBackground(el, cell, row),
    color: cellTextColor(el, cell, row),
    fontSize: cell.fontSize ?? el.fontSize,
    fontWeight: (cell.bold ?? isHeaderRow(el, row)) ? 700 : 400,
    fontStyle: cell.italic ? "italic" : "normal",
    textDecoration: cell.underline ? "underline" : "none",
    textAlign: cell.align ?? "left",
    border: el.outline.width
      ? `${el.outline.width}px ${el.outline.style} ${el.outline.color}`
      : "none",
    padding: "4px 8px",
    verticalAlign: "middle",
    wordBreak: "break-word",
    overflow: "hidden",
  }
}

export function TableView({ el }: { el: TableElement }) {
  return (
    <table
      style={{
        width: "100%",
        height: "100%",
        tableLayout: "fixed",
        borderCollapse: "collapse",
        fontFamily: el.fontFamily,
      }}
    >
      <colgroup>
        {el.colWidths.map((width, i) => (
          <col key={i} style={{ width: `${width * 100}%` }} />
        ))}
      </colgroup>
      <tbody>
        {el.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) =>
              cell.merged ? null : (
                <td
                  key={c}
                  colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                  rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                  style={cellStyle(el, cell, r)}
                >
                  {cell.text}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
