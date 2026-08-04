import { SHARE_TOKEN_PARAM } from "./constants"
import type { Translate } from "./i18n/translate"
import type { Deck } from "@/types/slides"
import type { DeckSummary } from "@/types/deck"
import { newId } from "./factory"
import {
  archiveDeck,
  forgetRecentDeck,
  listRecentDecks,
  loadDeck,
  saveDeck,
  takeRecentDeck,
  type RecentDeck,
} from "./storage"

export type { RecentDeck }

/**
 * Where the editor reads and writes its deck. The editor itself is storage-agnostic:
 * `/editor` hands it the IndexedDB adapter and runs signed-out, `/editor/[id]` hands it
 * the API adapter and runs against rustfs.
 *
 * Both adapters take a translator, because everything they can fail at ends up in the
 * editor's error bar in front of a reader whose language they cannot otherwise know.
 */
export type SaveResult =
  /** stored */
  | { ok: true }
  /** the document had moved on from the version this save started from; nothing was written */
  | { ok: false; reason: "conflict" }

export interface SaveOptions {
  /**
   * Store the document over whatever is there, whatever version that is. This is the
   * reader answering "keep mine" to a conflict, so it is deliberately a separate argument
   * rather than what happens when the version is left out.
   */
  force?: boolean
}

/**
 * The decks this storage remembers besides the one being edited, and the operations the
 * open menu drives them with.
 *
 * Only the browser-local editor has one. Signed in, a deck lives at its own URL and the
 * dashboard is the list of them — swapping the document under `/editor/[id]` would be
 * saving one deck over another's id, which is not a menu item, it is data loss.
 */
export interface DeckLibrary {
  list(): Promise<RecentDeck[]>
  /** files the deck being closed, so the reader can get back to it */
  archive(deck: Deck): Promise<void>
  /** reads one back out and drops it from the list, because it becomes the current deck */
  take(id: string): Promise<Deck | null>
  forget(id: string): Promise<void>
}

export interface DeckStorage {
  load(): Promise<Deck | null>
  save(deck: Deck, options?: SaveOptions): Promise<SaveResult>
  /**
   * Whether the stored document has moved on since this adapter last read or wrote it.
   *
   * Null rather than a function returning false: IndexedDB has exactly one writer, so
   * there is nothing to poll for, and the editor should not run a timer to keep asking.
   */
  changedRemotely: (() => Promise<boolean>) | null
  library: DeckLibrary | null
}

export function localDeckStorage(t: Translate): DeckStorage {
  return {
    load: () => loadDeck(t),
    save: async (deck) => {
      await saveDeck(deck, t)
      return { ok: true }
    },
    changedRemotely: null,
    library: {
      list: () => listRecentDecks(t),
      // the current deck has no identity of its own — it is whatever is in the one slot —
      // so each archived copy is given one on the way out
      archive: (deck) => archiveDeck(deck, newId(), t),
      take: (id) => takeRecentDeck(id, t),
      forget: (id) => forgetRecentDeck(id, t),
    },
  }
}

/** A thumbnail every half minute is enough for the dashboard and cheap to render. */
const THUMBNAIL_INTERVAL = 30_000

/**
 * `shareToken` is how an edit-mode share link identifies itself. It rides on every request
 * rather than in a cookie because a visitor may hold links to two decks at once, and
 * because the token is already in the address bar — putting it in the query changes what
 * is exposed not at all, and keeps one credential in one place.
 */
export function cloudDeckStorage(id: string, t: Translate, shareToken?: string): DeckStorage {
  const query = shareToken ? `?${SHARE_TOKEN_PARAM}=${encodeURIComponent(shareToken)}` : ""
  let lastThumbnail = 0
  /**
   * The version this adapter last read or wrote. Every version number the editor deals in
   * lives here rather than in the editor, so the shell can stay unaware that one storage
   * has other writers and the other does not.
   */
  let version: number | null = null

  async function currentVersion(): Promise<number> {
    const response = await fetch(`/api/decks/${id}/version${query}`, { cache: "no-store" })
    if (!response.ok) throw new Error(await errorMessage(response, t))
    const body = (await response.json()) as { version: number }
    return body.version
  }

  return {
    async load() {
      const response = await fetch(`/api/decks/${id}${query}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await errorMessage(response, t))
      const { deck, summary } = (await response.json()) as {
        deck: Deck
        summary: DeckSummary
      }
      version = summary.version
      return deck
    },

    async save(deck, options) {
      // "keep mine" means starting from whatever is stored now, which is the same write
      // with a freshly read version rather than a second, unguarded route
      const base = options?.force ? await currentVersion() : (version ?? (await currentVersion()))

      const response = await fetch(`/api/decks/${id}${query}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck, baseVersion: base }),
      })

      if (response.status === 409) {
        // `version` is left alone on purpose: it is what "has this moved" is measured
        // against, and moving it here would make the next poll report all clear
        return { ok: false, reason: "conflict" }
      }
      if (!response.ok) throw new Error(await errorMessage(response, t))

      const body = (await response.json()) as { deck: DeckSummary }
      version = body.deck.version

      // the deck is safe at this point; a failed thumbnail is a stale dashboard tile,
      // never a lost edit, so it neither blocks nor fails the save
      if (Date.now() - lastThumbnail > THUMBNAIL_INTERVAL) {
        lastThumbnail = Date.now()
        void uploadThumbnail(id, deck, query).catch(() => {})
      }
      return { ok: true }
    },

    async changedRemotely() {
      if (version === null) return false
      return (await currentVersion()) > version
    },

    // a signed-in deck's "recent" list is the dashboard, at each deck's own URL
    library: null,
  }
}

async function uploadThumbnail(id: string, deck: Deck, query: string): Promise<void> {
  const first = deck.slides[0]
  if (!first) return

  const { slideToBlob } = await import("./export-media")
  const png = await slideToBlob(first, 0.4)
  if (!png) return

  await fetch(`/api/decks/${id}/thumbnail${query}`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  })
}

/**
 * The server sends its errors already translated — it knows the request's locale — so a
 * message in the body is used as-is; only the cases where there is no body to read fall
 * back to a locally worded one.
 */
async function errorMessage(response: Response, t: Translate): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (body?.error) return body.error
  return response.status === 401
    ? t("api.sessionExpired")
    : t("api.requestFailed", { status: response.status })
}
