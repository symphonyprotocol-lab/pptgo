import { buildSteps } from "./animation"
import { gradFillXml } from "./ooxml-fill"
import { shapeGeometryXml } from "./ooxml-geometry"
import { timingXml, transitionXml, type TimedAnimation } from "./ooxml-timing"
import { elementLabel } from "./element-label"
import { fallbackTranslate, type Translate } from "./i18n/translate"
import type { Deck, Slide } from "@/types/slides"

/**
 * The second half of export: everything OOXML can say and pptxgenjs cannot write.
 *
 * pptxgenjs emits solid fills, preset geometry and no timing at all, so gradients, custom
 * contours, transitions and animations all used to be lost or flattened on the way out.
 * Rather than fork the library, the generated package is reopened and those four things
 * are written into the slides it produced — the same trick the East Asian font fixup below
 * has always used, applied to the parts of a slide that need a node replaced rather than
 * an attribute corrected.
 *
 * Every element is placed carrying a marker in its `p:cNvPr@name`, which is what lets a
 * shape here be matched to the element it came from; the marker is replaced with the
 * element's real name on the way past, so nothing of this shows up in PowerPoint.
 */

/** What an element is called in the generated file, before the patch pass renames it. */
export const exportMarker = (index: number) => `pptgo-${index}`

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

export async function patchPptx(
  raw: ArrayBuffer,
  deck: Deck,
  t: Translate = fallbackTranslate,
): Promise<ArrayBuffer> {
  const { default: JSZipCtor } = await import("jszip")
  const zip = await JSZipCtor.loadAsync(raw)
  const eastAsian = eastAsianByLatin(deck)

  for (const [index, slide] of deck.slides.entries()) {
    const name = `ppt/slides/slide${index + 1}.xml`
    const file = zip.file(name)
    if (!file) continue
    const patched = patchSlide(await file.async("string"), slide, t)
    zip.file(name, eastAsian.size ? withEastAsianFonts(patched, eastAsian) : patched)
  }

  return zip.generateAsync({ type: "arraybuffer" })
}

function patchSlide(xml: string, slide: Slide, t: Translate): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  if (doc.getElementsByTagName("parsererror").length) return xml
  const root = doc.documentElement

  const shapes = shapesByName(root)
  const spids = new Map<string, number>()

  for (const [index, el] of slide.elements.entries()) {
    const found = shapes.get(exportMarker(index))
    if (!found) continue
    const { shape, nvPr } = found

    const spid = Number(nvPr.getAttribute("id"))
    if (Number.isFinite(spid)) spids.set(el.id, spid)
    // the marker has done its job; what PowerPoint's selection pane shows is the real name
    nvPr.setAttribute("name", elementLabel(el, t))

    const spPr = descendant(shape, "p:spPr")
    if (!spPr) continue

    if (el.type === "shape") {
      const geometry = shapeGeometryXml(el)
      if (geometry) replaceChild(doc, spPr, "a:prstGeom", geometry)
      if (el.gradient) {
        const gradient = gradFillXml(el.gradient, el.opacity ?? 1)
        // a shape whose gradient will not convert keeps the flattened average already written
        if (gradient) replaceChild(doc, spPr, "a:solidFill", gradient)
      }
    }
  }

  if (slide.background.type === "gradient" && slide.background.gradient) {
    const bgPr = descendant(root, "p:bgPr")
    const gradient = gradFillXml(slide.background.gradient)
    if (bgPr && gradient) replaceChild(doc, bgPr, "a:solidFill", gradient)
  }

  const timed: TimedAnimation[][] = buildSteps(slide.animations).map((step) =>
    step
      .map((animation) => ({ animation, spid: spids.get(animation.elId) }))
      // an animation whose element never made it onto the slide has nothing to target
      .filter((row): row is TimedAnimation => row.spid !== undefined),
  )

  // p:transition and p:timing follow p:clrMapOvr, which is the last thing pptxgenjs writes
  appendToSlide(doc, root, transitionXml(slide.transition))
  appendToSlide(doc, root, timingXml(timed))

  return new XMLSerializer().serializeToString(doc)
}

// ------------------------------------------------------------------- XML plumbing

/**
 * Every placed object on the slide, keyed by the marker it was exported with. Tables and
 * charts sit in a `p:graphicFrame` and pictures in a `p:pic` rather than a `p:sp`, and all
 * of them carry the same `p:cNvPr`, so the lookup is by that rather than by element kind.
 *
 * Both halves are kept: the name and the shape id an animation has to target live on the
 * `p:cNvPr`, while the geometry and the fill live on the object two levels above it.
 */
function shapesByName(root: Element): Map<string, { shape: Element; nvPr: Element }> {
  const byName = new Map<string, { shape: Element; nvPr: Element }>()
  for (const nvPr of Array.from(root.getElementsByTagName("p:cNvPr"))) {
    const name = nvPr.getAttribute("name")
    // p:cNvPr -> p:nvSpPr -> p:sp, and the same shape for a picture or a graphic frame
    const shape = nvPr.parentElement?.parentElement
    if (name && shape) byName.set(name, { shape, nvPr })
  }
  return byName
}

const descendant = (node: Element, tag: string): Element | null =>
  node.getElementsByTagName(tag)[0] ?? null

/**
 * Swaps one direct child for a fragment. Direct rather than descendant because a shape's
 * outline carries an `a:solidFill` of its own inside `a:ln`, and recolouring the outline
 * with the fill's gradient is not what anyone asked for.
 *
 * Nothing is appended when the child is absent: `p:spPr` is an ordered sequence, and a
 * fill added after the outline is in the wrong place — PowerPoint reads that as a damaged
 * file and offers to repair it.
 */
function replaceChild(doc: Document, parent: Element, tag: string, xml: string) {
  const existing = Array.from(parent.children).find((child) => child.tagName === tag)
  if (!existing) return
  const node = fragment(doc, xml)
  if (node) parent.replaceChild(node, existing)
}

function appendToSlide(doc: Document, root: Element, xml: string | null) {
  const node = xml && fragment(doc, xml)
  if (node) root.appendChild(node)
}

/** One element, parsed against the namespaces a slide uses and adopted into its document. */
function fragment(doc: Document, xml: string): Element | null {
  const parsed = new DOMParser().parseFromString(`<pptgo ${NS}>${xml}</pptgo>`, "application/xml")
  if (parsed.getElementsByTagName("parsererror").length) return null
  const node = parsed.documentElement.firstElementChild
  return node ? (doc.importNode(node, true) as Element) : null
}

// ------------------------------------------------------- East Asian font recovery

/** Escapes a value going into a double-quoted XML attribute. */
export const xmlAttr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/**
 * pptxgenjs takes a single `fontFace` per run and writes it into `a:latin`, `a:ea` and
 * `a:cs` alike, so a Chinese deck came back out with its Chinese font replaced by the
 * Latin one — the import fix that recovered 黑体 / 宋体 / 楷体 would have been undone by
 * the first export. The tags are already in the generated XML, so this only rewrites the
 * `a:ea` value; nothing about the document's structure changes.
 */
function withEastAsianFonts(xml: string, eastAsian: Map<string, string>): string {
  // keyed off the `a:latin` value sitting in the same rPr, so each run is matched to the
  // pairing it actually came from rather than to a document-wide guess
  return xml.replace(
    /(<a:latin typeface="([^"]*)"[^>]*\/>\s*<a:ea typeface=")([^"]*)(")/g,
    (whole, head: string, latin: string, _current: string, tail: string) => {
      const ea = eastAsian.get(latin)
      // the name is a deck value being written into XML, so it is escaped like any other
      return ea ? `${head}${xmlAttr(ea)}${tail}` : whole
    },
  )
}

/** Generic families are CSS fallbacks, not typefaces, and must never reach the file. */
const GENERIC_FAMILY = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i

const facesOf = (stack: string) =>
  stack
    .split(",")
    .map((part) => part.replace(/['"]/g, "").trim())
    .filter((part) => part && !GENERIC_FAMILY.test(part))

/**
 * Latin face -> the East Asian face the deck pairs it with, harvested from the font
 * stacks the importer built. A stack only carries a second family when the source set
 * `a:ea`, so its presence is the signal.
 *
 * One Latin face is paired with one East Asian face in every real deck examined — a
 * designer picks 黑体 for headings and 宋体 for body, and the Latin faces differ along
 * with them. Should a deck ever break that, the most frequent pairing wins, which keeps
 * the common case right instead of dropping both.
 */
function eastAsianByLatin(deck: Deck): Map<string, string> {
  const tally = new Map<string, Map<string, number>>()

  const record = (stack: string | undefined) => {
    if (!stack) return
    const [latin, ea] = facesOf(stack)
    if (!latin || !ea || latin === ea) return
    const byEa = tally.get(latin) ?? new Map<string, number>()
    byEa.set(ea, (byEa.get(ea) ?? 0) + 1)
    tally.set(latin, byEa)
  }

  for (const slide of deck.slides) {
    for (const el of slide.elements) {
      if (el.type === "text") record(el.fontFamily)
      else if (el.type === "shape") record(el.text.fontFamily)
      else if (el.type === "table") record(el.fontFamily)
    }
  }

  const winners = new Map<string, string>()
  for (const [latin, byEa] of tally) {
    const best = [...byEa].sort((a, b) => b[1] - a[1])[0]
    if (best) winners.set(latin, best[0])
  }
  return winners
}
