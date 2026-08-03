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
    version: row.version,
    hasThumbnail: Boolean(row.thumbnailKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * What a versioned write can come back as. `conflict` carries the version that is current
 * so the caller can say how far behind it was, but deliberately not the document — the
 * common answer to a conflict is "keep what I have", and fetching megabytes of slides out
 * of the bucket to satisfy the other answer is the caller's decision to make, not this
 * function's.
 */
export type WriteResult =
  | { ok: true; summary: DeckSummary }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "conflict"; version: number }

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

/** The stored version, without touching the bucket. This is what polling reads. */
export async function readDeckVersion(
  id: string,
  ownerId: string,
): Promise<{ version: number; updatedAt: string } | null> {
  const [row] = await db
    .select({ version: decks.version, updatedAt: decks.updatedAt })
    .from(decks)
    .where(owned(id, ownerId))
    .limit(1)
  if (!row) return null
  return { version: row.version, updatedAt: row.updatedAt.toISOString() }
}

/**
 * Advance the version, but only from `from` — the guard is part of the UPDATE rather than
 * a SELECT before it, because two writers that both read version 3 would both pass a
 * check written separately and both go on to write.
 */
async function claimVersion(
  id: string,
  ownerId: string,
  from: number,
  set: { title: string; slideCount: number; byteSize: number },
): Promise<DeckRow | null> {
  const [row] = await db
    .update(decks)
    .set({ ...set, version: from + 1, updatedAt: new Date() })
    .where(and(owned(id, ownerId), eq(decks.version, from)))
    .returning()
  return row ?? null
}

/** Undo a claim whose document never made it into the bucket. */
async function releaseVersion(id: string, ownerId: string, claimed: number): Promise<void> {
  // conditional again: if someone has written since, the version is theirs to keep and
  // the only cost of leaving it alone is that readers reload a document that did not change
  await db
    .update(decks)
    .set({ version: claimed - 1 })
    .where(and(owned(id, ownerId), eq(decks.version, claimed)))
}

export async function writeDeck(
  id: string,
  ownerId: string,
  deck: Deck,
  /** the version this document was edited from; the write is refused if it has moved */
  baseVersion: number,
  /** the encoded document, when the caller already produced one to check its size */
  encoded?: Uint8Array,
): Promise<WriteResult> {
  const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
  if (!row) return { ok: false, reason: "not-found" }
  if (row.version !== baseVersion) return { ok: false, reason: "conflict", version: row.version }

  const body = encoded ?? serializeDeck(deck)

  /**
   * The version is claimed *before* the bucket is written, which is the opposite of what
   * `createDeck` does and for the opposite reason. Writing the document first would let a
   * writer who is about to be refused overwrite the winner's slides on its way to being
   * told no: the bucket would hold the loser's document under the winner's version number,
   * which is the exact corruption the version is here to prevent. Claiming first means a
   * refused writer never touches the bucket at all.
   *
   * The cost is the other order's failure: if the claim lands and the upload does not, the
   * version has moved while the document has not, so readers reload identical slides. That
   * is a wasted fetch rather than a lost edit, and the release below usually removes even
   * that.
   */
  const claimed = await claimVersion(id, ownerId, baseVersion, {
    title: deck.title,
    slideCount: deck.slides.length,
    byteSize: body.byteLength,
  })
  if (!claimed) {
    const current = await readDeckVersion(id, ownerId)
    if (!current) return { ok: false, reason: "not-found" }
    return { ok: false, reason: "conflict", version: current.version }
  }

  try {
    await putObject(row.objectKey, body, "application/json")
  } catch (error) {
    await releaseVersion(id, ownerId, claimed.version).catch(() => {})
    throw error
  }

  return { ok: true, summary: summarize(claimed) }
}

/**
 * Renaming touches the document too — the title lives inside it, or reopening the deck
 * would undo the rename — so it takes the same version claim a full write does. The
 * dashboard renames without holding a version, so this reads one and retries once when it
 * loses; a rename racing an autosave is rare, and losing twice in a row means something is
 * writing continuously and the caller should hear about it.
 */
export async function renameDeck(
  id: string,
  ownerId: string,
  title: string,
): Promise<WriteResult> {
  let seen = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await db.select().from(decks).where(owned(id, ownerId)).limit(1)
    if (!row) return { ok: false, reason: "not-found" }
    seen = row.version

    const bytes = await getObject(row.objectKey)
    let body: Uint8Array | null = null
    if (bytes) {
      const deck = JSON.parse(new TextDecoder().decode(bytes)) as Deck
      deck.title = title
      body = serializeDeck(deck)
    }

    const claimed = await claimVersion(id, ownerId, row.version, {
      title,
      slideCount: row.slideCount,
      byteSize: body?.byteLength ?? row.byteSize,
    })
    if (!claimed) continue

    if (body) {
      try {
        await putObject(row.objectKey, body, "application/json")
      } catch (error) {
        await releaseVersion(id, ownerId, claimed.version).catch(() => {})
        throw error
      }
    }

    return { ok: true, summary: summarize(claimed) }
  }

  return { ok: false, reason: "conflict", version: seen }
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
