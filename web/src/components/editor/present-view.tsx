"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  LayoutGrid,
  Maximize,
  MousePointer2,
  Pause,
  Pen,
  Play,
  Square,
  StickyNote,
  Timer,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { totalSteps } from "@/lib/animation"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"
import type { Slide, TransitionType } from "@/types/slides"
import { SlideThumbnail, SlideView } from "./slide-view"

interface Props {
  slides: Slide[]
  startIndex: number
  onExit: () => void
}

type Tool = "none" | "pen" | "highlighter" | "eraser"

const TRANSITION_ANIMATION: Record<TransitionType, string | undefined> = {
  none: undefined,
  fade: "slideTransitionFade",
  slideX: "slideTransitionSlideX",
  slideY: "slideTransitionSlideY",
  zoom: "slideTransitionZoom",
}

const PEN_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#111827", "#ffffff"]

/**
 * How long the room has to be still before the controls fade.
 *
 * Long enough to reach for a button after deciding to, short enough that the first slide is
 * clean by the time anybody is looking at it.
 */
const IDLE_DELAY = 2500

export function PresentView({ slides, startIndex, onExit }: Props) {
  const t = useT()
  const [index, setIndex] = useState(startIndex)
  const [step, setStep] = useState(0)
  const [scale, setScale] = useState(1)
  const [showNotes, setShowNotes] = useState(false)
  const [showThumbs, setShowThumbs] = useState(false)
  const [tool, setTool] = useState<Tool>("none")
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [blackboard, setBlackboard] = useState(false)
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null)
  const [autoplay, setAutoplay] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [showTimer, setShowTimer] = useState(false)
  /** Whether the control bar has faded out because nobody has moved for a while. */
  const [idle, setIdle] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // one saved drawing per slide, so annotations survive navigation
  const strokes = useRef(new Map<string, string>())

  const slide = slides[Math.min(index, slides.length - 1)]
  const stepCount = useMemo(() => totalSteps(slide.animations), [slide.animations])

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT))
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  /**
   * A `useState` updater has to be a pure function of the previous value. These three used
   * to set one piece of state from inside another's updater, which React is free to call
   * more than once — and in development it deliberately does. Every tap of "next" ran the
   * nested `setIndex` twice and skipped a slide: 1, 3, 5.
   */
  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(next, slides.length - 1)))
      setStep(0)
    },
    [slides.length],
  )

  /** Advance the animation on this slide first, then move on. */
  const advance = useCallback(() => {
    if (step < stepCount) {
      setStep(step + 1)
      return
    }
    setStep(0)
    setIndex((i) => Math.min(i + 1, slides.length - 1))
  }, [step, stepCount, slides.length])

  const retreat = useCallback(() => {
    if (step > 0) {
      setStep(step - 1)
      return
    }
    setIndex((i) => Math.max(i - 1, 0))
  }, [step])

  useEffect(() => {
    if (!autoplay) return
    const id = window.setInterval(advance, 3000)
    return () => window.clearInterval(id)
  }, [autoplay, advance])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key
      if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(key)) {
        event.preventDefault()
        advance()
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(key)) {
        event.preventDefault()
        retreat()
      } else if (key === "Escape") {
        if (tool !== "none") setTool("none")
        else onExit()
      } else if (key.toLowerCase() === "n") {
        setShowNotes((v) => !v)
      } else if (key.toLowerCase() === "b") {
        setBlackboard((v) => !v)
      } else if (key.toLowerCase() === "p") {
        setTool((v) => (v === "pen" ? "none" : "pen"))
      } else if (key.toLowerCase() === "l") {
        setLaser((v) => (v ? null : { x: -100, y: -100 }))
      } else if (key === "Home") {
        goTo(0)
      } else if (key === "End") {
        goTo(slides.length - 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [advance, retreat, goTo, onExit, slides.length, tool])

  // annotations are saved per slide on pointer-up; this restores the saved one whenever
  // the visible slide changes
  const slideId = slide.id
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const saved = strokes.current.get(slideId)
    if (saved) {
      const image = new Image()
      image.onload = () => ctx.drawImage(image, 0, 0)
      image.src = saved
    }
  }, [slideId])

  const persistStrokes = () => {
    const canvas = canvasRef.current
    if (canvas) strokes.current.set(slideId, canvas.toDataURL())
  }

  const pointOn = (event: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (tool === "none") return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    drawing.current = true
    canvas.setPointerCapture(event.pointerId)
    const { x, y } = pointOn(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.lineWidth = 24
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = penColor
      ctx.lineWidth = tool === "highlighter" ? 18 : 3
      ctx.globalAlpha = tool === "highlighter" ? 0.35 : 1
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (laser) {
      const rect = canvasRef.current!.getBoundingClientRect()
      setLaser({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const { x, y } = pointOn(event)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  /*
    The chrome gets out of the way.

    A presentation is the slide, and a row of buttons floating over the bottom of it is in
    every photograph anyone takes of the screen. So it fades once the room has settled and
    comes back the moment the presenter touches anything — the same bargain every other
    presentation tool makes, and the reason nobody notices it is there.

    Two things hold it open. Annotating, because the pen palette is what the presenter is
    reaching for and a presenter who pauses to think should not have to hunt for it again;
    and the pointer resting on the bar itself, or moving toward a button would dismiss the
    button.
  */
  const annotating = tool !== "none" || Boolean(laser)
  const overControls = useRef(false)
  const idleTimer = useRef<number | null>(null)

  /** Restart the countdown. Schedules only — nothing here sets state on the spot. */
  const arm = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    if (annotating) return
    idleTimer.current = window.setTimeout(() => {
      if (!overControls.current) setIdle(true)
    }, IDLE_DELAY)
  }, [annotating])

  useEffect(() => {
    // re-armed rather than woken when `annotating` flips: picking up the pen is a click,
    // and the click already showed the bar on its way through the listener below
    arm()

    const wake = () => {
      setIdle(false)
      arm()
    }
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const
    for (const name of events) window.addEventListener(name, wake, { passive: true })

    return () => {
      for (const name of events) window.removeEventListener(name, wake)
      if (idleTimer.current) window.clearTimeout(idleTimer.current)
    }
  }, [arm])

  const onPointerUp = () => {
    if (!drawing.current) return
    drawing.current = false
    const ctx = canvasRef.current!.getContext("2d")!
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
    persistStrokes()
  }

  const clearAnnotations = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
    strokes.current.delete(slideId)
  }

  /** Horizontal swipe pages the deck; a mostly-vertical drag is left to the browser. */
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onSwipeStart = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch" || tool !== "none") return
    swipe.current = { x: event.clientX, y: event.clientY }
  }
  const onSwipeEnd = (event: React.PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start || event.pointerType !== "touch") return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) advance()
    else retreat()
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void rootRef.current?.requestFullscreen().catch(() => {})
  }

  /**
   * A link on an element, followed. A slide link jumps within the deck; a web link opens
   * in a new tab, and `noopener` is what stops the opened page from reaching back through
   * `window.opener` into a presentation that may be on a shared screen.
   */
  const followLink = useCallback(
    (link: NonNullable<Slide["elements"][number]["link"]>) => {
      if (link.type === "slide") {
        const index = slides.findIndex((s) => s.id === link.target)
        if (index >= 0) goTo(index)
        return
      }
      window.open(link.target, "_blank", "noopener,noreferrer")
    },
    [slides, goTo],
  )

  const transition = TRANSITION_ANIMATION[slide.transition ?? "none"]

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex touch-none items-center justify-center bg-black"
      // the pointer goes with the chrome — a cursor parked over a slide is the other thing
      // that ends up in the photograph
      style={idle ? { cursor: "none" } : undefined}
      onClick={(event) => {
        // a swipe ends with a click too; only a stationary tap should advance
        if (tool === "none" && event.detail !== 0) advance()
      }}
      onPointerDown={onSwipeStart}
      onPointerUp={onSwipeEnd}
      onContextMenu={(e) => {
        e.preventDefault()
        retreat()
      }}
    >
      <div
        className="relative"
        style={{ width: VIEWPORT_WIDTH * scale, height: VIEWPORT_HEIGHT * scale, overflow: "hidden" }}
      >
        <div
          key={slide.id}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            animationName: transition,
            animationDuration: transition ? "420ms" : undefined,
            animationFillMode: "both",
          }}
        >
          <SlideView slide={slide} animationStep={step} playable onFollowLink={followLink} />
        </div>

        {blackboard && <div className="absolute inset-0 bg-slate-900" />}

        <canvas
          ref={canvasRef}
          width={VIEWPORT_WIDTH}
          height={VIEWPORT_HEIGHT}
          className="absolute inset-0 h-full w-full"
          style={{
            pointerEvents: tool === "none" && !laser ? "none" : "auto",
            cursor: tool !== "none" ? "crosshair" : idle ? "none" : "default",
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        {laser && (
          <div
            className="pointer-events-none absolute size-4 rounded-full bg-red-500/80 shadow-[0_0_18px_6px_rgba(239,68,68,0.6)]"
            style={{ left: laser.x - 8, top: laser.y - 8 }}
          />
        )}
      </div>

      {showNotes && slide.notes && (
        <div className="absolute inset-x-0 bottom-16 mx-auto max-w-3xl whitespace-pre-wrap rounded-lg bg-white/90 p-4 text-sm text-slate-900 shadow-lg">
          {slide.notes}
        </div>
      )}

      {showTimer && (
        <div className="absolute right-4 top-4 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white tabular-nums backdrop-blur">
          {formatTime(elapsed)}
        </div>
      )}

      {showThumbs && (
        <div
          className="absolute inset-x-0 bottom-16 mx-auto flex max-w-[90vw] gap-2 overflow-x-auto rounded-lg bg-white/10 p-2 backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          {slides.map((item, i) => (
            <button
              key={item.id}
              onClick={() => {
                goTo(i)
                setShowThumbs(false)
              }}
              className={cn(
                "shrink-0 overflow-hidden rounded border-2",
                i === index ? "border-white" : "border-transparent opacity-70",
              )}
            >
              <SlideThumbnail slide={item} width={120} />
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          "absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-2 py-1 backdrop-blur",
          "transition-opacity duration-500",
          // not merely invisible: a bar that is still clickable while it cannot be seen
          // turns a stray tap on the slide into a pen or an exit
          idle && "pointer-events-none opacity-0",
        )}
        onPointerEnter={() => {
          overControls.current = true
        }}
        onPointerLeave={() => {
          overControls.current = false
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ControlButton title={t("present.previous")} onClick={retreat}>
          <ChevronLeft className="size-4" />
        </ControlButton>
        <span className="min-w-16 text-center text-xs text-white tabular-nums">
          {index + 1} / {slides.length}
          {stepCount > 0 && ` · ${step}/${stepCount}`}
        </span>
        <ControlButton title={t("present.next")} onClick={advance}>
          <ChevronRight className="size-4" />
        </ControlButton>

        <Separator />

        <ControlButton title={t("present.pen")} active={tool === "pen"} onClick={() => setTool(tool === "pen" ? "none" : "pen")}>
          <Pen className="size-4" />
        </ControlButton>
        <ControlButton
          title={t("present.highlighter")}
          active={tool === "highlighter"}
          onClick={() => setTool(tool === "highlighter" ? "none" : "highlighter")}
        >
          <Highlighter className="size-4" />
        </ControlButton>
        <ControlButton
          title={t("present.eraser")}
          active={tool === "eraser"}
          onClick={() => setTool(tool === "eraser" ? "none" : "eraser")}
        >
          <Eraser className="size-4" />
        </ControlButton>
        {tool !== "none" && tool !== "eraser" && (
          <div className="flex items-center gap-1 px-1">
            {PEN_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setPenColor(color)}
                className={cn(
                  "size-4 rounded-full border",
                  penColor === color ? "ring-2 ring-white" : "border-white/40",
                )}
                style={{ background: color }}
              />
            ))}
          </div>
        )}
        <ControlButton title={t("present.clearAnnotations")} onClick={clearAnnotations}>
          <Trash2 className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.laser")} active={!!laser} onClick={() => setLaser(laser ? null : { x: -100, y: -100 })}>
          <MousePointer2 className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.blackboard")} active={blackboard} onClick={() => setBlackboard((v) => !v)}>
          <Square className="size-4" />
        </ControlButton>

        <Separator />

        <ControlButton title={t("present.autoplay")} active={autoplay} onClick={() => setAutoplay((v) => !v)}>
          {autoplay ? <Pause className="size-4" /> : <Play className="size-4" />}
        </ControlButton>
        <ControlButton title={t("present.timer")} active={showTimer} onClick={() => setShowTimer((v) => !v)}>
          <Timer className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.thumbnails")} active={showThumbs} onClick={() => setShowThumbs((v) => !v)}>
          <LayoutGrid className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.notes")} active={showNotes} onClick={() => setShowNotes((v) => !v)}>
          <StickyNote className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.fullscreen")} onClick={toggleFullscreen}>
          <Maximize className="size-4" />
        </ControlButton>
        <ControlButton title={t("present.exit")} onClick={onExit}>
          <X className="size-4" />
        </ControlButton>
      </div>
    </div>
  )
}

const Separator = () => <span className="mx-1 h-5 w-px bg-white/25" />

function ControlButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      onClick={onClick}
      className={cn(
        "size-8 text-white hover:bg-white/20 hover:text-white",
        active && "bg-white/25",
      )}
    >
      {children}
    </Button>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}
