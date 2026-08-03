"use client"

import { useState } from "react"
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Lock,
  Minus,
  Music,
  Shapes,
  Sigma,
  Table as TableIcon,
  Type,
  Unlock,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { htmlToPlainText } from "@/lib/sanitize"
import { elementLabel } from "@/lib/element-label"
import { useT } from "@/lib/i18n/client"
import { useEditor } from "@/store/editor"
import type { Translate } from "@/lib/i18n/translate"
import type { SlideElement } from "@/types/slides"

const ICONS = {
  text: Type,
  image: ImageIcon,
  shape: Shapes,
  line: Minus,
  table: TableIcon,
  chart: BarChart3,
  video: Video,
  audio: Music,
  formula: Sigma,
} as const

function labelOf(el: SlideElement, t: Translate): string {
  if (el.type === "text") {
    const text = htmlToPlainText(el.content).trim().replace(/\s+/g, " ")
    return text ? text.slice(0, 18) : elementLabel(el, t)
  }
  if (el.type === "shape") {
    const text = htmlToPlainText(el.text.content).trim()
    const name = elementLabel(el, t)
    return text ? `${name} · ${text.slice(0, 12)}` : name
  }
  return elementLabel(el, t)
}

/**
 * PPTist's selection panel: every element on the slide, topmost first, with the lock toggle
 * that is otherwise unreachable once an element is locked.
 */
export function LayerPanel() {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const activeIds = useEditor((s) => s.activeIds)
  const [open, setOpen] = useState(true)

  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  // the store keeps painter's order; the panel reads top-down like a layer stack
  const layers = [...slide.elements].reverse()

  return (
    <div className="border-t">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/50"
      >
        {t("layers.heading", { count: slide.elements.length })}
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      </button>

      {open && (
        <ul className="max-h-56 overflow-y-auto px-2 pb-2">
          {!layers.length && (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">{t("layers.empty")}</li>
          )}
          {layers.map((el, position) => {
            const Icon = ICONS[el.type]
            const selected = activeIds.includes(el.id)
            // position counts from the top of the stack; the store indexes from the bottom
            const storeIndex = slide.elements.length - 1 - position
            return (
              <li key={el.id} className="flex items-center gap-1">
                <button
                  onClick={(event) => {
                    const store = useEditor.getState()
                    if (event.shiftKey || event.metaKey || event.ctrlKey) store.toggleActiveId(el.id)
                    else store.setActiveIds([el.id])
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition",
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    el.lock && "opacity-60",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{labelOf(el, t)}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  title={el.lock ? t("panel.unlock") : t("panel.lock")}
                  onClick={() => useEditor.getState().toggleLock([el.id])}
                >
                  {el.lock ? (
                    <Lock className="size-3 text-amber-500" />
                  ) : (
                    <Unlock className="size-3 opacity-50" />
                  )}
                </Button>
                <div className="flex shrink-0 flex-col">
                  <button
                    className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={position === 0}
                    title={t("layers.moveUp")}
                    onClick={() => useEditor.getState().setElementIndex(el.id, storeIndex + 1)}
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={position === layers.length - 1}
                    title={t("layers.moveDown")}
                    onClick={() => useEditor.getState().setElementIndex(el.id, storeIndex - 1)}
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
