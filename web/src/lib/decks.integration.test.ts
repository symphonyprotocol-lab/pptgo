import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"
import {
  blankDeck,
  createDeck,
  deleteDeck,
  readDeck,
  readDeckVersion,
  renameDeck,
  writeDeck,
} from "./decks"

/**
 * The one thing about the version that cannot be tested without real storage: that a
 * refused write leaves the bucket alone.
 *
 * Everything else here is bookkeeping that a unit test could assert against a fake, but
 * the ordering this proves is the whole reason the version exists, and it is the kind of
 * thing that reads as correct in either order until a real object store is watching. It
 * skips silently without a database, so `npm test` on a fresh clone is unaffected; run it
 * with the compose stack up:
 *
 *   DATABASE_URL=postgres://pptgo:pptgo@localhost:5433/pptgo \
 *   S3_ENDPOINT=http://localhost:9100 S3_BUCKET=pptgo S3_REGION=us-east-1 \
 *   S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… npx vitest run decks.integration
 */
const live = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT)

describe.skipIf(!live)("versioned writes against a real database and bucket", () => {
  const ownerId = `test-owner-${crypto.randomUUID()}`
  let deckId: string

  beforeAll(async () => {
    await db.insert(users).values({ id: ownerId, name: "version test", email: `${ownerId}@test` })
    const created = await createDeck(ownerId, blankDeck("v1"))
    deckId = created.id
    expect(created.version).toBe(1)
  })

  afterAll(async () => {
    if (deckId) await deleteDeck(deckId, ownerId).catch(() => false)
    await db.delete(users).where(eq(users.id, ownerId))
  })

  it("advances the version on a write that presents the current one", async () => {
    const result = await writeDeck(deckId, ownerId, blankDeck("winner"), 1)
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.summary.version).toBe(2)
  })

  it("refuses a second writer that started from the same version", async () => {
    const result = await writeDeck(deckId, ownerId, blankDeck("loser"), 1)
    expect(result).toEqual({ ok: false, reason: "conflict", version: 2 })
  })

  /**
   * The assertion the ordering exists for. Writing the document before claiming the
   * version would leave "loser" in the bucket under the version number the winner was
   * given — a refusal that corrupts the thing it refused to change.
   */
  it("leaves the stored document untouched by the writer it refused", async () => {
    const found = await readDeck(deckId, ownerId)
    expect(found?.deck.title).toBe("winner")
    expect(found?.summary.version).toBe(2)
  })

  it("reports the version without opening the document", async () => {
    await expect(readDeckVersion(deckId, ownerId)).resolves.toMatchObject({ version: 2 })
  })

  it("counts a rename as a write, because it changes the document too", async () => {
    const renamed = await renameDeck(deckId, ownerId, "renamed")
    expect(renamed).toMatchObject({ ok: true })
    if (renamed.ok) expect(renamed.summary.version).toBe(3)

    const found = await readDeck(deckId, ownerId)
    expect(found?.deck.title).toBe("renamed")
  })

  it("refuses a writer holding a version the rename has moved past", async () => {
    const result = await writeDeck(deckId, ownerId, blankDeck("stale"), 2)
    expect(result).toEqual({ ok: false, reason: "conflict", version: 3 })
  })

  it("reports a missing deck as missing rather than as a conflict", async () => {
    const result = await writeDeck(crypto.randomUUID(), ownerId, blankDeck("x"), 1)
    expect(result).toEqual({ ok: false, reason: "not-found" })
  })

  it("hides another owner's deck behind the same answer as one that does not exist", async () => {
    const result = await writeDeck(deckId, "someone-else", blankDeck("x"), 1)
    expect(result).toEqual({ ok: false, reason: "not-found" })
  })
})
