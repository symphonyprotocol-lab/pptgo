import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { decks, type DeckRow } from "@/db/schema"
import { deleteObjects, getObject, putObject } from "@/lib/s3"
import {
  MAX_DECKS_PER_OWNER,
  MAX_DECK_BYTES,
  MAX_REQUEST_BYTES,
  blankDeck,
  encodeDeck,
  parseDeck,
  serializeDeck,
} from "@/lib/deck-schema"
import type { Deck } from "@/types/slides"
import type { DeckSummary } from "@/types/deck"

// the schema half is re-exported so callers reach one module for "a deck, stored"
export { MAX_DECK_BYTES, MAX_REQUEST_BYTES, MAX_DECKS_PER_OWNER, blankDeck, encodeDeck, parseDeck }
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
  /** the encoded document, when the caller already produced one to check its size */
  encoded?: Uint8Array,
): Promise<DeckSummary> {
  const id = crypto.randomUUID()
  const body = encoded ?? serializeDeck(deck)

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
  /** the encoded document, when the caller already produced one to check its size */
  encoded?: Uint8Array,
): Promise<DeckSummary | null> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row) return null

  const body = encoded ?? serializeDeck(deck)
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
    await putObject(row.objectKey, serializeDeck(deck), "application/json")
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
  /** suffix for the copy's title, in the caller's language */
  copySuffix: string,
): Promise<DeckSummary | null> {
  const source = await readDeck(id, ownerId)
  if (!source) return null
  const copy = { ...source.deck, title: `${source.deck.title} ${copySuffix}`.slice(0, 200) }
  const body = encodeDeck(copy)
  // the source was within the limit and the title only grew, so this is a formality —
  // but `createDeck` is the one place that writes to the bucket and it should never be
  // handed something the limit would have rejected
  if (!body) return null
  return createDeck(ownerId, copy, body)
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
