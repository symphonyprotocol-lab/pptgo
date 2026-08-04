import { describe, expect, it } from "vitest"
import { slideNumber } from "./slide-number"

describe("the slide counter's number", () => {
  it("leaves single digits alone in a deck that never reaches ten", () => {
    expect(slideNumber(1, 9)).toBe("1")
    expect(slideNumber(9, 9)).toBe("9")
  })

  it("pads to two digits from ten slides on, so the counter stops twitching", () => {
    expect(slideNumber(1, 10)).toBe("01")
    expect(slideNumber(9, 10)).toBe("09")
    expect(slideNumber(10, 10)).toBe("10")
  })

  it("keeps up with a deck in the hundreds", () => {
    expect(slideNumber(7, 100)).toBe("007")
    expect(slideNumber(42, 100)).toBe("042")
    expect(slideNumber(100, 100)).toBe("100")
  })

  /** The deck is loading, or has been emptied under the reader. */
  it("does not divide by an empty deck", () => {
    expect(slideNumber(1, 0)).toBe("1")
  })
})
