import { DEFAULT_SCALE, mix, readableOn, type TypeScale } from "./tokens"
import type { DeckTheme } from "@/types/slides"

/**
 * Eight looks, and the round trip that survives being stored in four fields.
 *
 * A theme here is more than `DeckTheme` holds: a surface colour for cards, a muted ink for
 * captions, a type scale, a corner radius, a vertical rhythm. None of that can go into the
 * deck — `DeckTheme` is four fields, and widening it would reach the editor's property
 * panel, the PPTX exporter and every stored document.
 *
 * So the extra tokens are not stored. They are *recovered*: a preset projects into the
 * four fields in a way that identifies it, and `resolveTheme` reads the four fields back
 * and finds the preset again. A deck whose theme a person edited by hand matches nothing,
 * and its tokens are derived from the four fields instead — so hand themes lay out fine,
 * they just get the neutral scale rather than a designed one.
 */

export type Density = "tight" | "regular" | "airy"

interface ThemePreset {
  id: string
  /** one line for the catalogue an agent reads before choosing */
  summary: string
  best: string
  background: string
  ink: string
  primary: string
  accent: string
  /** panels, cards, table bands — a step off the background, never a second background */
  surface: string
  /** captions, axis labels, the second line of a KPI */
  muted: string
  display: string
  body: string
  scale: TypeScale
  radius: number
  /** hairline and underline weight */
  rule: number
  density: Density
  /** the chart palette past primary and accent, which always lead it */
  chartTail: [string, string, string, string]
}

const PRESETS: ThemePreset[] = [
  {
    id: "swiss",
    summary: "Black on white, hard corners, vast whitespace, one red accent.",
    best: "Consulting, architecture, strategy — anywhere restraint reads as confidence.",
    background: "#ffffff",
    ink: "#0a0a0a",
    primary: "#0a0a0a",
    accent: "#e11d48",
    surface: "#f4f4f5",
    muted: "#71717a",
    display: "Helvetica, Arial, sans-serif",
    body: "Helvetica, Arial, sans-serif",
    scale: { display: 72, title: 44, subtitle: 22, body: 18, caption: 14 },
    radius: 0,
    rule: 2,
    density: "airy",
    chartTail: ["#71717a", "#a1a1aa", "#3f3f46", "#d4d4d8"],
  },
  {
    id: "editorial",
    summary: "Warm paper, serif headlines over sans body, rules and columns.",
    best: "Finance, journalism, research, long-form analysis.",
    background: "#fbfaf7",
    ink: "#1c1917",
    primary: "#1c1917",
    accent: "#b45309",
    surface: "#f0ece3",
    muted: "#78716c",
    display: "Georgia, serif",
    body: "Helvetica, Arial, sans-serif",
    scale: { display: 64, title: 40, subtitle: 24, body: 19, caption: 14 },
    radius: 2,
    rule: 1,
    density: "regular",
    chartTail: ["#78716c", "#a8a29e", "#57534e", "#d6d3d1"],
  },
  {
    id: "corporate",
    summary: "White, blue, moderate rounding — the safe default.",
    best: "Business review, project update, sales, anything internal.",
    background: "#ffffff",
    ink: "#0f172a",
    primary: "#1d4ed8",
    // darker than the obvious cyan: at 15 units a caption in this colour has to clear
    // 4.5:1 against white, and #0891b2 does not
    accent: "#0e7490",
    surface: "#f1f5f9",
    muted: "#64748b",
    display: "system-ui, sans-serif",
    body: "system-ui, sans-serif",
    scale: { display: 60, title: 38, subtitle: 24, body: 20, caption: 15 },
    radius: 6,
    rule: 1.5,
    density: "regular",
    chartTail: ["#7c3aed", "#059669", "#d97706", "#be123c"],
  },
  {
    id: "dark-tech",
    summary: "Deep navy canvas, cool blue and cyan accents, glowing panels.",
    best: "Product launches, AI and developer tools, technical keynotes.",
    background: "#0b1020",
    ink: "#e8ecf8",
    primary: "#4f7cff",
    accent: "#22d3ee",
    surface: "#151c33",
    muted: "#8a94b3",
    display: "system-ui, sans-serif",
    body: "system-ui, sans-serif",
    scale: { display: 66, title: 40, subtitle: 24, body: 20, caption: 15 },
    radius: 8,
    rule: 1,
    density: "regular",
    chartTail: ["#a78bfa", "#34d399", "#fbbf24", "#fb7185"],
  },
  {
    id: "warm-report",
    summary: "Oat paper, burnt sienna, teal counterpoint — printed, not projected.",
    best: "Annual reports, ESG and impact, education, non-profit.",
    background: "#faf7f2",
    ink: "#2b2621",
    primary: "#9a3412",
    accent: "#0f766e",
    surface: "#f0e9df",
    muted: "#6f665c",
    display: "Georgia, serif",
    body: "system-ui, sans-serif",
    scale: { display: 62, title: 38, subtitle: 23, body: 20, caption: 14 },
    radius: 4,
    rule: 1,
    density: "regular",
    chartTail: ["#a16207", "#4d7c0f", "#7c2d12", "#57534e"],
  },
  {
    id: "ink",
    summary: "Rice-paper field, ink black, one seal red. Whitespace does the work.",
    best: "Culture and heritage, philosophy, brand storytelling, 新中式.",
    background: "#f7f5f0",
    ink: "#1a1a18",
    primary: "#1a1a18",
    accent: "#9d2933",
    surface: "#ebe7de",
    muted: "#6b6862",
    display: "SimSun, serif",
    body: "'PingFang SC', sans-serif",
    scale: { display: 68, title: 40, subtitle: 23, body: 19, caption: 14 },
    radius: 0,
    rule: 1,
    density: "airy",
    chartTail: ["#6b6862", "#8c7853", "#40605a", "#a89f91"],
  },
  {
    id: "soft-product",
    summary: "Rounded cards on white, violet and pink, friendly and light.",
    best: "SaaS, onboarding, training, consumer product.",
    background: "#ffffff",
    ink: "#1e1b3a",
    primary: "#6d28d9",
    accent: "#be185d",
    surface: "#f5f3ff",
    muted: "#6d6a8a",
    display: "system-ui, sans-serif",
    body: "system-ui, sans-serif",
    scale: { display: 58, title: 36, subtitle: 23, body: 20, caption: 15 },
    radius: 16,
    rule: 1,
    density: "regular",
    chartTail: ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444"],
  },
  {
    id: "mono-brand",
    summary: "Neutral greys with a single brand colour — pass `accent` to set it.",
    best: "Any deck that has to carry someone's brand and nothing else.",
    background: "#ffffff",
    ink: "#18181b",
    primary: "#18181b",
    accent: "#2563eb",
    surface: "#f4f4f5",
    muted: "#71717a",
    display: "system-ui, sans-serif",
    body: "system-ui, sans-serif",
    scale: { display: 62, title: 40, subtitle: 24, body: 20, caption: 15 },
    radius: 4,
    rule: 1.5,
    density: "regular",
    chartTail: ["#52525b", "#a1a1aa", "#3f3f46", "#d4d4d8"],
  },
]

export const THEME_PRESET_IDS = PRESETS.map((preset) => preset.id) as [string, ...string[]]

/** What the catalogue tool hands back — enough to choose by, not the whole token set. */
export const themeCatalogue = () =>
  PRESETS.map((preset) => ({
    preset: preset.id,
    summary: preset.summary,
    best: preset.best,
    background: preset.background,
    ink: preset.ink,
    primary: preset.primary,
    accent: preset.accent,
    fonts: preset.body === preset.display ? preset.body : `${preset.display} / ${preset.body}`,
    density: preset.density,
  }))

/** Vertical rhythm, in canvas units — the gap between a heading and what it introduces. */
const GAPS: Record<Density, number> = { tight: 14, regular: 20, airy: 28 }

/**
 * How far a panel's caption grey moves from the ink toward the panel.
 *
 * Shallower than the page's own `muted` ramp, because a surface is already a step away
 * from the page: taking the same distance again from a lighter starting point is what puts
 * a caption on a card under the contrast floor.
 */
const PANEL_MUTED = 0.3

export interface ResolvedTheme {
  /** the preset this came from, or `custom` when the deck's theme matches none */
  id: string
  colors: {
    background: string
    surface: string
    ink: string
    muted: string
    /**
     * `muted` again, but for text on a panel rather than on the page.
     *
     * The same grey is not the same relationship on a different field: a caption grey
     * chosen against the deck background can land under 4.5:1 on a card. Deriving it from
     * `surface` keeps the relationship, and having it here rather than in the layouts is
     * what lets the palette check recognise it as a colour the theme owns.
     */
    mutedSurface: string
    primary: string
    accent: string
    /** what to write on top of a primary fill */
    onPrimary: string
    onAccent: string
  }
  fonts: { display: string; body: string }
  scale: TypeScale
  radius: number
  rule: number
  density: Density
  gap: number
  chart: string[]
}

const chartOf = (preset: ThemePreset, accent: string) => [
  preset.primary,
  accent,
  ...preset.chartTail,
]

/**
 * The four fields a preset writes into the deck.
 *
 * `themeColors` leads with primary then accent — that is the order charts consume, and it
 * is also what makes the projection identifiable on the way back.
 */
export function presetTheme(id: string, accent?: string): DeckTheme | undefined {
  const preset = PRESETS.find((one) => one.id === id)
  if (!preset) return undefined
  return {
    fontFamily: preset.body,
    fontColor: preset.ink,
    backgroundColor: preset.background,
    themeColors: chartOf(preset, accent ?? preset.accent),
  }
}

/**
 * The signature a preset is recognised by, with the accent slot deliberately left out.
 *
 * `mono-brand` exists to have its accent replaced, and a signature that included the
 * accent would stop recognising it the moment someone did. Everything else in the four
 * fields is fixed by the preset, so the remainder still identifies it.
 */
const signature = (background: string, ink: string, font: string, primary: string, tail: string[]) =>
  [background, ink, font, primary, ...tail].join("|").toLowerCase()

/**
 * The full token set behind a deck's theme.
 *
 * Recognise the preset if the four fields still carry its signature; otherwise derive
 * plausible tokens from whatever is there. Derivation is what makes `slide_layout` work on
 * a deck the user themed by hand, or imported from a `.pptx` — the layouts ask for a
 * surface colour and a muted ink and always get one.
 */
export function resolveTheme(theme: DeckTheme): ResolvedTheme {
  const colors = theme.themeColors ?? []
  const primary = colors[0] ?? theme.fontColor
  const accent = colors[1] ?? primary

  const found = PRESETS.find(
    (preset) =>
      signature(
        theme.backgroundColor,
        theme.fontColor,
        theme.fontFamily,
        primary,
        colors.slice(2),
      ) ===
      signature(preset.background, preset.ink, preset.body, preset.primary, preset.chartTail),
  )

  if (found) {
    return {
      id: found.id,
      colors: {
        background: found.background,
        surface: found.surface,
        ink: found.ink,
        muted: found.muted,
        mutedSurface: mix(found.ink, found.surface, PANEL_MUTED),
        primary: found.primary,
        accent,
        onPrimary: readableOn(found.primary, [found.background, found.ink]),
        onAccent: readableOn(accent, [found.background, found.ink]),
      },
      fonts: { display: found.display, body: found.body },
      scale: found.scale,
      radius: found.radius,
      rule: found.rule,
      density: found.density,
      gap: GAPS[found.density],
      chart: chartOf(found, accent),
    }
  }

  const background = theme.backgroundColor
  const ink = theme.fontColor
  // a step off the background rather than a colour of its own, so a card reads as a card
  // on a white deck and on a black one without either being special-cased
  const surface = mix(background, ink, 0.06)
  return {
    id: "custom",
    colors: {
      background,
      surface,
      ink,
      muted: mix(ink, background, 0.42),
      mutedSurface: mix(ink, surface, PANEL_MUTED),
      primary,
      accent,
      onPrimary: readableOn(primary, [background, ink]),
      onAccent: readableOn(accent, [background, ink]),
    },
    fonts: { display: theme.fontFamily, body: theme.fontFamily },
    scale: DEFAULT_SCALE,
    radius: 6,
    rule: 1.5,
    density: "regular",
    gap: GAPS.regular,
    chart: colors.length ? colors : [primary, accent],
  }
}
