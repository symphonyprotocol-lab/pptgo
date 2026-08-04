"use client"

import { useEffect, useState } from "react"
import { SlideThumbnail } from "@/components/editor/slide-view"
import { createSlide, normalizeElement } from "@/lib/factory"
import type { Translate } from "@/lib/i18n/translate"
import type { DeckSummary } from "@/types/deck"
import type { Slide, SlideElement } from "@/types/slides"

/**
 * The picture on a dashboard tile.
 *
 * First choice is the PNG the editor uploaded after a save — one request, already sized,
 * and it costs the browser nothing to draw. But a deck can have no stored render at all:
 * nothing is uploaded until something is saved, so a deck created through the API, or
 * opened and read without being touched, has never had one made. Those tiles said "no
 * preview", which describes the storage rather than the deck — the slide is right there.
 *
 * So the fallback is to draw slide one with the same renderer the editor uses, from the
 * one slide `/cover` sends back. It is only fetched for the tiles that need it.
 */
export function DeckCover({ deck, t }: { deck: DeckSummary; t: Translate }) {
  const [slide, setSlide] = useState<Slide | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (deck.hasThumbnail) return
    let cancelled = false
    // `v` is not read by the route; it is what lets the response be cached immutably and
    // still change when the deck does, exactly as the stored thumbnail is cached
    fetch(`/api/decks/${deck.id}/cover?v=${encodeURIComponent(deck.updatedAt)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((body: { slide: Slide }) => {
        if (!cancelled) setSlide(normalizeSlide(body.slide))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [deck.id, deck.hasThumbnail, deck.updatedAt])

  if (deck.hasThumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by an authorised API route, not a static asset
      <img
        src={`/api/decks/${deck.id}/thumbnail?v=${encodeURIComponent(deck.updatedAt)}`}
        alt=""
        className="size-full object-cover"
        loading="lazy"
      />
    )
  }

  if (slide) return <SlideThumbnail slide={slide} />

  return (
    <div className="flex size-full items-center justify-center bg-muted">
      {/* nothing is said while the slide is on its way; only a deck that could not be
          read at all gets the label, and then it is the truth */}
      {failed && (
        <span className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
          {t("dashboard.noPreview")}
        </span>
      )}
    </div>
  )
}

/**
 * The stored slide has been through no client since it was written, and text elements are
 * rendered as HTML — so it goes through the same normaliser the editor opens a deck with,
 * which is where that HTML is sanitised.
 */
function normalizeSlide(raw: Slide): Slide {
  return {
    ...createSlide(),
    ...raw,
    elements: (Array.isArray(raw?.elements) ? raw.elements : [])
      .map((element) => normalizeElement(element))
      .filter((element): element is SlideElement => element !== null),
  }
}
