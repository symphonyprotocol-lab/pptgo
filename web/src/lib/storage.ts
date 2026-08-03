import type { Translate } from "./i18n/translate"
import type { Deck } from "@/types/slides"

const DB_NAME = "pptgo"
const STORE = "decks"
const KEY = "current"
const LEGACY_KEY = "pptgo:deck"

/**
 * Decks embed their images as data URIs, so a handful of photos blows past localStorage's
 * ~5MB quota. IndexedDB has no such ceiling and stores structured values directly.
 */
function openDb(t: Translate): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(t("error.storageOpen")))
  })
}

export async function saveDeck(deck: Deck, t: Translate): Promise<void> {
  const db = await openDb(t)
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(deck, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error(t("error.storageSave")))
      tx.onabort = () => reject(tx.error ?? new Error(t("error.storageAbort")))
    })
  } finally {
    db.close()
  }
}

export async function loadDeck(t: Translate): Promise<Deck | null> {
  const migrated = migrateLegacyDeck()
  if (migrated) {
    // best effort: if the move fails the deck is still returned for this session
    void saveDeck(migrated, t).catch(() => {})
    return migrated
  }

  const db = await openDb(t)
  try {
    return await new Promise<Deck | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const request = tx.objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve((request.result as Deck) ?? null)
      request.onerror = () => reject(request.error ?? new Error(t("error.storageRead")))
    })
  } finally {
    db.close()
  }
}

/** Decks written by the localStorage-backed version are picked up once, then cleared. */
function migrateLegacyDeck(): Deck | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    window.localStorage.removeItem(LEGACY_KEY)
    const deck = JSON.parse(raw) as Deck
    return Array.isArray(deck.slides) && deck.slides.length ? deck : null
  } catch {
    window.localStorage.removeItem(LEGACY_KEY)
    return null
  }
}
