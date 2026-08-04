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
    /*
      Both `min-h-0`s below are what make this list scroll rather than run off the bottom
      of the screen. A flex item's automatic minimum size is its content, so each of these
      boxes was floored at the height of every thumbnail stacked up — 4000-odd pixels for a
      43-slide deck — and overflowed its parent instead of scrolling inside it. Short decks
      fit, which is why it only showed up on a long one.
      The `aside` needs the same treatment: in the narrow layout it is a flex item of the
      drawer, where `shrink-0` — there to hold the sidebar's width in the wide layout — is
      pinning its *height* to its content instead, so `h-full` states the height outright.
    */
    <aside
      className={cn(
        "flex h-full min-h-0 w-52 shrink-0 flex-col border-r bg-background",
        className,
      )}
    >
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

      <ScrollArea className="min-h-0 flex-1">
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
              {/*
                `min-w-0` for the same reason as the `min-h-0`s above, on the other axis:
                a fluid thumbnail has no width of its own, so this flex item's automatic
                minimum size would be the slide's full 1000px and the rail would stretch to
                it instead of the thumbnail shrinking to the rail.
              */}
              <div className="group relative min-w-0 flex-1">
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
                  {/* no width: the card is the measure, so the slide fills it edge to edge */}
                  <SlideThumbnail slide={slide} />
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
