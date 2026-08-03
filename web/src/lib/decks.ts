import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { decks, type DeckRow } from "@/db/schema"
import { deleteObjects, getObject, putObject } from "@/lib/s3"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { createSlide } from "@/lib/factory"
import type { Deck } from "@/types/slides"
import type { DeckSummary } from "@/types/deck"

/** Guards against a runaway client pushing an unbounded document into the bucket. */
export const MAX_DECK_BYTES = 25 * 1024 * 1024

export type { DeckSummary }

function summarize(row: DeckRow): DeckSummary {
  return {
    id: row.id,
    title: row.title,
    slideCount: row.slideCount,
    byteSize: row.byteSize,
    hasThumbnail: Boolean(row.thumbnailKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const documentKey = (id: string) => `decks/${id}/deck.json`
const thumbnailKey = (id: string) => `decks/${id}/thumbnail.png`

/**
 * Every read and write is scoped by owner in the same statement, so another user's id
 * is indistinguishable from one that does not exist — there is no path that loads a row
 * first and checks ownership after.
 */
function owned(id: string, ownerId: string) {
  return and(eq(decks.id, id), eq(decks.ownerId, ownerId))
}

export async function listDecks(ownerId: string): Promise<DeckSummary[]> {
  const rows = await db
    .select()
    .from(decks)
    .where(eq(decks.ownerId, ownerId))
    .orderBy(desc(decks.updatedAt))
  return rows.map(summarize)
}

export async function createDeck(
  ownerId: string,
  deck: Deck,
): Promise<DeckSummary> {
  const id = crypto.randomUUID()
  const body = serialize(deck)

  // the document lands in the bucket first: an orphaned object is invisible, whereas a
  // row pointing at a missing object would be a deck that opens to an error
  await putObject(documentKey(id), body, "application/json")

  const [row] = await db
    .insert(decks)
    .values({
      id,
      ownerId,
      title: deck.title,
      slideCount: deck.slides.length,
      byteSize: body.byteLength,
      objectKey: documentKey(id),
    })
    .returning()

  return summarize(row)
}

export async function readDeck(
  id: string,
  ownerId: string,
): Promise<{ summary: DeckSummary; deck: Deck } | null> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row) return null

  const bytes = await getObject(row.objectKey)
  if (!bytes) return null

  return {
    summary: summarize(row),
    deck: JSON.parse(new TextDecoder().decode(bytes)) as Deck,
  }
}

export async function writeDeck(
  id: string,
  ownerId: string,
  deck: Deck,
): Promise<DeckSummary | null> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row) return null

  const body = serialize(deck)
  await putObject(row.objectKey, body, "application/json")

  const [updated] = await db
    .update(decks)
    .set({
      title: deck.title,
      slideCount: deck.slides.length,
      byteSize: body.byteLength,
      updatedAt: new Date(),
    })
    .where(owned(id, ownerId))
    .returning()

  return summarize(updated)
}

export async function renameDeck(
  id: string,
  ownerId: string,
  title: string,
): Promise<DeckSummary | null> {
  const [row] = await db
    .update(decks)
    .set({ title, updatedAt: new Date() })
    .where(owned(id, ownerId))
    .returning()
  if (!row) return null

  // the title also lives inside the stored document, or reopening would undo the rename
  const bytes = await getObject(row.objectKey)
  if (bytes) {
    const deck = JSON.parse(new TextDecoder().decode(bytes)) as Deck
    deck.title = title
    await putObject(row.objectKey, serialize(deck), "application/json")
  }

  return summarize(row)
}

export async function deleteDeck(id: string, ownerId: string): Promise<boolean> {
  const [row] = await db.delete(decks).where(owned(id, ownerId)).returning()
  if (!row) return false
  await deleteObjects(
    [row.objectKey, row.thumbnailKey].filter((key): key is string => Boolean(key)),
  )
  return true
}

export async function duplicateDeck(
  id: string,
  ownerId: string,
): Promise<DeckSummary | null> {
  const source = await readDeck(id, ownerId)
  if (!source) return null
  return createDeck(ownerId, { ...source.deck, title: `${source.deck.title} 副本` })
}

export async function readThumbnail(
  id: string,
  ownerId: string,
): Promise<Uint8Array | null> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row?.thumbnailKey) return null
  return getObject(row.thumbnailKey)
}

export async function writeThumbnail(
  id: string,
  ownerId: string,
  png: Uint8Array,
): Promise<boolean> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row) return false

  const key = thumbnailKey(id)
  await putObject(key, png, "image/png")
  if (!row.thumbnailKey) {
    // the key is derived from the id, so it only has to be recorded once
    await db.update(decks).set({ thumbnailKey: key }).where(owned(id, ownerId))
  }
  return true
}

export async function countDecks(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(decks)
    .where(eq(decks.ownerId, ownerId))
  return row?.value ?? 0
}

function serialize(deck: Deck): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(deck))
}

/**
 * A one-slide starter deck. The richer sample deck `createDeck()` builds is
 * browser-only — its text runs go through `sanitizeHtml`, which needs a DOM — so the
 * dashboard sends that one from the client and this is the fallback for a bare
 * `POST /api/decks`.
 */
export function blankDeck(title: string): Deck {
  return {
    version: 1,
    title,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    theme: DEFAULT_THEME,
    slides: [createSlide()],
  }
}

/**
 * Structural check on a document that arrived over the wire. It deliberately stops at
 * the slide list: the editor re-normalises and re-sanitises everything it loads, so the
 * server's job is to reject nonsense, not to validate every element.
 */
export function parseDeck(value: unknown): Deck | null {
  if (typeof value !== "object" || value === null) return null
  const deck = value as Partial<Deck>
  if (typeof deck.title !== "string" || !deck.title.trim()) return null
  if (!Array.isArray(deck.slides) || deck.slides.length === 0) return null
  if (typeof deck.width !== "number" || typeof deck.height !== "number") return null
  if (typeof deck.theme !== "object" || deck.theme === null) return null
  return { ...(deck as Deck), version: 1, title: deck.title.slice(0, 200) }
}
