import { SINGLE_LINE } from "./constants"

/**
 * How tall one line of a given face is, as a multiple of its type size.
 *
 * This is the conversion between PowerPoint's line spacing and CSS's. PowerPoint measures
 * spacing against the font's own default line box; CSS `line-height` measures it against
 * the type size. `line-height: normal` is exactly the former — the browser derives it from
 * the face's ascent, descent and line gap — so measuring it gives the real factor for the
 * actual font rather than the 1.2 that only ever approximated it.
 *
 * The probe text matters as much as the family. A CJK face carries far more leading than a
 * Latin one, so measuring "Ag中" in a Latin-only stack would report a height no line of
 * that text will ever reach. The stack itself says which to use: the importer only appends
 * an East Asian family when the source set `a:ea`, so a stack that names one is a stack
 * whose text is expected to contain CJK.
 *
 * Measured lazily and cached per stack — this runs once per text element on import, and
 * the layout read is the expensive part.
 */
const cache = new Map<string, number>()

export function singleLineFactor(fontFamily: string): number {
  const cached = cache.get(fontFamily)
  if (cached !== undefined) return cached

  const measured = measure(fontFamily)
  cache.set(fontFamily, measured)
  return measured
}

/** Families whose metrics are set by CJK glyphs, plus any name written in CJK itself. */
const CJK_FAMILY =
  /YaHei|SimSun|SimHei|KaiTi|FangSong|NSimSun|PingFang|Hiragino|Yu (Gothic|Mincho)|Meiryo|Malgun|Batang|Gulim|Dotum|MS (Mincho|Gothic|PMincho|PGothic)|JhengHei|Noto (Sans|Serif) (SC|TC|HK|JP|KR)|Source Han|Songti|Heiti|Kaiti|STSong|STHeiti|[぀-ヿ一-鿿]/i

/** Big enough that the measured height keeps a useful number of significant digits. */
const PROBE_SIZE = 200

function measure(fontFamily: string): number {
  if (typeof document === "undefined") return SINGLE_LINE

  const probe = document.createElement("div")
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;" +
    `line-height:normal;padding:0;border:0;font-size:${PROBE_SIZE}px`
  probe.style.fontFamily = fontFamily
  probe.textContent = CJK_FAMILY.test(fontFamily) ? "Ag中" : "Ag"
  document.body.appendChild(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()

  const factor = height / PROBE_SIZE
  // jsdom and anything else without real layout reports 0; a value far outside the
  // plausible range means the probe never laid out, so fall back rather than trust it
  return factor >= 0.5 && factor <= 3 ? factor : SINGLE_LINE
}
