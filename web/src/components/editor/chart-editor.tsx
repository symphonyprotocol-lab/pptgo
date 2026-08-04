"use client"

import { useEffect, useRef, useState } from "react"
import { parseChart, serializeChart } from "@/lib/chart-data"
import { useT } from "@/lib/i18n/client"
import { useEditor } from "@/store/editor"
import type { ChartElement } from "@/types/slides"

/**
 * Sits on top of a chart while it is being edited, the way `TableEditor` does for a table.
 *
 * A chart's numbers were only reachable from the property panel, so double-clicking one —
 * the gesture that opens every other kind of content on the canvas — did nothing at all,
 * and the sample data read as something the app had decided on the reader's behalf.
 */
export function ChartEditor({ element, scale }: { element: ChartElement; scale: number }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(() => serializeChart(element))
  /** read by the write-back below, which runs after the last render */
  const latest = useRef(text)
  /**
   * Whether the box has been typed into at all. Without it the write-back would fire on a
   * mount that is immediately torn down and remounted — which is what React does to every
   * effect in development — and mark itself done before the real edit ever happened.
   */
  const edited = useRef(false)
  const committed = useRef(false)

  useEffect(() => {
    area.current?.focus()
  }, [])

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) useEditor.getState().setEditingId(null)
    }
    // defer so the double-click that opened the editor does not immediately close it
    const timer = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("mousedown", onDown)
    }
  }, [])

  /**
   * Write back on the way out. Editing ends when something else takes the pointer, which
   * unmounts this before any blur can settle — the same reason `EditableText` flushes here.
   */
  const id = element.id
  useEffect(() => {
    return () => {
      if (committed.current || !edited.current) return
      committed.current = true
      const data = parseChart(latest.current)
      // unparseable text is left alone rather than turned into an empty chart
      if (!data) return
      const store = useEditor.getState()
      store.commit()
      store.updateElement(id, { data } as Partial<ChartElement>)
    }
  }, [id])

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
      // the canvas reads any pointer down that reaches it as a click away from the editor
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Escape") {
          event.preventDefault()
          useEditor.getState().setEditingId(null)
          return
        }
        // A tab is what separates two series, so it has to reach the box. Left to the
        // browser it moves focus out instead, and the rest of the row is typed into
        // whatever came next.
        if (event.key === "Tab") {
          event.preventDefault()
          const node = area.current
          if (!node) return
          const { selectionStart: from, selectionEnd: to, value } = node
          const next = `${value.slice(0, from)}\t${value.slice(to)}`
          setText(next)
          latest.current = next
          edited.current = true
          // React writes the value on the next render, so the caret is placed after it
          requestAnimationFrame(() => node.setSelectionRange(from + 1, from + 1))
        }
      }}
    >
      <textarea
        ref={area}
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value)
          latest.current = event.target.value
          edited.current = true
        }}
        className="h-full w-full resize-none rounded-md border-blue-600 bg-background font-mono text-foreground shadow-lg outline-none"
        // the canvas is scaled, so the box counteracts it and stays a readable size at any
        // zoom — the numbers being typed here are not part of the drawing
        style={{
          borderWidth: 2 / scale,
          borderStyle: "solid",
          padding: 8 / scale,
          fontSize: 12 / scale,
          lineHeight: 1.6,
          boxSizing: "border-box",
        }}
      />
      <div
        className="absolute left-0 whitespace-nowrap rounded bg-slate-900/80 px-2 py-1 text-white"
        style={{ bottom: -26 / scale, fontSize: 11 / scale }}
      >
        {t("panel.chartEditHint")}
      </div>
    </div>
  )
}
