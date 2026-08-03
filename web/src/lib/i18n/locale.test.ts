import { describe, expect, it } from "vitest"
import { matchLocale, parseAcceptLanguage } from "./locale"

describe("matchLocale", () => {
  it("treats every Chinese region as Chinese", () => {
    expect(matchLocale(["zh-Hans-CN"])).toBe("zh")
    expect(matchLocale(["zh-TW"])).toBe("zh")
    expect(matchLocale(["zh"])).toBe("zh")
  })

  it("falls back to English for anything else", () => {
    expect(matchLocale(["ja-JP"])).toBe("en")
    expect(matchLocale(["de", "fr"])).toBe("en")
    expect(matchLocale([])).toBe("en")
  })

  it("honours order, so the first understood language wins", () => {
    expect(matchLocale(["ja", "zh-CN", "en"])).toBe("zh")
    expect(matchLocale(["ja", "en-GB", "zh"])).toBe("en")
  })
})

describe("parseAcceptLanguage", () => {
  it("orders tags by q-value rather than by position", () => {
    expect(parseAcceptLanguage("en;q=0.5,zh-CN;q=0.9")).toEqual(["zh-CN", "en"])
  })

  it("defaults a missing q to the highest priority", () => {
    expect(parseAcceptLanguage("zh-CN,en;q=0.8")).toEqual(["zh-CN", "en"])
  })

  it("survives an absent or empty header", () => {
    expect(parseAcceptLanguage(null)).toEqual([])
    expect(parseAcceptLanguage("")).toEqual([])
  })
})
