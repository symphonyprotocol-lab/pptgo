"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { PenLine, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SlideThumbnail, SlideView } from "@/components/editor/slide-view"
import { SHARE_KEY_PARAM, SHARE_TOKEN_PARAM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { normalizeDeck } from "@/lib/factory"
import { useI18n } from "@/lib/i18n/client"
import { formatTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import type { Deck, Slide } from "@/types/slides"
import type { DeckSummary } from "@/types/deck"

/**
 * Faster than the editor's four seconds. The editor is polling to avoid a surprise; this
 * page exists to be watched while something writes to it, and a deck appearing a page at a
 * time is the whole point. It is still one indexed row per tick — `/version` never opens
 * the document.
 */
const POLL_INTERVAL = 1500

/**
 * The first slide that is new or different, in the new deck's own order.
 *
 * This is what turns a polling reader into something worth watching: without it a person
 * has to notice that the thumbnail rail grew and click the new page themselves, which is
 * exactly the moment they would rather be watching than clicking.
 */
function changedIndex(before: Slide[], after: Slide[]): number | null {
  const previous = new Map(before.map((slide) => [slide.id, slide]))
  for (const [index, slide] of after.entries()) {
    const was = previous.get(slide.id)
    if (!was) return index
    if (JSON.stringify(was) !== JSON.stringify(slide)) return index
  }
  return null
}

export function PreviewShell({
  deckId,
  previewKey,
  shareToken,
  canEdit,
}: {
  deckId: string
  /** The signed, expiring key on an agent's preview link. */
  previewKey?: string
  /** The token on an owner's read-only share link. */
  shareToken?: string
  canEdit: boolean
}) {
  const { t, locale } = useI18n()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [summary, setSummary] = useState<DeckSummary | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /**
   * Whether new writes drag the view along. On by default — someone opening this link is
   * here to watch — and switched off the moment they pick a slide themselves, because a
   * page that yanks you away every second while you are reading is worse than one that
   * makes you click.
   */
  const [following, setFollowing] = useState(true)
  const [jumped, setJumped] = useState<number | null>(null)

  const followingRef = useRef(true)
  const versionRef = useRef(0)
  const slidesRef = useRef<Slide[]>([])
  const [scale, setScale] = useState(1)
  const stage = useRef<HTMLDivElement>(null)

  const setFollow = (value: boolean) => {
    followingRef.current = value
    setFollowing(value)
  }

  /**
   * Whichever link got the reader here, repeated on every read. Nothing at all when they
   * arrived with a session, which the API falls back to.
   */
  const query = previewKey
    ? `?${SHARE_KEY_PARAM}=${encodeURIComponent(previewKey)}`
    : shareToken
      ? `?${SHARE_TOKEN_PARAM}=${encodeURIComponent(shareToken)}`
      : ""

  const load = useCallback(async () => {
    const response = await fetch(`/api/decks/${deckId}${query}`, { cache: "no-store" })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `${response.status}`)
    }
    const body = (await response.json()) as { deck: Deck; summary: DeckSummary }
    // the same re-sanitising the editor does on load: what is stored is rendered with
    // dangerouslySetInnerHTML, and this page renders it without ever having written it
    return { deck: normalizeDeck(body.deck, t), summary: body.summary }
  }, [deckId, query, t])

  useEffect(() => {
    let cancelled = false
    load()
      .then(({ deck, summary }) => {
        if (cancelled) return
        versionRef.current = summary.version
        slidesRef.current = deck.slides
        setDeck(deck)
        setSummary(summary)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || document.hidden || !versionRef.current) return

      let remote: number
      try {
        const response = await fetch(`/api/decks/${deckId}/version${query}`, {
          cache: "no-store",
        })
        if (!response.ok) return
        remote = ((await response.json()) as { version: number }).version
      } catch {
        // a poll that fails says nothing about the deck; the next one will say the same
        // thing if it was real
        return
      }
      if (cancelled || remote <= versionRef.current) return

      try {
        const { deck, summary } = await load()
        if (cancelled) return
        const moved = changedIndex(slidesRef.current, deck.slides)

        versionRef.current = summary.version
        slidesRef.current = deck.slides
        setDeck(deck)
        setSummary(summary)
        setError(null)

        if (moved !== null) {
          setJumped(moved)
          if (followingRef.current) setIndex(moved)
        }
      } catch {
        // leave what is on screen — nothing here wrote it, so there is nothing to lose
      }
    }

    const timer = window.setInterval(() => void tick(), POLL_INTERVAL)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [deckId, query, load])

  useEffect(() => {
    if (jumped === null) return
    const timer = window.setTimeout(() => setJumped(null), 2500)
    return () => window.clearTimeout(timer)
  }, [jumped])

  // the slide is rendered at 1:1 and scaled, the way the editor and the presenter view do
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const measure = () =>
      setScale(
        Math.min(
          element.clientWidth / VIEWPORT_WIDTH,
          element.clientHeight / VIEWPORT_HEIGHT,
        ) || 1,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [deck])

  if (error) {
    return (
      <div className="grid flex-1 place-items-center bg-background p-8">
        <p className="text-sm text-destructive">{t("preview.loadFailed", { message: error })}</p>
      </div>
    )
  }

  if (!deck || !summary) return <div className="flex-1 bg-muted/40" />

  const current = deck.slides[Math.min(index, deck.slides.length - 1)]

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.24em] text-primary uppercase">
          <Radio className="size-3" />
          {t("preview.badge")}
        </span>

        <span className="min-w-0 truncate text-sm font-medium">{deck.title}</span>

        <span
          className="font-mono text-[11px] tracking-wider text-muted-foreground"
          suppressHydrationWarning
        >
          {t(deck.slides.length === 1 ? "preview.metaOne" : "preview.meta", {
            version: summary.version,
            count: deck.slides.length,
            time: formatTime(summary.updatedAt, t, locale),
          })}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={following ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            title={following ? t("preview.followOn") : t("preview.followOff")}
            onClick={() => {
              const next = !following
              setFollow(next)
              // turning it back on catches up, or the button would look like it did nothing
              if (next) setIndex(deck.slides.length - 1)
            }}
          >
            <Radio className={cn("size-3.5", following && "text-primary")} />
            {t("preview.follow")}
          </Button>

          {/* someone holding a link to a deck that is not theirs would only reach a 404 */}
          {canEdit && (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Link href={`/editor/${deckId}`}>
                <PenLine className="size-3.5" />
                {t("preview.openEditor")}
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div ref={stage} className="relative min-h-0 flex-1 bg-stage p-6">
        <div className="absolute inset-6 grid place-items-center">
          <div
            style={{
              width: VIEWPORT_WIDTH * scale,
              height: VIEWPORT_HEIGHT * scale,
              overflow: "hidden",
            }}
            className="shadow-2xl"
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
              <SlideView slide={current} />
            </div>
          </div>
        </div>

        {jumped !== null && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 border border-border bg-card px-3 py-1.5 font-mono text-[11px] tracking-wider shadow-lg">
            {t("preview.jumped", { index: jumped + 1 })}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-border px-4 py-2">
        <span className="shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground">
          {t("preview.position", { index: index + 1, total: deck.slides.length })}
        </span>

        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {deck.slides.map((slide, at) => (
            <button
              key={slide.id}
              onClick={() => {
                setIndex(at)
                // a deliberate choice of slide outranks whatever is being written
                setFollow(false)
              }}
              className={cn(
                "shrink-0 border transition-colors",
                at === index ? "border-primary" : "border-border hover:border-foreground/40",
              )}
              aria-label={t("preview.position", { index: at + 1, total: deck.slides.length })}
            >
              <SlideThumbnail slide={slide} width={104} />
            </button>
          ))}
        </div>
      </footer>
    </div>
  )
}
