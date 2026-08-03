import { describe, expect, it } from "vitest"
import { escapeHtml, htmlToPlainText, replaceInHtmlText, sanitizeHtml } from "./sanitize"

describe("sanitizeHtml", () => {
  it("drops event handlers on allowed tags", () => {
    expect(sanitizeHtml('<b onclick="alert(1)">hi</b>')).toBe("<b>hi</b>")
  })

  it("drops a bare dangerous element", () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).toBe("")
  })

  // The bug this guards: unwrapping a disallowed tag moves its children to a position the
  // walk has already passed. Skipping them let `<article><img onerror>` through untouched.
  it("scrubs children promoted out of a disallowed wrapper", () => {
    expect(sanitizeHtml('<article><img src=x onerror="alert(1)"></article>')).toBe("")
    expect(sanitizeHtml('<section><b onclick="alert(1)">hi</b></section>')).toBe("<b>hi</b>")
  })

  it("scrubs children promoted through several disallowed wrappers", () => {
    expect(sanitizeHtml('<main><article><figure><img src=x onerror="alert(1)">')).toBe("")
  })

  it("keeps promoted text content", () => {
    expect(sanitizeHtml("<article>hello</article>")).toBe("hello")
    expect(sanitizeHtml("<div><section>a</section>b</div>")).toBe("<div>ab</div>")
  })

  it("removes script subtrees entirely rather than promoting their text", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe("")
    expect(sanitizeHtml("<div><script>alert(1)</script>ok</div>")).toBe("<div>ok</div>")
  })

  it("rejects style values that could load or execute something", () => {
    expect(sanitizeHtml('<span style="background:url(javascript:alert(1))">x</span>')).toBe(
      "<span>x</span>",
    )
    expect(sanitizeHtml('<span style="width:expression(alert(1))">x</span>')).toBe("<span>x</span>")
    expect(sanitizeHtml('<span style="color:#ff0000">x</span>')).toBe(
      '<span style="color:#ff0000">x</span>',
    )
  })

  it("only allows safe link schemes and forces a safe target", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">x</a>',
    )
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    )
  })

  it("strips comments", () => {
    expect(sanitizeHtml("<!-- note -->text")).toBe("text")
  })

  it("keeps the rich-text tags the editor produces", () => {
    const html = "<ul><li><b>a</b></li><li><sup>2</sup></li></ul>"
    expect(sanitizeHtml(html)).toBe(html)
  })
})

describe("htmlToPlainText", () => {
  it("turns block boundaries into newlines", () => {
    expect(htmlToPlainText("<div>a</div><div>b</div>")).toBe("a\nb")
    expect(htmlToPlainText("a<br>b")).toBe("a\nb")
  })

  it("decodes entities", () => {
    expect(htmlToPlainText("a&amp;b&nbsp;c")).toBe("a&b c")
    expect(htmlToPlainText("&lt;tag&gt;")).toBe("<tag>")
  })

  it("round-trips with escapeHtml", () => {
    const text = "a < b & c"
    expect(htmlToPlainText(escapeHtml(text))).toBe(text)
  })
})

describe("replaceInHtmlText", () => {
  const re = () => new RegExp("形状", "gi")

  it("keeps the markup around a replaced word", () => {
    const { html, replaced } = replaceInHtmlText(
      '<div>插入<b>形状</b>和<span style="color:#f00">形状</span></div>',
      re(),
      "图形",
    )
    expect(replaced).toBe(2)
    expect(html).toContain("<b>图形</b>")
    expect(html).toContain('style="color:#f00"')
    expect(html).not.toContain("形状")
  })

  it("keeps lists and links intact", () => {
    const { html } = replaceInHtmlText(
      '<ul><li>形状 A</li><li><a href="https://x.test">形状 B</a></li></ul>',
      re(),
      "图形",
    )
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>")
    expect(html).toContain('href="https://x.test"')
    expect(html).toContain("图形 A")
  })

  it("reports nothing replaced when the term is absent, and leaves the html untouched", () => {
    const source = "<div><b>别的</b>内容</div>"
    const { html, replaced } = replaceInHtmlText(source, re(), "图形")
    expect(replaced).toBe(0)
    expect(html).toBe(source)
  })

  it("escapes a replacement that looks like markup", () => {
    const { html } = replaceInHtmlText("<div>形状</div>", re(), '<img src=x onerror="alert(1)">')
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
  })

  it("does not corrupt a match that straddles two tags", () => {
    // "形状" split across the boundary cannot be replaced without deciding which half
    // keeps the bold, so it is left alone rather than guessed at
    const source = "<div>形<b>状</b></div>"
    const { html, replaced } = replaceInHtmlText(source, re(), "图形")
    expect(replaced).toBe(0)
    expect(html).toBe(source)
  })
})
