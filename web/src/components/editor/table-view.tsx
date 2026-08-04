"use client"

import type { CSSProperties } from "react"
import { cellBackground, cellTextColor, isHeaderRow } from "@/lib/table-theme"
import type { TableCell, TableElement } from "@/types/slides"

export function cellStyle(el: TableElement, cell: TableCell, row: number): CSSProperties {
  // imported tables carry the source deck's cell insets and line spacing; without them a
  // tight 10pt table inflates to two or three times its frame and spills over neighbours
  const [padV, padH] = el.cellPadding ?? [4, 8]
  return {
    background: cellBackground(el, cell, row),
    color: cellTextColor(el, cell, row),
    fontSize: cell.fontSize ?? el.fontSize,
    fontWeight: (cell.bold ?? isHeaderRow(el, row)) ? 700 : 400,
    fontStyle: cell.italic ? "italic" : "normal",
    textDecoration: cell.underline ? "underline" : "none",
    textAlign: cell.align ?? "left",
    lineHeight: el.lineHeight,
    border: el.outline.width
      ? `${el.outline.width}px ${el.outline.style} ${el.outline.color}`
      : "none",
    padding: `${padV}px ${padH}px`,
    verticalAlign: "middle",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
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
