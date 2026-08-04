import { describe, expect, it } from "vitest"
import { DEFAULT_THEME } from "@/lib/constants"
import { THEME_PRESET_IDS, presetTheme, resolveTheme, themeCatalogue } from "./themes"
import { contrast, contrastFloor } from "./tokens"

const everyPreset = THEME_PRESET_IDS.map((id) => [id] as const)

describe("the four fields a preset survives in", () => {
  it.each(everyPreset)("%s comes back out of a DeckTheme as itself", (id) => {
    const stored = presetTheme(id)!
    expect(resolveTheme(stored).id).toBe(id)
  })

  /**
   * `mono-brand` exists to have its accent replaced, so the signature the preset is
   * recognised by deliberately excludes that slot. If it did not, overriding the accent
   * would silently drop the deck back to derived tokens.
   */
  it("still recognises a preset whose accent the user replaced", () => {
    const stored = presetTheme("mono-brand", "#047857")!
    const resolved = resolveTheme(stored)
    expect(resolved.id).toBe("mono-brand")
    expect(resolved.colors.accent).toBe("#047857")
  })

  it("leads themeColors with primary then accent, which is what charts consume", () => {
    const stored = presetTheme("corporate", "#047857")!
    expect(stored.themeColors[0]).toBe(resolveTheme(stored).colors.primary)
    expect(stored.themeColors[1]).toBe("#047857")
  })

  it("refuses a name it does not have", () => {
    expect(presetTheme("art-deco")).toBeUndefined()
  })
})

describe("a theme nobody picked from the list", () => {
  it("derives a full token set from the deck's own four fields", () => {
    const resolved = resolveTheme(DEFAULT_THEME)
    expect(resolved.id).toBe("custom")
    expect(resolved.colors.background).toBe(DEFAULT_THEME.backgroundColor)
    expect(resolved.colors.ink).toBe(DEFAULT_THEME.fontColor)
    expect(resolved.colors.primary).toBe(DEFAULT_THEME.themeColors[0])
  })

  it("derives a surface that is a step off the page in either direction", () => {
    const light = resolveTheme({ ...DEFAULT_THEME, backgroundColor: "#ffffff", fontColor: "#000000" })
    const dark = resolveTheme({ ...DEFAULT_THEME, backgroundColor: "#000000", fontColor: "#ffffff" })
    expect(light.colors.surface).not.toBe("#ffffff")
    expect(dark.colors.surface).not.toBe("#000000")
    expect(contrast(light.colors.ink, light.colors.surface)).toBeGreaterThan(4.5)
    expect(contrast(dark.colors.ink, dark.colors.surface)).toBeGreaterThan(4.5)
  })

  it("survives a theme with a single theme colour", () => {
    const resolved = resolveTheme({ ...DEFAULT_THEME, themeColors: ["#1d4ed8"] })
    expect(resolved.colors.accent).toBe("#1d4ed8")
    expect(resolved.chart.length).toBeGreaterThan(0)
  })
})

/**
 * Every pairing the layouts actually put on a page, checked at the size they use it.
 *
 * This is the reason the presets are a table rather than eight tasteful guesses: a palette
 * that looks fine and puts a 4.1:1 caption on the page is a palette that ships an
 * unreadable deck, and nobody notices by looking.
 */
describe("what each preset is legible at", () => {
  it.each(everyPreset)("%s clears the WCAG floor everywhere the layouts use it", (id) => {
    const theme = resolveTheme(presetTheme(id)!)
    const { background, surface, ink, muted, mutedSurface, primary, accent, onPrimary, onAccent } =
      theme.colors

    const pairings: [string, string, string, number][] = [
      ["body on page", ink, background, theme.scale.body],
      ["caption on page", muted, background, theme.scale.caption],
      ["body on a card", ink, surface, theme.scale.body],
      ["caption on a card", mutedSurface, surface, theme.scale.caption],
      ["heading on page", primary, background, theme.scale.subtitle],
      ["heading on a card", primary, surface, theme.scale.subtitle],
      ["kicker on page", accent, background, theme.scale.caption],
      ["label on a primary band", onPrimary, primary, theme.scale.subtitle],
      ["label on an accent band", onAccent, accent, theme.scale.subtitle],
    ]

    for (const [what, fore, back, size] of pairings) {
      const ratio = contrast(fore, back)
      const floor = contrastFloor(size)
      expect(
        ratio,
        `${id}: ${what} — ${fore} on ${back} is ${ratio.toFixed(2)}:1, needs ${floor}:1`,
      ).toBeGreaterThanOrEqual(floor)
    }
  })
})

describe("the catalogue an agent chooses from", () => {
  it("names every preset once, with something to choose on", () => {
    const listed = themeCatalogue()
    expect(listed.map((one) => one.preset)).toEqual([...THEME_PRESET_IDS])
    for (const one of listed) {
      expect(one.summary.length).toBeGreaterThan(10)
      expect(one.best.length).toBeGreaterThan(10)
    }
  })
})
