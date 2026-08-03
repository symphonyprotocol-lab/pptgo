"use client"

import { useState } from "react"
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useEditor } from "@/store/editor"
import { useT } from "@/lib/i18n/client"
import { SlideThumbnail } from "./slide-view"

export function SlideList({ className }: { className?: string } = {}) {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  return (
    <aside className={cn("flex w-52 shrink-0 flex-col border-r bg-background", className)}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("editor.slidesDrawer", { index: slideIndex + 1, total: slides.length })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => useEditor.getState().addSlide()}
          title={t("editor.newSlide")}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <ul className="space-y-2 p-3">
          {slides.map((slide, index) => (
            <li
              key={slide.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(index)
              }}
              onDragEnd={() => {
                if (dragIndex !== null && overIndex !== null) {
                  useEditor.getState().moveSlide(dragIndex, overIndex)
                }
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={cn(
                "flex items-center gap-2",
                overIndex === index && dragIndex !== null && "opacity-60",
              )}
            >
              <span className="w-4 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="group relative flex-1">
                <button
                  onClick={() => useEditor.getState().setSlideIndex(index)}
                  // the thumbnail is the whole label, so without this the list reads as a
                  // column of unnamed buttons — and which one is open has to be audible too
                  aria-label={t("panel.slideNumber", { index: index + 1 })}
                  aria-current={index === slideIndex ? "true" : undefined}
                  className={cn(
                    "block w-full overflow-hidden rounded-md border bg-white transition",
                    index === slideIndex
                      ? "border-primary ring-2 ring-primary/40"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <SlideThumbnail slide={slide} width={148} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`${t("panel.slideNumber", { index: index + 1 })} — ${t("editor.slideActions")}`}
                      className="absolute right-1 top-1 size-6 opacity-0 shadow group-hover:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => useEditor.getState().duplicateSlide(index)}>
                      <Copy className="size-4" /> {t("editor.duplicateSlide")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={slides.length <= 1}
                      onClick={() => useEditor.getState().deleteSlide(index)}
                    >
                      <Trash2 className="size-4" /> {t("editor.deleteSlide")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  )
}
