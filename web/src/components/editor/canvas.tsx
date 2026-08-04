"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { createLineElement, createShapeElement, createTextElement } from "@/lib/factory"
import { freehandElement, strokePreviewPath } from "@/lib/freehand"
import {
  marqueeHits,
  normalizeRotate,
  resizeBox,
  rotateWithin,
  scaleWithin,
  unionBounds,
  type Box,
  type ResizeHandle,
} from "@/lib/geometry"
import { computeSnap, type GuideLine } from "@/lib/snapping"
import { useT } from "@/lib/i18n/client"
import { useEditor } from "@/store/editor"
import type {
  ChartElement,
  LineElement,
  ShapeElement,
  SlideElement,
  TextElement,
} from "@/types/slides"
import { ChartEditor } from "./chart-editor"
import { CanvasContextMenu } from "./context-menu"
import { EditableText } from "./editable-text"
import { ElementBox, shapeTextStyle, textBoxStyle } from "./element-view"
import { Ruler } from "./ruler"
import { SelectionFrame } from "./selection-frame"
import { backgroundStyle } from "./slide-view"
import { TableEditor } from "./table-editor"

type Drag =
  | { mode: "move"; x: number; y: number; scale: number; origins: SlideElement[]; moved: boolean }
  | {
      mode: "resize"
      x: number
      y: number
      handle: ResizeHandle
      origins: SlideElement[]
      bounds: Box
      moved: boolean
    }
  | {
      mode: "rotate"
      cx: number
      cy: number
      startAngle: number
      origins: SlideElement[]
      centre: [number, number]
      moved: boolean
    }
  | {
      mode: "endpoint"
      point: "start" | "end"
      origin: LineElement
      moved: boolean
    }
  | { mode: "marquee"; x: number; y: number }
  | { mode: "create"; x: number; y: number }
  | { mode: "pencil"; points: [number, number][] }

function LineEndpoints({
  line,
  scale,
  onStart,
}: {
  line: LineElement
  scale: number
  onStart: (point: "start" | "end", event: React.PointerEvent) => void
}) {
  const size = 9 / scale
  return (
    <>
      {(["start", "end"] as const).map((point) => {
        const [x, y] = point === "start" ? line.start : line.end
        return (
          <div
            key={point}
            onPointerDown={(event) => onStart(point, event)}
            className="absolute rounded-full border-blue-600 bg-white"
            style={{
              left: line.left + x - size / 2,
              top: line.top + y - size / 2,
              width: size,
              height: size,
              borderWidth: 1.5 / scale,
              borderStyle: "solid",
              zIndex: 100,
            }}
          />
        )
      })}
    </>
  )
}

export function Canvas() {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const activeIds = useEditor((s) => s.activeIds)
  const editingId = useEditor((s) => s.editingId)
  const creating = useEditor((s) => s.creating)
  const scale = useEditor((s) => s.canvasScale)
  const showGrid = useEditor((s) => s.showGrid)
  const showRuler = useEditor((s) => s.showRuler)

  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const canvasRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  // the pointer handlers are bound once, so live slide data reaches them through a ref
  const slideRef = useRef(slide)
  useEffect(() => {
    slideRef.current = slide
  }, [slide])

  const [autoFit, setAutoFit] = useState(true)
  const [guides, setGuides] = useState<GuideLine[]>([])
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [draft, setDraft] = useState<Box | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [stroke, setStroke] = useState<[number, number][] | null>(null)

  const activeSet = useMemo(() => new Set(activeIds), [activeIds])
  const activeElements = useMemo(
    () => slide.elements.filter((el) => activeSet.has(el.id)),
    [slide.elements, activeSet],
  )

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      if (!autoFit) return
      const { width, height } = node.getBoundingClientRect()
      const fit = Math.min((width - 80) / VIEWPORT_WIDTH, (height - 80) / VIEWPORT_HEIGHT)
      useEditor.getState().setCanvasScale(Math.max(0.1, fit))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoFit])

  const toCanvas = useCallback((event: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const currentScale = useEditor.getState().canvasScale
    return {
      x: (event.clientX - rect.left) / currentScale,
      y: (event.clientY - rect.top) / currentScale,
    }
  }, [])

  /** Clicking a grouped element selects the whole group. */
  const resolveSelection = useCallback((element: SlideElement) => {
    if (!element.groupId) return [element.id]
    return slideRef.current.elements
      .filter((el) => el.groupId === element.groupId)
      .map((el) => el.id)
  }, [])

  /** Snapshot of what a drag started from, so every frame is computed from the original. */
  const originsOf = (ids: Set<string>) =>
    slideRef.current.elements.filter((el) => ids.has(el.id) && !el.lock).map((el) => ({ ...el }))

  const onElementPointerDown = (event: React.PointerEvent, element: SlideElement) => {
    if (creating) return
    if (editingId === element.id) {
      // An element being edited owns its own pointer events. Bowing out without also
      // holding the event here let it reach the canvas, which reads any pointer down as a
      // click away and closes the editor.
      event.stopPropagation()
      return
    }
    if (event.button === 2) return
    event.stopPropagation()
    const store = useEditor.getState()

    if (store.painter) {
      store.applyFormat([element.id])
      if (!event.altKey) store.clearFormatPainter()
      return
    }

    let ids = store.activeIds
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    if (additive) {
      const group = resolveSelection(element)
      ids = ids.includes(element.id)
        ? ids.filter((id) => !group.includes(id))
        : [...ids, ...group]
      store.setActiveIds(Array.from(new Set(ids)))
    } else if (!ids.includes(element.id)) {
      store.setActiveIds(resolveSelection(element))
    }
    if (store.editingId) store.setEditingId(null)

    // A locked element can still be selected — that is the only way to reach the unlock
    // control — it just refuses to move.
    if (element.lock) return

    const point = toCanvas(event)
    drag.current = {
      mode: "move",
      x: point.x,
      y: point.y,
      scale: useEditor.getState().canvasScale,
      origins: originsOf(new Set(useEditor.getState().activeIds)),
      moved: false,
    }
  }

  const onResizeStart = (handle: ResizeHandle, event: React.PointerEvent) => {
    event.stopPropagation()
    const ids = new Set(useEditor.getState().activeIds)
    const origins = originsOf(ids)
    if (!origins.length) return
    const bounds =
      origins.length === 1
        ? { left: origins[0].left, top: origins[0].top, width: origins[0].width, height: origins[0].height }
        : unionBounds(origins)!
    const point = toCanvas(event)
    drag.current = { mode: "resize", x: point.x, y: point.y, handle, origins, bounds, moved: false }
  }

  const onRotateStart = (event: React.PointerEvent) => {
    event.stopPropagation()
    const ids = new Set(useEditor.getState().activeIds)
    const origins = originsOf(ids)
    if (!origins.length) return
    const bounds = unionBounds(origins)!
    const rect = canvasRef.current!.getBoundingClientRect()
    const currentScale = useEditor.getState().canvasScale
    const centre: [number, number] = [
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    ]
    const cx = rect.left + centre[0] * currentScale
    const cy = rect.top + centre[1] * currentScale
    drag.current = {
      mode: "rotate",
      cx,
      cy,
      startAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
      origins,
      centre,
      moved: false,
    }
  }

  const onEndpointStart = (point: "start" | "end", event: React.PointerEvent) => {
    event.stopPropagation()
    const element = activeElements[0] as LineElement | undefined
    if (!element || element.type !== "line" || element.lock) return
    drag.current = { mode: "endpoint", point, origin: { ...element }, moved: false }
  }

  const onCanvasPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    setMenu(null)
    const store = useEditor.getState()
    if (store.editingId) store.setEditingId(null)
    const point = toCanvas(event)

    if (creating?.kind === "pencil") {
      drag.current = { mode: "pencil", points: [[point.x, point.y]] }
      setStroke([[point.x, point.y]])
      return
    }

    if (creating) {
      drag.current = { mode: "create", x: point.x, y: point.y }
      setDraft({ left: point.x, top: point.y, width: 0, height: 0 })
      return
    }
    store.setActiveIds([])
    drag.current = { mode: "marquee", x: point.x, y: point.y }
  }

  useEffect(() => {
    let marqueeBox: Box | null = null
    let draftBox: Box | null = null

    const onMove = (event: PointerEvent) => {
      const state = drag.current
      if (!state) return
      const store = useEditor.getState()
      const point = toCanvas(event)

      if (state.mode === "move") {
        let dx = point.x - state.x
        let dy = point.y - state.y
        if (!state.moved) {
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
          state.moved = true
          store.commit()
        }
        const bounds = unionBounds(state.origins)
        if (!bounds) return
        if (!event.altKey) {
          const moving = new Set(state.origins.map((el) => el.id))
          const others = slideRef.current.elements.filter((el) => !moving.has(el.id))
          const snap = computeSnap(
            { left: bounds.left + dx, top: bounds.top + dy, width: bounds.width, height: bounds.height },
            others,
            state.scale,
          )
          dx += snap.dx
          dy += snap.dy
          setGuides(snap.lines)
        } else {
          setGuides([])
        }
        store.updateElements(
          state.origins.map((origin) => ({
            id: origin.id,
            patch: { left: origin.left + dx, top: origin.top + dy },
          })),
        )
        return
      }

      if (state.mode === "resize") {
        const dx = point.x - state.x
        const dy = point.y - state.y
        if (!state.moved) {
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
          state.moved = true
          store.commit()
        }
        if (state.origins.length === 1) {
          const origin = state.origins[0]
          const box = resizeBox({ ...state.bounds, rotate: origin.rotate }, state.handle, dx, dy, event.shiftKey)
          store.updateElement(origin.id, box)
          return
        }
        // A multi-selection scales as one block: resize the union, then map each
        // element's position and size through the same transform.
        const next = resizeBox({ ...state.bounds, rotate: 0 }, state.handle, dx, dy, event.shiftKey)
        store.updateElements(
          state.origins.map((origin) => ({
            id: origin.id,
            patch: scaleWithin(origin, state.bounds, next) as Partial<SlideElement>,
          })),
        )
        return
      }

      if (state.mode === "rotate") {
        if (!state.moved) {
          state.moved = true
          store.commit()
        }
        const angle = Math.atan2(event.clientY - state.cy, event.clientX - state.cx)
        let delta = ((angle - state.startAngle) * 180) / Math.PI
        if (event.shiftKey) {
          const base = state.origins.length === 1 ? state.origins[0].rotate : 0
          delta = Math.round((base + delta) / 15) * 15 - base
        }
        if (state.origins.length === 1) {
          const origin = state.origins[0]
          store.updateElement(origin.id, { rotate: normalizeRotate(Math.round(origin.rotate + delta)) })
          return
        }
        store.updateElements(
          state.origins.map((origin) => ({
            id: origin.id,
            patch: rotateWithin(origin, state.centre, delta) as Partial<SlideElement>,
          })),
        )
        return
      }

      if (state.mode === "endpoint") {
        if (!state.moved) {
          state.moved = true
          store.commit()
        }
        const origin = state.origin
        const absStart: [number, number] = [
          origin.left + origin.start[0],
          origin.top + origin.start[1],
        ]
        const absEnd: [number, number] = [origin.left + origin.end[0], origin.top + origin.end[1]]
        const next: [number, number] = [point.x, point.y]
        const [p1, p2] = state.point === "start" ? [next, absEnd] : [absStart, next]
        const left = Math.min(p1[0], p2[0])
        const top = Math.min(p1[1], p2[1])
        store.updateElement(origin.id, {
          left,
          top,
          width: Math.abs(p2[0] - p1[0]),
          height: Math.abs(p2[1] - p1[1]),
          start: [p1[0] - left, p1[1] - top],
          end: [p2[0] - left, p2[1] - top],
        } as Partial<LineElement>)
        return
      }

      if (state.mode === "pencil") {
        const last = state.points[state.points.length - 1]
        // drop points the stroke would not notice, so the path stays small
        if (Math.hypot(point.x - last[0], point.y - last[1]) >= 2) {
          state.points.push([point.x, point.y])
          setStroke([...state.points])
        }
        return
      }

      const left = Math.min(state.x, point.x)
      const top = Math.min(state.y, point.y)
      const box = {
        left,
        top,
        width: Math.abs(point.x - state.x),
        height: Math.abs(point.y - state.y),
      }
      if (state.mode === "marquee") {
        marqueeBox = box
        setMarquee(box)
      } else {
        draftBox = box
        setDraft(box)
      }
    }

    const onUp = (event: PointerEvent) => {
      const state = drag.current
      drag.current = null
      setGuides([])
      if (!state) return
      const store = useEditor.getState()

      if (state.mode === "marquee") {
        const box = marqueeBox
        marqueeBox = null
        setMarquee(null)
        if (box && box.width > 2 && box.height > 2) {
          const hit = slideRef.current.elements.filter((el) => !el.lock && marqueeHits(box, el))
          store.setActiveIds(hit.map((el) => el.id))
        }
        return
      }

      if (state.mode === "pencil") {
        const points = state.points
        setStroke(null)
        store.setCreating(null)
        const element = freehandElement(points)
        if (element) store.addElement(element)
        return
      }

      if (state.mode === "create") {
        const box = draftBox
        draftBox = null
        setDraft(null)
        const tool = store.creating
        store.setCreating(null)
        if (!tool) return
        const point = toCanvas(event)
        // "dragged out a size" is about the whole gesture, not one axis — a straight
        // vertical drag is still a real drag.
        const dragged = box && Math.hypot(box.width, box.height) > 12
        const sized = dragged && box!.width > 12 && box!.height > 12

        if (tool.kind === "text") {
          store.addElement(
            createTextElement({
              left: sized ? box!.left : point.x,
              top: sized ? box!.top : point.y,
              width: sized ? box!.width : 320,
              height: sized ? Math.max(40, box!.height) : 48,
              content: t("element.defaultText"),
            }),
          )
        } else if (tool.kind === "shape") {
          store.addElement(
            createShapeElement(tool.shapeKey, {
              left: sized ? box!.left : point.x,
              top: sized ? box!.top : point.y,
              width: sized ? box!.width : 200,
              height: sized ? box!.height : 200,
            }),
          )
        } else if (tool.kind === "line") {
          const sx = state.x
          const sy = state.y
          let ex = point.x
          let ey = point.y
          if (!dragged) {
            // a bare click drops a default horizontal line
            ex = sx + 160
            ey = sy
          }
          const left = Math.min(sx, ex)
          const top = Math.min(sy, ey)
          store.addElement(
            createLineElement({
              left,
              top,
              width: Math.abs(ex - sx),
              height: Math.abs(ey - sy),
              start: [sx - left, sy - top],
              end: [ex - left, ey - top],
              style: tool.style,
              endCap: tool.endCap,
            }),
          )
        }
      }
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    // a cancelled pointer (system gesture, palm rejection) must not leave a drag armed
    document.addEventListener("pointercancel", onUp)
    return () => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onUp)
    }
    // `t` only changes when the language does, so the handlers are still bound once per
    // session in practice — it is in the list because a new text box takes its prompt from it
  }, [toCanvas, t])

  /** Two-finger pinch on the viewport zooms, the way every touch canvas is expected to. */
  const pinch = useRef<{ distance: number; scale: number } | null>(null)
  const touchPoints = useRef(new Map<number, { x: number; y: number }>())

  const onViewportPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const onViewportPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return
    if (!touchPoints.current.has(event.pointerId)) return
    touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const points = Array.from(touchPoints.current.values())
    if (points.length !== 2) {
      pinch.current = null
      return
    }
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
    if (!pinch.current) {
      pinch.current = { distance, scale: useEditor.getState().canvasScale }
      // a second finger means this is a zoom, not a drag
      drag.current = null
      setMarquee(null)
      setStroke(null)
      return
    }
    if (pinch.current.distance > 0) {
      setAutoFit(false)
      useEditor.getState().setCanvasScale((distance / pinch.current.distance) * pinch.current.scale)
    }
  }

  const onViewportPointerUp = (event: React.PointerEvent) => {
    touchPoints.current.delete(event.pointerId)
    if (touchPoints.current.size < 2) pinch.current = null
  }

  /**
   * Ctrl/⌘ + wheel zooms the canvas and nothing else.
   *
   * React attaches `wheel` at the root as a *passive* listener, so `preventDefault` inside
   * an `onWheel` prop is ignored — the browser went on treating the same gesture as page
   * zoom, and one scroll shrank the canvas inside a shrinking page. Binding it here, on
   * the element, with `passive: false` is the only way to claim the gesture.
   */
  useEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setAutoFit(false)
      const current = useEditor.getState().canvasScale
      useEditor.getState().setCanvasScale(current - event.deltaY * 0.002)
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [])



  const frameBox =
    activeElements.length === 1
      ? {
          left: activeElements[0].left,
          top: activeElements[0].top,
          width: activeElements[0].width,
          height: activeElements[0].height,
        }
      : unionBounds(activeElements)
  const singleLine = activeElements.length === 1 && activeElements[0].type === "line"
  const anyLocked = activeElements.some((el) => el.lock)
  const editingElement = slide.elements.find((el) => el.id === editingId)

  return (
    // the stage is darker than the panels around it, so the slide reads as the lit
    // surface rather than as one more panel
    <div className="relative flex flex-1 flex-col overflow-hidden bg-stage">
      <div
        ref={viewportRef}
        className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-10"
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        <div
          className="relative shrink-0"
          style={{ width: VIEWPORT_WIDTH * scale, height: VIEWPORT_HEIGHT * scale }}
        >
          {showRuler && <Ruler scale={scale} />}
          <div
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onContextMenu={(event) => {
              event.preventDefault()
              const rect = canvasRef.current!.getBoundingClientRect()
              setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top })
            }}
            // a dark rim vanishes on a dark stage and a lit one vanishes on a pale
            // stage, so the edge comes from the theme; it also has to hold whatever
            // background colour the deck itself uses
            className="relative shadow-[var(--sheet-shadow)] ring-1 ring-[var(--sheet-ring)]"
            style={{
              width: VIEWPORT_WIDTH,
              height: VIEWPORT_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              cursor: creating ? "crosshair" : "default",
              // the canvas handles its own gestures; let the browser keep the rest
              touchAction: "none",
              ...backgroundStyle(slide.background),
            }}
          >
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px)",
                  backgroundSize: "50px 50px",
                }}
              />
            )}

            {/*
              Elements are clipped to the sheet, the way `SlideView` clips them everywhere
              else — an element dragged half off the slide showed its whole self here and
              only its visible half in the preview and the export, so the canvas was
              disagreeing with every other view about what the slide contains.

              Only the content is clipped. The selection frame, its handles and the guides
              stay outside this layer: clipping those too would leave an element that has
              been pushed off the edge with nothing left to grab it by.

              The layer takes no pointer events of its own — it covers the whole sheet, so
              it would otherwise swallow the clicks that clear the selection or start a
              marquee — and each element turns them back on for itself.
            */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {slide.elements.map((element) => {
                const editing = editingId === element.id
                const display =
                  editing && element.type === "shape"
                    ? ({ ...element, text: { ...element.text, content: "" } } as ShapeElement)
                    : element

                return (
                  <ElementBox
                    key={element.id}
                    element={display}
                    onPointerDown={(e) => onElementPointerDown(e, element)}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      if (element.lock) return
                      if (
                        element.type === "text" ||
                        element.type === "shape" ||
                        element.type === "table" ||
                        element.type === "chart"
                      ) {
                        useEditor.getState().setEditingId(element.id)
                      }
                    }}
                    style={{ pointerEvents: "auto", cursor: element.lock ? "default" : "move" }}
                    contentOverride={
                      editing && element.type === "text" ? (
                        <EditableText
                          html={(element as TextElement).content}
                          style={textBoxStyle(element as TextElement)}
                          scale={scale}
                          onCommit={(html, contentHeight) => {
                            const store = useEditor.getState()
                            store.commit()
                            store.updateElement(element.id, {
                              content: html,
                              height: Math.max(24, contentHeight),
                            } as Partial<TextElement>)
                            store.setEditingId(null)
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {editing && element.type === "shape" && (
                      <EditableText
                        html={(element as ShapeElement).text.content}
                        style={shapeTextStyle(element as ShapeElement)}
                        scale={scale}
                        onCommit={(html) => {
                          const store = useEditor.getState()
                          store.commit()
                          store.updateElement(element.id, {
                            text: { ...(element as ShapeElement).text, content: html },
                          } as Partial<ShapeElement>)
                          store.setEditingId(null)
                        }}
                      />
                    )}
                  </ElementBox>
                )
              })}
            </div>

            {editingElement?.type === "table" && (
              <TableEditor element={editingElement} scale={scale} />
            )}

            {editingElement?.type === "chart" && (
              <ChartEditor element={editingElement as ChartElement} scale={scale} />
            )}

            {guides.map((line, i) => (
              <div
                key={i}
                className="pointer-events-none absolute bg-rose-500"
                style={
                  line.axis === "v"
                    ? { left: line.position, top: 0, width: 1 / scale, height: VIEWPORT_HEIGHT }
                    : { top: line.position, left: 0, height: 1 / scale, width: VIEWPORT_WIDTH }
                }
              />
            ))}

            {frameBox && !editingId && !singleLine && (
              <SelectionFrame
                left={frameBox.left}
                top={frameBox.top}
                width={frameBox.width}
                height={frameBox.height}
                rotate={activeElements.length === 1 ? activeElements[0].rotate : 0}
                scale={scale}
                resizable={!anyLocked}
                rotatable={!anyLocked}
                locked={anyLocked}
                onResizeStart={onResizeStart}
                onRotateStart={onRotateStart}
              />
            )}

            {singleLine && !anyLocked && (
              <LineEndpoints
                line={activeElements[0] as LineElement}
                scale={scale}
                onStart={onEndpointStart}
              />
            )}

            {stroke && stroke.length > 1 && (
              <svg
                className="pointer-events-none absolute inset-0"
                width={VIEWPORT_WIDTH}
                height={VIEWPORT_HEIGHT}
              >
                <path
                  d={strokePreviewPath(stroke)}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}

            {marquee && (
              <div
                className="pointer-events-none absolute border border-blue-500 bg-blue-500/10"
                style={{ ...marquee }}
              />
            )}
            {draft && (
              <div
                className="pointer-events-none absolute border border-dashed border-blue-500 bg-blue-500/5"
                style={{ ...draft }}
              />
            )}
          </div>

          {menu && (
            <CanvasContextMenu
              x={menu.x * scale}
              y={menu.y * scale}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
      </div>

      <div className="flex h-9 items-center justify-end gap-1 border-t bg-background px-3 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("editor.zoomOut")}
          onClick={() => {
            setAutoFit(false)
            useEditor.getState().setCanvasScale(scale - 0.1)
          }}
        >
          <Minus className="size-3.5" />
        </Button>
        <span
          className="w-12 text-center tabular-nums"
          aria-live="polite"
          aria-label={t("editor.zoomLabel", { percent: Math.round(scale * 100) })}
        >
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("editor.zoomIn")}
          onClick={() => {
            setAutoFit(false)
            useEditor.getState().setCanvasScale(scale + 0.1)
          }}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("editor.fitToWindow")}
          aria-pressed={autoFit}
          onClick={() => setAutoFit(true)}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
