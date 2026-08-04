"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Maximize, PenLine, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PresentView } from "@/components/editor/present-view"
import { SlideThumbnail, SlideView } from "@/components/editor/slide-view"
import { SHARE_KEY_PARAM, SHARE_TOKEN_PARAM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { normalizeDeck } from "@/lib/factory"
import { useI18n } from "@/lib/i18n/client"
import { formatTime } from "@/lib/relative-time"
import { slideNumber } from "@/lib/slide-number"
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
  const [presenting, setPresenting] = useState(false)

  const followingRef = useRef(true)
  const versionRef = useRef(0)
  const slidesRef = useRef<Slide[]>([])
  const [scale, setScale] = useState(1)
  const stage = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)

  const setFollow = useCallback((value: boolean) => {
    followingRef.current = value
    setFollowing(value)
  }, [])

  const slideCount = deck?.slides.length ?? 0

  /**
   * Turning a page by hand, which is also a decision to stop being dragged around.
   *
   * Same rule as clicking a thumbnail: someone steering deliberately outranks whatever is
   * being written into the deck underneath them.
   */
  const turn = useCallback(
    (to: number | ((current: number) => number)) => {
      if (!slideCount) return
      setFollow(false)
      setIndex((current) => {
        const next = typeof to === "function" ? to(current) : to
        return Math.min(Math.max(next, 0), slideCount - 1)
      })
    },
    [slideCount, setFollow],
  )

  /*
    Arrow keys outside fullscreen too.

    Someone handed this link is reading a deck, not operating an app, and the keys that
    turn a page are the ones they already have their hand on. PresentView installs the same
    keys for the fullscreen case, so this one stands down while that is up rather than
    both firing and skipping two slides at a time.
  */
  useEffect(() => {
    if (presenting || slideCount < 2) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (/^(input|textarea|select)$/i.test(target?.tagName ?? "")) return

      if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) {
        event.preventDefault()
        turn((current) => current + 1)
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault()
        turn((current) => current - 1)
      } else if (event.key === "Home") {
        event.preventDefault()
        turn(0)
      } else if (event.key === "End") {
        event.preventDefault()
        turn(slideCount - 1)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [presenting, slideCount, turn])

  /*
    Keep the current thumbnail in the rail.

    Without this, paging with the keyboard walks the selection off the end of a rail that
    never scrolls — the slide changes and the highlighted thumbnail is somewhere off to the
    right, which reads as the rail having lost track rather than the page having turned.
  */
  useEffect(() => {
    const active = rail.current?.children[index] as HTMLElement | undefined
    active?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [index])

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

  // `index` can outrun the deck for one render when a slide is deleted under the reader
  const at = Math.min(index, deck.slides.length - 1)
  const current = deck.slides[at]

  /*
    The editor's own presentation view, handed the shared deck. It fits the window, takes
    arrow keys, and asks the browser for real fullscreen — so a reader following along on a
    link gets the same thing the owner gets, rather than a second, smaller implementation.
    Live updates keep arriving behind it: `slides` is the current deck on every render.
  */
  if (presenting) {
    return (
      <PresentView
        slides={deck.slides}
        startIndex={index}
        onExit={() => setPresenting(false)}
      />
    )
  }

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
            variant="ghost"
            className="h-7 px-2 text-xs"
            title={t("preview.fullscreenHint")}
            onClick={() => setPresenting(true)}
          >
            <Maximize className="size-3.5" />
            {t("preview.fullscreen")}
          </Button>

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

      {/*
        `overflow-hidden` is the backstop: the slide is sized from a measurement, and a
        measurement that is ever too generous should crop rather than spill over the
        thumbnail rail below.
      */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-stage p-6">
        {/*
          Measured here rather than on the padded parent. `clientWidth`/`clientHeight`
          include padding, so scaling against the parent sized every slide to a box 48px
          wider and taller than the one it is actually placed in — the slide overhung the
          stage on all four sides and covered the thumbnails underneath it.
        */}
        <div ref={stage} className="absolute inset-6 grid place-items-center">
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
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            title={`${t("preview.previous")} · ${t("preview.pageHint")}`}
            aria-label={t("preview.previous")}
            disabled={at === 0}
            onClick={() => turn((current) => current - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {/*
            Padded, and `tabular-nums` on top of it: the pad holds the character count and
            the figures hold their width, so the rail beside this never moves as you page.
            The aria-label below stays an ordinary integer — "01" is for looking at.
          */}
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground tabular-nums">
            {t("preview.position", {
              index: slideNumber(at + 1, deck.slides.length),
              total: deck.slides.length,
            })}
          </span>

          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            title={`${t("preview.next")} · ${t("preview.pageHint")}`}
            aria-label={t("preview.next")}
            disabled={at === deck.slides.length - 1}
            onClick={() => turn((current) => current + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div ref={rail} className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {deck.slides.map((slide, position) => (
            <button
              key={slide.id}
              onClick={() => turn(position)}
              className={cn(
                "shrink-0 border transition-colors",
                position === at ? "border-primary" : "border-border hover:border-foreground/40",
              )}
              aria-label={t("preview.position", {
                index: position + 1,
                total: deck.slides.length,
              })}
            >
              <SlideThumbnail slide={slide} width={104} />
            </button>
          ))}
        </div>
      </footer>
    </div>
  )
}
