import { describe, expect, it } from "vitest"
import {
  GRANT_TTL_DAYS,
  grantCookie,
  grantIsGood,
  hashPassword,
  passwordMatches,
  sharePath,
  signGrant,
} from "./shares"
import type { DeckShareRow } from "@/db/schema"

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function shareRow(over: Partial<DeckShareRow> = {}): DeckShareRow {
  return {
    id: "share-1",
    deckId: "deck-1",
    ownerId: "owner-1",
    token: "Ab3xY9",
    mode: "read",
    passwordHash: "hash-of-hunter2",
    passwordSalt: "salt",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...over,
  }
}

describe("share paths", () => {
  it("puts the token where the visitor page reads it", () => {
    expect(sharePath("Ab3xY9")).toBe("/s/Ab3xY9")
  })

  /** Two shared decks open in two tabs are two permissions, not one that overwrites. */
  it("names one cookie per share", () => {
    expect(grantCookie("share-1")).not.toBe(grantCookie("share-2"))
  })
})

describe("password grants", () => {
  it("lets a visitor who got the password right back in without asking again", async () => {
    const row = shareRow()
    expect(await grantIsGood(row, await signGrant(row, NOW), NOW)).toBe(true)
  })

  it("refuses a missing, malformed or forged grant", async () => {
    const row = shareRow()
    const good = await signGrant(row, NOW)

    expect(await grantIsGood(row, undefined, NOW)).toBe(false)
    expect(await grantIsGood(row, "", NOW)).toBe(false)
    expect(await grantIsGood(row, "nonsense", NOW)).toBe(false)
    expect(await grantIsGood(row, `${good.split(".")[0]}.forged`, NOW)).toBe(false)
  })

  /**
   * The reason the hash is inside the signature: "change the password" has to mean
   * something to the people already holding a cookie from the old one.
   */
  it("stops working when the password changes or is removed", async () => {
    const row = shareRow()
    const grant = await signGrant(row, NOW)

    expect(await grantIsGood(shareRow({ passwordHash: "hash-of-something-else" }), grant, NOW))
      .toBe(false)
    expect(await grantIsGood(shareRow({ passwordHash: null }), grant, NOW)).toBe(false)
  })

  it("is not a key to a different share", async () => {
    const grant = await signGrant(shareRow(), NOW)
    expect(await grantIsGood(shareRow({ id: "share-2" }), grant, NOW)).toBe(false)
    expect(await grantIsGood(shareRow({ deckId: "deck-2" }), grant, NOW)).toBe(false)
  })

  it("asks again after a week", async () => {
    const row = shareRow()
    const grant = await signGrant(row, NOW)
    const lapses = (Math.floor(NOW / DAY) + GRANT_TTL_DAYS) * DAY

    expect(await grantIsGood(row, grant, lapses - DAY)).toBe(true)
    expect(await grantIsGood(row, grant, lapses)).toBe(false)
  })
})

describe("share passwords", () => {
  it("recognises the right passphrase and nothing else", async () => {
    const salt = "a-salt"
    const row = shareRow({ passwordHash: await hashPassword("open sesame", salt), passwordSalt: salt })

    expect(await passwordMatches(row, "open sesame")).toBe(true)
    expect(await passwordMatches(row, "open sesam")).toBe(false)
    expect(await passwordMatches(row, "Open Sesame")).toBe(false)
    expect(await passwordMatches(row, "")).toBe(false)
  })

  /** Per-share salt: two decks behind the same passphrase must not share a hash. */
  it("hashes the same passphrase differently under different salts", async () => {
    expect(await hashPassword("hunter2", "salt-a")).not.toBe(await hashPassword("hunter2", "salt-b"))
  })

  it("treats a share with no password as one no password opens", async () => {
    const open = shareRow({ passwordHash: null, passwordSalt: null })
    expect(await passwordMatches(open, "")).toBe(false)
    expect(await passwordMatches(open, "anything")).toBe(false)
  })
})
