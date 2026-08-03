import type { Deck } from "@/types/slides"
import { loadDeck, saveDeck } from "./storage"

/**
 * Where the editor reads and writes its deck. The editor itself is storage-agnostic:
 * `/editor` hands it the IndexedDB adapter and runs signed-out, `/editor/[id]` hands it
 * the API adapter and runs against rustfs.
 */
export interface DeckStorage {
  load(): Promise<Deck | null>
  save(deck: Deck): Promise<void>
}

export const localDeckStorage: DeckStorage = {
  load: loadDeck,
  save: saveDeck,
}

/** A thumbnail every half minute is enough for the dashboard and cheap to render. */
const THUMBNAIL_INTERVAL = 30_000

export function cloudDeckStorage(id: string): DeckStorage {
  let lastThumbnail = 0

  return {
    async load() {
      const response = await fetch(`/api/decks/${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await errorMessage(response))
      const { deck } = (await response.json()) as { deck: Deck }
      return deck
    },

    async save(deck) {
      const response = await fetch(`/api/decks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))

      // the deck is safe at this point; a failed thumbnail is a stale dashboard tile,
      // never a lost edit, so it neither blocks nor fails the save
      if (Date.now() - lastThumbnail > THUMBNAIL_INTERVAL) {
        lastThumbnail = Date.now()
        void uploadThumbnail(id, deck).catch(() => {})
      }
    },
  }
}

async function uploadThumbnail(id: string, deck: Deck): Promise<void> {
  const first = deck.slides[0]
  if (!first) return

  const { slideToBlob } = await import("./export-media")
  const png = await slideToBlob(first, 0.4)
  if (!png) return

  await fetch(`/api/decks/${id}/thumbnail`, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  })
}

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (body?.error) return body.error
  return response.status === 401 ? "登录已过期，请重新登录" : `请求失败（${response.status}）`
}
