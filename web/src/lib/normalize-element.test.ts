import { describe, expect, it } from "vitest"
import { createTextElement, normalizeElement, normalizeIncomingElements } from "./factory"
import { MIN_ELEMENT_SIZE } from "./constants"
import type { SlideElement, TextElement } from "@/types/slides"

const textEl = (over: Partial<TextElement> = {}) => ({ ...createTextElement(over) })

describe("normalizeElement", () => {
  it("sanitises rich text on the way in", () => {
    const el = normalizeElement(textEl({ content: '<b onclick="x">hi</b><script>bad()</script>' }))
    expect(el).not.toBeNull()
    expect((el as TextElement).content).toBe("<b>hi</b>")
  })

  it("rejects an element whose type the renderer does not know", () => {
    expect(normalizeElement({ ...textEl(), type: "iframe" })).toBeNull()
    expect(normalizeElement({ ...textEl(), type: undefined })).toBeNull()
    expect(normalizeElement("not an element")).toBeNull()
    expect(normalizeElement(null)).toBeNull()
    expect(normalizeElement([textEl()])).toBeNull()
  })

  it("replaces non-numeric geometry rather than letting NaN through", () => {
    const el = normalizeElement({
      ...textEl(),
      left: "abc",
      top: null,
      width: NaN,
      height: Infinity,
      rotate: "x",
    })!
    expect(el.left).toBe(0)
    expect(el.top).toBe(0)
    expect(el.width).toBeGreaterThanOrEqual(MIN_ELEMENT_SIZE)
    expect(el.height).toBeGreaterThanOrEqual(MIN_ELEMENT_SIZE)
    expect(el.rotate).toBe(0)
  })

  it("floors a collapsed element at the minimum size", () => {
    const el = normalizeElement({ ...textEl(), width: 0, height: -40 })!
    expect(el.width).toBe(MIN_ELEMENT_SIZE)
    expect(el.height).toBe(MIN_ELEMENT_SIZE)
  })

  it("keeps only hyperlink schemes that are safe to follow", () => {
    const link = (target: unknown) =>
      normalizeElement({ ...textEl(), link: { type: "web", target } })!.link

    expect(link("https://example.test")).toEqual({ type: "web", target: "https://example.test" })
    expect(link("mailto:a@b.test")).toEqual({ type: "web", target: "mailto:a@b.test" })
    expect(link("javascript:alert(1)")).toBeUndefined()
    expect(link("data:text/html,<script>alert(1)</script>")).toBeUndefined()
    expect(link("  javascript:alert(1)")).toBeUndefined()
    expect(link(42)).toBeUndefined()
  })

  it("still upgrades the bare-string links older decks stored", () => {
    const el = normalizeElement({ ...textEl(), link: "https://example.test" })!
    expect(el.link).toEqual({ type: "web", target: "https://example.test" })
  })

  it("survives a shape whose text is not an object", () => {
    const el = normalizeElement({
      type: "shape",
      id: "s1",
      name: "",
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      rotate: 0,
      shapeKey: "rect",
      text: "just a string",
    })
    expect(el).not.toBeNull()
    expect((el as Extract<SlideElement, { type: "shape" }>).text.content).toBe("")
  })

  it("survives a table whose rows are not a grid", () => {
    const el = normalizeElement({
      type: "table",
      id: "t1",
      name: "",
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      rotate: 0,
      rows: ["nope", [{ text: "<b>x</b>" }, null]],
      colWidths: "bad",
    })
    expect(el).not.toBeNull()
    const table = el as Extract<SlideElement, { type: "table" }>
    // cell text is plain text, so markup in it is kept as characters rather than rendered
    expect(table.rows[1][0].text).toBe("<b>x</b>")
    expect(table.colWidths.every((w) => Number.isFinite(w))).toBe(true)
  })

  it("clears the element names older decks baked a language into", () => {
    expect(normalizeElement({ ...textEl(), name: "文本" })!.name).toBe("")
    expect(normalizeElement({ ...textEl(), name: "矩形" })!.name).toBe("")
    // a name that is not one of those was set deliberately — a media file's own name
    expect(normalizeElement({ ...textEl(), name: "intro.mp4" })!.name).toBe("intro.mp4")
  })
})

describe("normalizeIncomingElements", () => {
  /**
   * The clipboard marker only says a payload is shaped like ours. Any page can write one,
   * so the paste path has to scrub it: this used to reach `dangerouslySetInnerHTML` with
   * its markup intact, and the autosave then made it permanent.
   */
  it("scrubs a hostile clipboard payload", () => {
    const [el] = normalizeIncomingElements([
      textEl({ content: '<img src=x onerror="alert(1)">stay' }),
    ])
    expect((el as TextElement).content).toBe("stay")
  })

  it("drops entries that are not elements at all", () => {
    expect(normalizeIncomingElements([null, 1, "x", {}, [1]])).toEqual([])
    expect(normalizeIncomingElements("not an array")).toEqual([])
    expect(normalizeIncomingElements(undefined)).toEqual([])
  })

  it("gives every element a fresh id, so a paste cannot collide with the original", () => {
    const source = textEl({ id: "same" })
    const pasted = normalizeIncomingElements([source, source])
    expect(pasted).toHaveLength(2)
    expect(pasted[0].id).not.toBe("same")
    expect(pasted[0].id).not.toBe(pasted[1].id)
  })

  it("keeps the good entries alongside the bad ones", () => {
    const pasted = normalizeIncomingElements([textEl({ content: "keep" }), { type: "evil" }])
    expect(pasted).toHaveLength(1)
    expect((pasted[0] as TextElement).content).toBe("keep")
  })
})
