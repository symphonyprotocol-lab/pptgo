import { describe, expect, it } from "vitest"
import { htmlToRuns, primaryFont, type RunDefaults } from "./rich-text"

const defaults: RunDefaults = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: "111827",
  fontSize: 17,
  fontFace: "Arial",
}

describe("htmlToRuns", () => {
  it("returns nothing for empty content", () => {
    expect(htmlToRuns("", defaults)).toEqual([])
  })

  it("applies the element defaults to plain text", () => {
    const runs = htmlToRuns("hello", defaults)
    expect(runs).toHaveLength(1)
    expect(runs[0].text).toBe("hello")
    expect(runs[0].options).toMatchObject({ bold: false, color: "111827", fontSize: 17 })
  })

  // The whole point of this module: partial-paragraph formatting used to flatten away.
  it("splits a paragraph into separately formatted runs", () => {
    const runs = htmlToRuns("normal <b>bold</b> tail", defaults)
    expect(runs.map((r) => r.text)).toEqual(["normal ", "bold", " tail"])
    expect(runs[0].options?.bold).toBe(false)
    expect(runs[1].options?.bold).toBe(true)
    expect(runs[2].options?.bold).toBe(false)
  })

  it("carries inline colour and size through", () => {
    const runs = htmlToRuns('<span style="color:#ff0000;font-size:48px">big</span>', defaults)
    expect(runs[0].options?.color).toBe("FF0000")
    // 48 canvas units at 1000 units = 10in is ~35pt
    expect(runs[0].options?.fontSize).toBe(35)
  })

  it("marks paragraph ends with breakLine, except the last", () => {
    const runs = htmlToRuns("<div>one</div><div>two</div>", defaults)
    expect(runs.map((r) => r.text)).toEqual(["one", "two"])
    expect(runs[0].options?.breakLine).toBe(true)
    expect(runs[1].options?.breakLine).toBeUndefined()
  })

  it("treats <br> as a line break", () => {
    const runs = htmlToRuns("a<br>b", defaults)
    expect(runs.map((r) => r.text)).toEqual(["a", "b"])
    expect(runs[0].options?.breakLine).toBe(true)
  })

  it("turns lists into bulleted runs", () => {
    const runs = htmlToRuns("<ul><li>a</li><li>b</li></ul>", defaults)
    expect(runs).toHaveLength(2)
    expect(runs[0].options?.bullet).toBe(true)
    expect(runs[1].options?.bullet).toBe(true)
  })

  it("uses numbered bullets for ordered lists", () => {
    const runs = htmlToRuns("<ol><li>a</li></ol>", defaults)
    expect(runs[0].options?.bullet).toEqual({ type: "number" })
  })

  it("nests list levels", () => {
    const runs = htmlToRuns("<ul><li>a<ul><li>b</li></ul></li></ul>", defaults)
    const nested = runs.find((r) => r.text === "b")
    expect(nested?.options?.indentLevel).toBe(1)
  })

  it("keeps hyperlinks, sub/superscript and highlight", () => {
    const runs = htmlToRuns(
      '<a href="https://example.com">link</a><sup>2</sup><mark>hi</mark>',
      defaults,
    )
    expect(runs[0].options?.hyperlink).toEqual({ url: "https://example.com" })
    expect(runs[1].options?.superscript).toBe(true)
    expect(runs[2].options?.highlight).toBe("FFFF00")
  })

  it("maps underline and strike onto OOXML's shapes", () => {
    const runs = htmlToRuns("<u>a</u><s>b</s>", defaults)
    expect(runs[0].options?.underline).toEqual({ style: "sng" })
    expect(runs[1].options?.strike).toBe("sngStrike")
  })

  it("inherits formatting through nested tags", () => {
    const runs = htmlToRuns("<b><i>x</i></b>", defaults)
    expect(runs[0].options).toMatchObject({ bold: true, italic: true })
  })
})

describe("primaryFont", () => {
  it("takes the first family and unquotes it", () => {
    expect(primaryFont("'Microsoft YaHei', sans-serif")).toBe("Microsoft YaHei")
    expect(primaryFont("Arial")).toBe("Arial")
  })
})
