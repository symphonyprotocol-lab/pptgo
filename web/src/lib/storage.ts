import type { Translate } from "./i18n/translate"
import type { Deck } from "@/types/slides"

const DB_NAME = "pptgo"
const DB_VERSION = 2
const STORE = "decks"
const KEY = "current"
const LEGACY_KEY = "pptgo:deck"

/**
 * The decks the browser-local editor has had open before this one. There is only ever one
 * *current* deck — opening a second replaces it — so without somewhere to put the outgoing
 * one, importing a .pptx silently threw away whatever was being edited.
 *
 * Two stores, not one: the menu that lists them needs a title and a timestamp, and reading
 * that out of the payloads would mean pulling every archived deck — tens of megabytes of
 * inlined images — into memory to draw a few lines of text.
 */
const LIBRARY = "library"
const LIBRARY_INDEX = "libraryIndex"

/** How many decks the local library keeps. Past this the least recent is dropped. */
const MAX_RECENT = 10

export interface RecentDeck {
  id: string
  title: string
  slides: number
  /** ISO 8601, so it sorts as a string and formats with the same helper as everything else */
  openedAt: string
}

/**
 * Decks embed their images as data URIs, so a handful of photos blows past localStorage's
 * ~5MB quota. IndexedDB has no such ceiling and stores structured values directly.
 */
function openDb(t: Translate): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of [STORE, LIBRARY, LIBRARY_INDEX]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(t("error.storageOpen")))
    // another tab still holds the old schema open. Connections here are opened and closed
    // around a single operation, so this clears on its own in a moment — but without a
    // rejection the caller waits on a promise that may never settle, and the editor sits
    // there with no deck and no error.
    request.onblocked = () => reject(new Error(t("error.storageOpen")))
  })
}

/**
 * Runs `body` inside one transaction and settles when the transaction itself does — so a
 * write that the browser later refuses (quota, a closing tab) is reported rather than
 * counted as saved.
 *
 * `body` may await IndexedDB requests it issued on `tx`: the continuation runs in the same
 * task as the request's callback, which is what keeps the transaction alive. It must not
 * await anything else, or the transaction commits underneath it.
 */
function run<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  t: Translate,
  body: (tx: IDBTransaction) => T | PromiseLike<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const failed = t(mode === "readonly" ? "error.storageRead" : "error.storageSave")
    const tx = db.transaction(stores, mode)
    let result: T
    Promise.resolve(body(tx)).then((value) => {
      result = value
    }, reject)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error ?? new Error(failed))
    tx.onabort = () => reject(tx.error ?? new Error(t("error.storageAbort")))
  })
}

const asPromise = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export async function saveDeck(deck: Deck, t: Translate): Promise<void> {
  const db = await openDb(t)
  try {
    await run(db, [STORE], "readwrite", t, (tx) => {
      tx.objectStore(STORE).put(deck, KEY)
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
    return await run(db, [STORE], "readonly", t, (tx) =>
      asPromise(tx.objectStore(STORE).get(KEY) as IDBRequest<Deck | undefined>).then(
        (deck) => deck ?? null,
      ),
    )
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------- the local library

/** Newest first, which is the order the open menu lists them in. */
export async function listRecentDecks(t: Translate): Promise<RecentDeck[]> {
  const db = await openDb(t)
  try {
    const entries = await run(db, [LIBRARY_INDEX], "readonly", t, (tx) =>
      asPromise(tx.objectStore(LIBRARY_INDEX).getAll() as IDBRequest<RecentDeck[]>),
    )
    return entries.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  } finally {
    db.close()
  }
}

/**
 * Files the deck being closed, so opening another one is something a reader can walk back
 * from. An empty deck is not filed: closing the untouched starter deck should not push a
 * real one out of a list this short.
 */
export async function archiveDeck(deck: Deck, id: string, t: Translate): Promise<void> {
  if (!deck.slides.some((slide) => slide.elements.length)) return

  const db = await openDb(t)
  try {
    await run(db, [LIBRARY, LIBRARY_INDEX], "readwrite", t, async (tx) => {
      const index = tx.objectStore(LIBRARY_INDEX)
      index.put(
        {
          id,
          title: deck.title,
          slides: deck.slides.length,
          openedAt: new Date().toISOString(),
        } satisfies RecentDeck,
        id,
      )
      tx.objectStore(LIBRARY).put(deck, id)

      // trimmed inside the same transaction, so the list can never be seen over its cap
      const all = await asPromise(index.getAll() as IDBRequest<RecentDeck[]>)
      const stale = all.sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(MAX_RECENT)
      for (const entry of stale) {
        index.delete(entry.id)
        tx.objectStore(LIBRARY).delete(entry.id)
      }
    })
  } finally {
    db.close()
  }
}

/**
 * Reads an archived deck back out and drops it from the library, because reopening it
 * makes it the current deck — leaving the copy behind would put the same deck in the list
 * twice as soon as it was closed again.
 */
export async function takeRecentDeck(id: string, t: Translate): Promise<Deck | null> {
  const db = await openDb(t)
  try {
    return await run(db, [LIBRARY, LIBRARY_INDEX], "readwrite", t, (tx) => {
      const store = tx.objectStore(LIBRARY)
      return asPromise(store.get(id) as IDBRequest<Deck | undefined>).then((deck) => {
        if (!deck) return null
        store.delete(id)
        tx.objectStore(LIBRARY_INDEX).delete(id)
        return deck
      })
    })
  } finally {
    db.close()
  }
}

export async function forgetRecentDeck(id: string, t: Translate): Promise<void> {
  const db = await openDb(t)
  try {
    await run(db, [LIBRARY, LIBRARY_INDEX], "readwrite", t, (tx) => {
      tx.objectStore(LIBRARY).delete(id)
      tx.objectStore(LIBRARY_INDEX).delete(id)
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
