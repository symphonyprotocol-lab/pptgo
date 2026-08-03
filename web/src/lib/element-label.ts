import { FREEHAND_KEY } from "./freehand"
import { SHAPE_MAP } from "./shapes"
import type { MessageKey } from "./i18n/messages"
import type { Translate } from "./i18n/translate"
import type { SlideElement } from "@/types/slides"

const BY_TYPE: Record<SlideElement["type"], MessageKey> = {
  text: "element.text",
  image: "element.image",
  shape: "element.shape",
  line: "element.line",
  table: "element.table",
  chart: "element.chart",
  video: "element.video",
  audio: "element.audio",
  formula: "element.formula",
}

/**
 * What an element is called in the layer panel and in exported alt text.
 *
 * `name` used to be filled in by the factories with a Chinese literal, which meant the
 * language a deck was *created* in travelled inside the document and came back out on
 * every later reader's screen. It is now empty unless something deliberately set it — an
 * imported PPTX shape, a media file's own filename — and the fallback is resolved per
 * render, in the reader's language.
 */
export function elementLabel(el: SlideElement, t: Translate): string {
  if (el.name) return el.name
  if (el.type === "shape") {
    if (el.shapeKey === FREEHAND_KEY) return t("element.freehand")
    const def = SHAPE_MAP.get(el.shapeKey)
    if (def) return t(def.labelKey)
  }
  return t(BY_TYPE[el.type])
}
