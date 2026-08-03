import { describe, expect, it } from "vitest"
import { alphaOf, flattenGradient, pt, toHex, transparency } from "./color"

describe("toHex", () => {
  it("passes six-digit hex through, upper-cased and unprefixed", () => {
    expect(toHex("#2563eb")).toBe("2563EB")
    expect(toHex("2563eb")).toBe("2563EB")
  })

  // Slicing a three-digit hex used to yield "FFF", which is not a valid OOXML colour.
  it("expands shorthand hex", () => {
    expect(toHex("#fff")).toBe("FFFFFF")
    expect(toHex("#f00")).toBe("FF0000")
  })

  it("converts rgb() and rgba()", () => {
    expect(toHex("rgb(255, 0, 0)")).toBe("FF0000")
    expect(toHex("rgba(0, 0, 0, 0.35)")).toBe("000000")
    expect(toHex("rgb(37 99 235)")).toBe("2563EB")
  })

  it("handles colour keywords and falls back for nonsense", () => {
    expect(toHex("white")).toBe("FFFFFF")
    expect(toHex("not-a-colour")).toBe("000000")
    expect(toHex("not-a-colour", "FFFFFF")).toBe("FFFFFF")
    expect(toHex(undefined)).toBe("000000")
  })

  it("drops the alpha channel of an eight-digit hex", () => {
    expect(toHex("#2563eb80")).toBe("2563EB")
  })
})

describe("alphaOf", () => {
  it("reads alpha out of rgba and #rrggbbaa", () => {
    expect(alphaOf("rgba(0,0,0,0.5)")).toBe(0.5)
    expect(alphaOf("#00000080")).toBeCloseTo(0.502, 2)
  })

  it("treats opaque and unparseable colours as fully opaque", () => {
    expect(alphaOf("#000000")).toBe(1)
    expect(alphaOf(undefined)).toBe(1)
    expect(alphaOf("transparent")).toBe(0)
  })
})

describe("flattenGradient", () => {
  it("averages the stops", () => {
    expect(
      flattenGradient({
        type: "linear",
        rotate: 0,
        stops: [
          { pos: 0, color: "#000000" },
          { pos: 100, color: "#ffffff" },
        ],
      }),
    ).toBe("808080")
  })

  it("falls back when there are no stops", () => {
    expect(flattenGradient({ type: "linear", rotate: 0, stops: [] }, "ABCDEF")).toBe("ABCDEF")
  })
})

describe("unit conversion", () => {
  it("maps canvas units to points at 1000 units = 10 inches", () => {
    expect(pt(24)).toBe(17)
    expect(pt(100)).toBe(72)
  })

  it("inverts CSS opacity into OOXML transparency", () => {
    expect(transparency(1)).toBeUndefined()
    expect(transparency(undefined)).toBeUndefined()
    expect(transparency(0.4)).toBe(60)
    expect(transparency(0)).toBe(100)
  })
})
