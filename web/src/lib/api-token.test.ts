import { describe, expect, it } from "vitest"
import { bearerToken } from "./api-token"

const withHeader = (value: string | null) =>
  new Request("https://pptgo.test/api/mcp", {
    headers: value === null ? {} : { authorization: value },
  })

describe("bearerToken", () => {
  it("reads a token out of a Bearer header", () => {
    expect(bearerToken(withHeader("Bearer pptgo_abc123"))).toBe("pptgo_abc123")
  })

  it("accepts the scheme in any case, as the HTTP spec requires", () => {
    expect(bearerToken(withHeader("bearer pptgo_abc123"))).toBe("pptgo_abc123")
    expect(bearerToken(withHeader("BEARER pptgo_abc123"))).toBe("pptgo_abc123")
  })

  it("ignores a request with no authorization at all", () => {
    expect(bearerToken(withHeader(null))).toBeNull()
  })

  it("ignores schemes that are not Bearer", () => {
    expect(bearerToken(withHeader("Basic cHB0Z286cHB0Z28="))).toBeNull()
  })

  /**
   * A value that is not one of ours never reaches the database. It costs nothing to check
   * and keeps a stray cookie or a Google id token from being hashed and looked up.
   */
  it("ignores a Bearer value that is not shaped like one of ours", () => {
    expect(bearerToken(withHeader("Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc"))).toBeNull()
    expect(bearerToken(withHeader("Bearer "))).toBeNull()
  })

  it("tolerates the padding a hand-edited config tends to acquire", () => {
    expect(bearerToken(withHeader("Bearer   pptgo_abc123  "))).toBe("pptgo_abc123")
  })
})
