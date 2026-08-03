import { describe, expect, it } from "vitest"
import { toPlainText, toStoredHtml, truncate } from "./text"

describe("toStoredHtml", () => {
  /**
   * The reason the MCP surface takes plain text at all. The server has no DOM to run the
   * editor's sanitiser in, so instead of cleaning markup it refuses to accept any: every
   * angle bracket a model writes is a character, not a tag.
   */
  it("turns markup into characters rather than markup", () => {
    expect(toStoredHtml('<img src=x onerror=alert(1)>')).toBe(
      "&lt;img src=x onerror=alert(1)&gt;",
    )
    expect(toStoredHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    )
  })

  it("escapes the ampersand before anything that produces one", () => {
    // "&lt;" would become "&amp;lt;" if & were escaped after <
    expect(toStoredHtml("a & b < c")).toBe("a &amp; b &lt; c")
  })

  it("escapes quotes, which would otherwise end an attribute", () => {
    expect(toStoredHtml(`say "hi" it's`)).toBe("say &quot;hi&quot; it&#39;s")
  })

  it("keeps line breaks, since that is how a model writes a second line", () => {
    expect(toStoredHtml("one\ntwo")).toBe("one<br>two")
    expect(toStoredHtml("one\r\ntwo")).toBe("one<br>two")
  })

  it("leaves ordinary text alone", () => {
    expect(toStoredHtml("Q3 业务复盘 — 增长 100%")).toBe("Q3 业务复盘 — 增长 100%")
  })
})

describe("toPlainText", () => {
  it("reads back what was written", () => {
    for (const original of ["a & b", "<not a tag>", "one\ntwo", `quotes "and" 'apostrophes'`]) {
      expect(toPlainText(toStoredHtml(original))).toBe(original)
    }
  })

  it("strips the markup a person's editing leaves behind", () => {
    expect(toPlainText("<b>bold</b> and <i>italic</i>")).toBe("bold and italic")
    expect(toPlainText("<div>one</div><div>two</div>")).toBe("one\ntwo")
  })

  it("decodes the entities the editor writes", () => {
    expect(toPlainText("a&nbsp;b &amp; c")).toBe("a b & c")
  })

  it("leaves an entity it does not know rather than mangling it", () => {
    expect(toPlainText("&mdash;")).toBe("&mdash;")
  })
})

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 10)).toBe("short")
  })

  it("marks where it cut", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…")
  })

  it("flattens the whitespace that would waste the budget", () => {
    expect(truncate("a\n\n  b", 20)).toBe("a b")
  })
})
