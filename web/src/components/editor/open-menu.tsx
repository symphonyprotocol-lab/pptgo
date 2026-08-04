"use client"

import { useState } from "react"
import { ChevronDown, FilePlus2, Presentation, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createBlankDeck, normalizeDeck } from "@/lib/factory"
import { formatTime } from "@/lib/relative-time"
import { useI18n } from "@/lib/i18n/client"
import { useEditor } from "@/store/editor"
import type { DeckLibrary, RecentDeck } from "@/lib/deck-storage"
import type { Deck } from "@/types/slides"

/**
 * The editor holds one deck at a time, so opening another one closes the one on screen.
 * This is the door: a blank deck, then the decks that went out the same way, newest first.
 *
 * It only exists where there is a library to list — signed in, a deck has its own URL and
 * the dashboard is this list.
 */
export function OpenMenu({ library }: { library: DeckLibrary }) {
  const { t, locale } = useI18n()
  const [recent, setRecent] = useState<RecentDeck[] | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    setRecent(null)
    library.list().then(setRecent, () => setRecent([]))
  }

  /**
   * Files the deck on screen before replacing it. Ordering matters: the deck being opened
   * leaves the library first, so the one being closed lands at the top of the list where
   * it was just used from.
   */
  const open = async (next: () => Promise<Deck | null>) => {
    if (busy) return
    setBusy(true)
    try {
      const deck = await next()
      if (!deck) return
      const current = useEditor.getState().exportDeck()
      // a deck that cannot be filed is still not a reason to refuse to open another one
      await library.archive(current).catch(() => {})
      useEditor.getState().loadDeck(normalizeDeck(deck, t))
    } finally {
      setBusy(false)
    }
  }

  const forget = async (event: React.MouseEvent, id: string) => {
    // the row is a menu item; without this the click would also open the deck
    event.preventDefault()
    event.stopPropagation()
    await library.forget(id).catch(() => {})
    refresh()
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("editor.open")}
          className="order-1 size-7 shrink-0"
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem disabled={busy} onClick={() => void open(async () => createBlankDeck(t))}>
          <FilePlus2 className="size-4" /> {t("editor.blankDeck")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("editor.recentDecks")}</DropdownMenuLabel>
        {recent?.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {t("editor.noRecentDecks")}
          </div>
        )}
        {recent?.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            disabled={busy}
            onClick={() => void open(() => library.take(entry.id))}
            className="group/recent"
          >
            <Presentation className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{entry.title || t("deck.untitled")}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t("editor.slideCount", { n: entry.slides })} ·{" "}
                {formatTime(entry.openedAt, t, locale)}
              </span>
            </span>
            <button
              type="button"
              aria-label={t("editor.forgetDeck")}
              onClick={(event) => void forget(event, entry.id)}
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover/recent:opacity-60"
            >
              <X className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
