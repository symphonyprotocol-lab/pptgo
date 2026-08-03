"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { htmlToPlainText, replaceInHtmlText } from "@/lib/sanitize"
import { useEditor } from "@/store/editor"
import type { Slide, SlideElement } from "@/types/slides"

interface Hit {
  slideIndex: number
  elementId: string
  preview: string
}

const textOf = (el: SlideElement): string => {
  if (el.type === "text") return htmlToPlainText(el.content)
  if (el.type === "shape") return htmlToPlainText(el.text.content)
  if (el.type === "table") return el.rows.flat().map((cell) => cell.text).join(" ")
  return ""
}

function findHits(slides: Slide[], query: string): Hit[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const hits: Hit[] = []
  slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      const text = textOf(el)
      const at = text.toLowerCase().indexOf(needle)
      if (at < 0) continue
      hits.push({
        slideIndex,
        elementId: el.id,
        preview: text.slice(Math.max(0, at - 12), at + query.length + 12).trim(),
      })
    }
  })
  return hits
}

/** Plain-text find and replace across every slide. */
export function FindReplace({ onClose }: { onClose: () => void }) {
  const slides = useEditor((s) => s.slides)
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")

  const hits = useMemo(() => findHits(slides, query), [slides, query])

  const goTo = (hit: Hit) => {
    const store = useEditor.getState()
    store.setSlideIndex(hit.slideIndex)
    store.setActiveIds([hit.elementId])
  }

  const replaceAll = () => {
    if (!query) return
    const store = useEditor.getState()
    store.commit()
    const pattern = new RegExp(escapeRegExp(query), "gi")

    const next = slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((el) => {
        // replaced inside the markup rather than rebuilt from plain text: rebuilding
        // returned the paragraph stripped of every bold run, colour and list it had
        if (el.type === "text") {
          const { html, replaced } = replaceInHtmlText(el.content, pattern, replacement)
          return replaced ? { ...el, content: html } : el
        }
        if (el.type === "shape") {
          const { html, replaced } = replaceInHtmlText(el.text.content, pattern, replacement)
          return replaced ? { ...el, text: { ...el.text, content: html } } : el
        }
        if (el.type === "table") {
          return {
            ...el,
            rows: el.rows.map((row) =>
              row.map((cell) => {
                pattern.lastIndex = 0
                return { ...cell, text: cell.text.replace(pattern, replacement) }
              }),
            ),
          }
        }
        return el
      }),
    }))

    // not `loadDeck`: that is the *open a deck* path, so it drops undo history and jumps
    // to slide 1 — which made the single most destructive text operation in the editor
    // irreversible, and moved you away from the slide you were looking at
    store.setSlides(next)
  }

  return (
    <div className="absolute right-3 top-14 z-50 w-80 rounded-lg border bg-popover p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">查找和替换</span>
        <Button variant="ghost" size="icon" className="size-6" aria-label="关闭" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">查找</Label>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">替换为</Label>
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {query ? `${hits.length} 处匹配` : "输入要查找的内容"}
        </span>
        <Button size="sm" disabled={!hits.length} onClick={replaceAll}>
          全部替换
        </Button>
      </div>

      {!!hits.length && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {hits.map((hit, i) => (
            <li key={`${hit.elementId}-${i}`}>
              <button
                onClick={() => goTo(hit)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="shrink-0 text-muted-foreground">第 {hit.slideIndex + 1} 页</span>
                <span className="truncate">{hit.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
