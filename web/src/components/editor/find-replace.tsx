"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { htmlToPlainText, replaceInHtmlText } from "@/lib/sanitize"
import { useEditor } from "@/store/editor"
import { useT } from "@/lib/i18n/client"
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

/**
 * One entry per element that contains the term, plus how many times it occurs in total.
 *
 * The two numbers are different and the readout wants the second one. It used to show
 * `hits.length` labelled as matches, so a slide whose title said "draft" three times
 * reported one — and "Replace all" then changed three, which looked like it had
 * overreached.
 */
function findHits(slides: Slide[], query: string): { hits: Hit[]; matches: number } {
  if (!query) return { hits: [], matches: 0 }
  const needle = query.toLowerCase()
  const hits: Hit[] = []
  let matches = 0

  slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      const text = textOf(el)
      const haystack = text.toLowerCase()
      const at = haystack.indexOf(needle)
      if (at < 0) continue

      for (let from = at; from >= 0; from = haystack.indexOf(needle, from + needle.length)) {
        matches += 1
      }
      hits.push({
        slideIndex,
        elementId: el.id,
        preview: text.slice(Math.max(0, at - 12), at + query.length + 12).trim(),
      })
    }
  })
  return { hits, matches }
}

/** Plain-text find and replace across every slide. */
export function FindReplace({ onClose }: { onClose: () => void }) {
  const t = useT()
  const slides = useEditor((s) => s.slides)
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")

  const { hits, matches: matchCount } = useMemo(() => findHits(slides, query), [slides, query])

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
        <span className="text-sm font-medium">{t("find.title")}</span>
        <Button variant="ghost" size="icon" className="size-6" aria-label={t("find.close")} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">{t("find.query")}</Label>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">{t("find.replacement")}</Label>
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {query ? t("find.matches", { count: matchCount }) : t("find.prompt")}
        </span>
        <Button size="sm" disabled={!hits.length} onClick={replaceAll}>
          {t("find.replaceAll")}
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
                <span className="shrink-0 text-muted-foreground">
                  {t("find.onSlide", { index: hit.slideIndex + 1 })}
                </span>
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
