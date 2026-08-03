import { describe, expect, it } from "vitest"
import { SHARE_KEY_PARAM } from "./constants"
import {
  SHARE_LINK_TTL_DAYS,
  ownerFromPreviewKey,
  ownerFromPreviewRequest,
  previewLink,
  signPreviewKey,
} from "./share-link"

const DECK = "deck-abc"
const OWNER = "8f14e45f-ceea-467a-9c2b-7c1a2e3d4f56"
const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

describe("preview keys", () => {
  it("lets the bearer read the deck it was signed for", async () => {
    const key = await signPreviewKey(DECK, OWNER, NOW)
    expect(await ownerFromPreviewKey(DECK, key, NOW)).toBe(OWNER)
  })

  /** The whole point of binding the deck id: a link that is handed around stays one link. */
  it("is not a key to any other deck", async () => {
    const key = await signPreviewKey(DECK, OWNER, NOW)
    expect(await ownerFromPreviewKey("someone-elses-deck", key, NOW)).toBeNull()
  })

  it("refuses a key whose owner or expiry has been edited", async () => {
    const key = await signPreviewKey(DECK, OWNER, NOW)
    const [version, owner, expiresOn, signature] = key.split(".")

    const otherOwner = [version, "00000000-0000-0000-0000-000000000000", expiresOn, signature]
    expect(await ownerFromPreviewKey(DECK, otherOwner.join("."), NOW)).toBeNull()

    // the obvious attack on a self-describing expiry: push the date out by hand
    const later = (Number.parseInt(expiresOn, 36) + 3650).toString(36)
    expect(await ownerFromPreviewKey(DECK, [version, owner, later, signature].join("."), NOW))
      .toBeNull()
  })

  it("refuses a forged signature and a truncated key", async () => {
    const key = await signPreviewKey(DECK, OWNER, NOW)
    const parts = key.split(".")
    expect(
      await ownerFromPreviewKey(DECK, [...parts.slice(0, 3), "not-a-signature"].join("."), NOW),
    ).toBeNull()
    expect(await ownerFromPreviewKey(DECK, parts.slice(0, 3).join("."), NOW)).toBeNull()
    expect(await ownerFromPreviewKey(DECK, "", NOW)).toBeNull()
  })

  it("stops working once it is a week old", async () => {
    const key = await signPreviewKey(DECK, OWNER, NOW)

    // still good the day before it lapses, gone the day after
    const lapses = (Math.floor(NOW / DAY) + SHARE_LINK_TTL_DAYS) * DAY
    expect(await ownerFromPreviewKey(DECK, key, lapses - DAY)).toBe(OWNER)
    expect(await ownerFromPreviewKey(DECK, key, lapses)).toBeNull()
    expect(await ownerFromPreviewKey(DECK, key, lapses + DAY)).toBeNull()
  })

  /**
   * Every mutating tool returns `previewUrl`. Writing twenty slides should hand back one
   * link twenty times, not twenty links, so the expiry is quantised to whole days.
   */
  it("signs the same key all day", async () => {
    const morning = await signPreviewKey(DECK, OWNER, NOW)
    expect(await signPreviewKey(DECK, OWNER, NOW + 8 * 60 * 60 * 1000)).toBe(morning)
    expect(await signPreviewKey(DECK, OWNER, NOW + 2 * DAY)).not.toBe(morning)
  })
})

describe("preview links", () => {
  it("builds a URL the preview page can read the key out of", async () => {
    const url = new URL(await previewLink("https://pptgo.test", DECK, OWNER))
    expect(url.pathname).toBe(`/preview/${DECK}`)

    const key = url.searchParams.get(SHARE_KEY_PARAM)
    expect(key).not.toBeNull()
    expect(await ownerFromPreviewKey(DECK, key as string)).toBe(OWNER)
  })

  it("reads the key off a request, and shrugs at one without", async () => {
    const link = await previewLink("https://pptgo.test", DECK, OWNER)
    const key = new URL(link).searchParams.get(SHARE_KEY_PARAM)

    const carrying = new Request(`https://pptgo.test/api/decks/${DECK}?${SHARE_KEY_PARAM}=${key}`)
    expect(await ownerFromPreviewRequest(carrying, DECK)).toBe(OWNER)

    const bare = new Request(`https://pptgo.test/api/decks/${DECK}`)
    expect(await ownerFromPreviewRequest(bare, DECK)).toBeNull()
  })
})
