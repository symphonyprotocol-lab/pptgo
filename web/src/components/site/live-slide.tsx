"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"

/**
 * The landing page's first screen is not a picture of the editor — it is a working one.
 * Every element here can be dragged, resized from eight handles (with the same rotation
 * compensation the real canvas does) and rotated, and the readout underneath reports the
 * selection's geometry live. Claiming "drag to position, pull to resize" and then showing
 * a screenshot is the part that always rings false; this just does it.
 *
 * Deliberately self-contained rather than mounting the real `EditorShell`: that pulls in
 * the store, the toolbar and the export pipeline, none of which a visitor needs before
 * they have decided to stay.
 */

/** Same coordinate space as the editor, so the numbers in the readout are the real ones. */
const W = 1000
const H = 562.5
const MIN = 40
const SNAP = 6

type Kind = "eyebrow" | "title" | "body" | "block" | "bars"

interface El {
  id: string
  kind: Kind
  cx: number
  cy: number
  w: number
  h: number
  rot: number
}

const INITIAL: El[] = [
  { id: "eyebrow", kind: "eyebrow", cx: 336, cy: 104, w: 452, h: 26, rot: 0 },
  { id: "title", kind: "title", cx: 372, cy: 238, w: 584, h: 184, rot: 0 },
  { id: "body", kind: "body", cx: 344, cy: 404, w: 528, h: 84, rot: 0 },
  { id: "block", kind: "block", cx: 812, cy: 206, w: 244, h: 208, rot: 0 },
  { id: "bars", kind: "bars", cx: 812, cy: 412, w: 244, h: 136, rot: 0 },
]

/** Eight resize anchors as unit directions from the centre. */
const ANCHORS = [
  { nx: -1, ny: -1, css: "-top-1.5 -left-1.5", cursor: "nwse-resize" },
  { nx: 0, ny: -1, css: "-top-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { nx: 1, ny: -1, css: "-top-1.5 -right-1.5", cursor: "nesw-resize" },
  { nx: -1, ny: 0, css: "top-1/2 -left-1.5 -translate-y-1/2", cursor: "ew-resize" },
  { nx: 1, ny: 0, css: "top-1/2 -right-1.5 -translate-y-1/2", cursor: "ew-resize" },
  { nx: -1, ny: 1, css: "-bottom-1.5 -left-1.5", cursor: "nesw-resize" },
  { nx: 0, ny: 1, css: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "ns-resize" },
  { nx: 1, ny: 1, css: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
] as const

const rad = (deg: number) => (deg * Math.PI) / 180
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Rotate a vector by `deg`. Used to move between screen space and an element's own axes. */
function spin(x: number, y: number, deg: number) {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: x * c - y * s, y: x * s + y * c }
}

type Drag =
  | { mode: "move"; id: string; dx: number; dy: number }
  | { mode: "resize"; id: string; nx: number; ny: number; start: El; ox: number; oy: number }
  | { mode: "rotate"; id: string }

export function LiveSlide({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  const t = useT()
  const sheet = useRef<HTMLDivElement>(null)
  const [els, setEls] = useState<El[]>(INITIAL)
  const [active, setActive] = useState<string | null>("title")
  const [drag, setDrag] = useState<Drag | null>(null)
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const [touched, setTouched] = useState(false)

  const selected = els.find((el) => el.id === active) ?? null

  /** Pointer position in slide coordinates. */
  const toLocal = useCallback((event: React.PointerEvent) => {
    const rect = sheet.current!.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }, [])

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const p = toLocal(event)

    if (drag.mode === "move") {
      let cx = p.x - drag.dx
      let cy = p.y - drag.dy
      // snap to the slide's centrelines, the two guides the real canvas shows most
      const nearX = Math.abs(cx - W / 2) < SNAP
      const nearY = Math.abs(cy - H / 2) < SNAP
      if (nearX) cx = W / 2
      if (nearY) cy = H / 2
      setGuides({ x: nearX, y: nearY })
      // keep the element on the sheet — nobody wants to lose the headline off-canvas
      setEls((list) =>
        list.map((el) =>
          el.id === drag.id
            ? { ...el, cx: clamp(cx, 24, W - 24), cy: clamp(cy, 20, H - 20) }
            : el,
        ),
      )
      return
    }

    if (drag.mode === "resize") {
      const { start, nx, ny } = drag
      // the drag vector is in screen space; rotate it into the element's own axes so a
      // rotated box grows along its own edges rather than the screen's
      const local = spin(p.x - drag.ox, p.y - drag.oy, -start.rot)
      const w = Math.max(MIN, start.w + nx * local.x)
      const h = Math.max(MIN, start.h + ny * local.y)
      // growing from an edge moves the centre by half of the growth, back in screen space
      const shift = spin((nx * (w - start.w)) / 2, (ny * (h - start.h)) / 2, start.rot)
      setEls((list) =>
        list.map((el) =>
          el.id === drag.id
            ? { ...el, w, h, cx: start.cx + shift.x, cy: start.cy + shift.y }
            : el,
        ),
      )
      return
    }

    setEls((list) =>
      list.map((el) => {
        if (el.id !== drag.id) return el
        const deg = (Math.atan2(p.y - el.cy, p.x - el.cx) * 180) / Math.PI + 90
        const snapped = Math.round(deg / 15) * 15
        return { ...el, rot: Math.abs(deg - snapped) < 4 ? snapped : deg }
      }),
    )
  }

  const endDrag = (event: React.PointerEvent) => {
    if (drag) event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDrag(null)
    setGuides({ x: false, y: false })
  }

  const startMove = (event: React.PointerEvent, el: El) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const p = toLocal(event)
    setActive(el.id)
    setTouched(true)
    setDrag({ mode: "move", id: el.id, dx: p.x - el.cx, dy: p.y - el.cy })
  }

  /** Arrow keys nudge, so the thing is usable without a pointer at all. */
  const onKeyDown = (event: React.KeyboardEvent, el: El) => {
    const step = event.shiftKey ? 20 : 4
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = move[event.key]
    if (!delta) return
    event.preventDefault()
    setTouched(true)
    setEls((list) =>
      list.map((item) =>
        item.id === el.id
          ? {
              ...item,
              cx: clamp(item.cx + delta[0], 24, W - 24),
              cy: clamp(item.cy + delta[1], 20, H - 20),
            }
          : item,
      ),
    )
  }

  return (
    <div style={style} className={cn("select-none", className)}>
      <div
        ref={sheet}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={() => setActive(null)}
        style={{ containerType: "inline-size" }}
        // clipped like the real canvas: a rotated element must not paint over the page
        // — and the sheet is always white, so what separates it from the page has to
        // come from the theme: a lit rim on graphite, a cast shadow on paper
        className="relative aspect-video touch-none overflow-hidden bg-white shadow-[var(--sheet-shadow)] ring-1 ring-[var(--sheet-ring)]"
      >
        {els.map((el) => (
          <ElementBox
            key={el.id}
            el={el}
            active={el.id === active}
            onPointerDown={(event) => startMove(event, el)}
            onKeyDown={(event) => onKeyDown(event, el)}
            onResizeStart={(event, anchor) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              const p = toLocal(event)
              setActive(el.id)
              setTouched(true)
              setDrag({
                mode: "resize",
                id: el.id,
                nx: anchor.nx,
                ny: anchor.ny,
                start: el,
                ox: p.x,
                oy: p.y,
              })
            }}
            onRotateStart={(event) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              setActive(el.id)
              setTouched(true)
              setDrag({ mode: "rotate", id: el.id })
            }}
          />
        ))}

        {guides.x && <div className="absolute inset-y-0 left-1/2 w-px bg-[#2563eb]" />}
        {guides.y && <div className="absolute inset-x-0 top-1/2 h-px bg-[#2563eb]" />}
      </div>

      {/* the editor's status bar, telling the truth about what is selected */}
      <div className="mt-px flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground">
        <span className={cn("transition-colors", touched && "text-primary")}>
          {touched ? t("demo.hintTouched") : t("demo.hintIdle")}
        </span>
        {selected ? (
          <span className="tabular-nums">
            x {Math.round(selected.cx - selected.w / 2)} · y{" "}
            {Math.round(selected.cy - selected.h / 2)} · w {Math.round(selected.w)} · h{" "}
            {Math.round(selected.h)} · {Math.round(selected.rot)}°
          </span>
        ) : (
          <span className="tabular-nums">{t("demo.noSelection")}</span>
        )}
        <button
          onClick={() => {
            setEls(INITIAL)
            setActive("title")
            setTouched(false)
          }}
          className="ml-auto underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {t("demo.reset")}
        </button>
      </div>
    </div>
  )
}

function ElementBox({
  el,
  active,
  onPointerDown,
  onKeyDown,
  onResizeStart,
  onRotateStart,
}: {
  el: El
  active: boolean
  onPointerDown: (event: React.PointerEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onResizeStart: (event: React.PointerEvent, anchor: (typeof ANCHORS)[number]) => void
  onRotateStart: (event: React.PointerEvent) => void
}) {
  const t = useT()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("demo.element")}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{
        left: `${((el.cx - el.w / 2) / W) * 100}%`,
        top: `${((el.cy - el.h / 2) / H) * 100}%`,
        width: `${(el.w / W) * 100}%`,
        height: `${(el.h / H) * 100}%`,
        rotate: `${el.rot}deg`,
      }}
      className="absolute cursor-move touch-none outline-none"
    >
      <Content kind={el.kind} />

      {active && (
        <>
          <span className="pointer-events-none absolute -inset-px ring-1 ring-[#2563eb]" />
          {ANCHORS.map((anchor) => (
            <span
              key={`${anchor.nx}${anchor.ny}`}
              onPointerDown={(event) => onResizeStart(event, anchor)}
              style={{ cursor: anchor.cursor }}
              className={cn(
                "absolute size-2.5 border border-[#2563eb] bg-white",
                anchor.css,
              )}
            />
          ))}
          <span className="pointer-events-none absolute -top-5 left-1/2 h-4 w-px -translate-x-1/2 bg-[#2563eb]" />
          <span
            onPointerDown={onRotateStart}
            className="absolute -top-7 left-1/2 size-2.5 -translate-x-1/2 cursor-grab rounded-full border border-[#2563eb] bg-white active:cursor-grabbing"
          />
        </>
      )}
    </div>
  )
}

/**
 * Slide content is fixed dark-on-white, never themed: this is the user's document sitting
 * on the app's chrome. Sizes are in `cqw` so the type scales with the sheet exactly the
 * way the editor's CSS transform scales the real canvas.
 */
function Content({ kind }: { kind: Kind }) {
  const t = useT()
  if (kind === "eyebrow") {
    return (
      <p
        style={{ fontSize: "1.5cqw", letterSpacing: "0.3em" }}
        className="font-mono text-neutral-500 uppercase"
      >
        {t("demo.kicker")}
      </p>
    )
  }

  if (kind === "title") {
    return (
      <h1
        style={{ fontSize: "6.2cqw", lineHeight: 1.08 }}
        className="font-black tracking-[-0.03em] text-neutral-900"
      >
        {t("demo.titleLine1")}
        <br />
        {t("demo.titleLine2")}
      </h1>
    )
  }

  if (kind === "body") {
    return (
      <p
        style={{ fontSize: "1.9cqw", lineHeight: 1.7 }}
        className="text-neutral-600"
      >
        {t("demo.body")}
      </p>
    )
  }

  if (kind === "block") {
    return (
      <div className="size-full bg-[#2563eb]/10 ring-1 ring-[#2563eb]/30">
        <div className="flex h-full flex-col justify-end gap-[6%] p-[8%]">
          <div className="h-[6%] w-3/4 bg-[#2563eb]/45" />
          <div className="h-[6%] w-1/2 bg-[#2563eb]/30" />
          <div className="h-[6%] w-2/3 bg-[#2563eb]/30" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex size-full items-end gap-[4%]">
      {[46, 72, 38, 96, 60].map((height, index) => (
        <div
          key={height}
          style={{
            height: `${height}%`,
            background: index === 3 ? "#2563eb" : "rgb(23 23 23 / 0.18)",
          }}
          className="flex-1"
        />
      ))}
    </div>
  )
}
