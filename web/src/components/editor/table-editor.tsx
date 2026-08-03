"use client"

import { useEffect, useRef, useState } from "react"
import { useEditor } from "@/store/editor"
import type { TableCell, TableElement } from "@/types/slides"
import { cellStyle } from "./table-view"

/**
 * Sits on top of a table while it is being edited: every cell becomes an input, and the
 * selected range drives the merge/split controls in the property panel.
 */
export function TableEditor({ element, scale }: { element: TableElement; scale: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const selection = useEditor((s) => s.tableSelection)

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        useEditor.getState().setEditingId(null)
        useEditor.getState().setTableSelection(null)
      }
    }
    // defer so the double-click that opened the editor does not immediately close it
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("mousedown", onDown)
    }
  }, [])

  const setCell = (row: number, col: number, patch: Partial<TableCell>) => {
    const store = useEditor.getState()
    const rows = element.rows.map((r, ri) =>
      r.map((cell, ci) => (ri === row && ci === col ? { ...cell, ...patch } : cell)),
    )
    store.updateElement(element.id, { rows } as Partial<TableElement>)
  }

  const inRange = (row: number, col: number) => {
    if (!selection) return false
    const [[r1, c1], [r2, c2]] = selection
    return (
      row >= Math.min(r1, r2) &&
      row <= Math.max(r1, r2) &&
      col >= Math.min(c1, c2) &&
      col <= Math.max(c1, c2)
    )
  }

  return (
    <div
      ref={ref}
      className="absolute"
      style={{
        left: element.left,
        top: element.top,
        width: element.width,
        height: element.height,
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
        zIndex: 90,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <table
        style={{
          width: "100%",
          height: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          fontFamily: element.fontFamily,
        }}
      >
        <colgroup>
          {element.colWidths.map((width, i) => (
            <col key={i} style={{ width: `${width * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          {element.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                cell.merged ? null : (
                  <td
                    key={c}
                    colSpan={cell.colspan > 1 ? cell.colspan : undefined}
                    rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined}
                    style={{
                      ...cellStyle(element, cell, r),
                      padding: 0,
                      outline: inRange(r, c) ? "2px solid #2563eb" : undefined,
                      outlineOffset: -2,
                    }}
                    onMouseDown={() => {
                      setAnchor([r, c])
                      useEditor.getState().setTableSelection([
                        [r, c],
                        [r, c],
                      ])
                    }}
                    onMouseEnter={(event) => {
                      if (event.buttons === 1 && anchor) {
                        useEditor.getState().setTableSelection([anchor, [r, c]])
                      }
                    }}
                  >
                    <input
                      value={cell.text}
                      onChange={(event) => setCell(r, c, { text: event.target.value })}
                      onFocus={() => useEditor.getState().commit()}
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        padding: "4px 8px",
                        boxSizing: "border-box",
                        font: "inherit",
                        color: "inherit",
                        textAlign: cell.align ?? "left",
                        // counteract the canvas transform so the caret is a normal size
                        caretColor: "currentColor",
                      }}
                    />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="absolute left-0 whitespace-nowrap rounded bg-slate-900/80 px-2 py-1 text-white"
        style={{ bottom: -26 / scale, fontSize: 11 / scale }}
      >
        点击单元格输入，拖选多格后可在右侧合并
      </div>
    </div>
  )
}
