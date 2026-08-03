import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { apiTokens, users } from "@/db/schema"
import { createToken, deleteToken, listTokens, userFromBearer } from "./api-token"

/**
 * Tokens against a real database. Skips without `DATABASE_URL`, like the deck one; run it
 * with the compose stack up:
 *
 *   DATABASE_URL=postgres://pptgo:pptgo@localhost:5433/pptgo npx vitest run api-token.integration
 */
const live = Boolean(process.env.DATABASE_URL)

const bearing = (token: string) =>
  new Request("https://pptgo.test/api/mcp", { headers: { authorization: `Bearer ${token}` } })

describe.skipIf(!live)("api tokens against a real database", () => {
  const ownerId = `test-owner-${crypto.randomUUID()}`
  const otherId = `test-other-${crypto.randomUUID()}`

  beforeAll(async () => {
    await db.insert(users).values([
      { id: ownerId, name: "token test", email: `${ownerId}@test` },
      { id: otherId, name: "someone else", email: `${otherId}@test` },
    ])
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, ownerId))
    await db.delete(users).where(eq(users.id, otherId))
  })

  it("authenticates the user it was minted for", async () => {
    const { token } = await createToken(ownerId, "laptop", null)
    await expect(userFromBearer(bearing(token))).resolves.toMatchObject({ id: ownerId })
  })

  /**
   * The reason only a hash is stored. A database that leaks should not hand over working
   * credentials, so the plaintext must appear nowhere in the row.
   */
  it("stores no copy of the token it handed out", async () => {
    const { summary, token } = await createToken(ownerId, "hash check", null)
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, summary.id))

    expect(row.tokenHash).not.toBe(token)
    expect(row.tokenHash).toHaveLength(64)
    expect(token).not.toContain(row.tokenHash)
    // the hint is short enough to leave the secret secret
    expect(token.startsWith(row.prefix)).toBe(true)
    expect(row.prefix.length).toBeLessThan(token.length / 2)
  })

  it("refuses a token that is not one it issued", async () => {
    await expect(userFromBearer(bearing("pptgo_not-a-real-token"))).resolves.toBeNull()
  })

  it("refuses a token whose expiry has passed", async () => {
    const { token } = await createToken(ownerId, "expired", new Date(Date.now() - 1000))
    await expect(userFromBearer(bearing(token))).resolves.toBeNull()
  })

  it("honours a token whose expiry is still ahead", async () => {
    const { token } = await createToken(ownerId, "future", new Date(Date.now() + 60_000))
    await expect(userFromBearer(bearing(token))).resolves.toMatchObject({ id: ownerId })
  })

  it("stops authenticating the moment it is revoked", async () => {
    const { summary, token } = await createToken(ownerId, "revoke me", null)
    await expect(userFromBearer(bearing(token))).resolves.toMatchObject({ id: ownerId })

    expect(await deleteToken(summary.id, ownerId)).toBe(true)
    await expect(userFromBearer(bearing(token))).resolves.toBeNull()
  })

  it("will not let one user revoke another's token", async () => {
    const { summary, token } = await createToken(ownerId, "not yours", null)

    expect(await deleteToken(summary.id, otherId)).toBe(false)
    await expect(userFromBearer(bearing(token))).resolves.toMatchObject({ id: ownerId })
  })

  it("lists only the caller's own tokens", async () => {
    await createToken(otherId, "theirs", null)
    const mine = await listTokens(ownerId)
    expect(mine.every((one) => one.name !== "theirs")).toBe(true)
  })

  it("records that a token has been used", async () => {
    const { summary, token } = await createToken(ownerId, "touch", null)
    expect(summary.lastUsedAt).toBeNull()

    await userFromBearer(bearing(token))
    // the write is deliberately not awaited by the verifier, so give it a moment to land
    await new Promise((done) => setTimeout(done, 200))

    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, summary.id))
    expect(row.lastUsedAt).not.toBeNull()
  })
})
