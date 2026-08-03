import type { MessageKey } from "@/lib/i18n/messages"
import type { AnimationEffect, ChartType, DeckTheme, TransitionType } from "@/types/slides"

export const VIEWPORT_WIDTH = 1000
export const VIEWPORT_RATIO = 0.5625
export const VIEWPORT_HEIGHT = VIEWPORT_WIDTH * VIEWPORT_RATIO

export const MIN_ELEMENT_SIZE = 10
export const SNAP_THRESHOLD = 4

/**
 * What PowerPoint calls "single" line spacing, expressed as a CSS `line-height`
 * multiplier. PowerPoint measures spacing against the font's own default line box —
 * roughly 1.2x the type size — while CSS measures it against the type size itself, so
 * the two scales differ by exactly this factor. Import multiplies by it and export
 * divides by it; getting that pair wrong makes a deck's spacing drift 20% looser on
 * every round trip.
 */
export const SINGLE_LINE = 1.2

/**
 * Pickable typefaces. The CJK families carry a message key because their names are
 * themselves Chinese words — an English reader wants "SimSun", not 宋体 — while the Latin
 * families are proper nouns that read the same in both languages and stay literal.
 */
export const FONT_FAMILIES: { labelKey?: MessageKey; label?: string; value: string }[] = [
  { labelKey: "font.system", value: "system-ui, sans-serif" },
  { labelKey: "font.yahei", value: "'Microsoft YaHei', sans-serif" },
  { labelKey: "font.pingfang", value: "'PingFang SC', sans-serif" },
  { labelKey: "font.simsun", value: "SimSun, serif" },
  { labelKey: "font.simhei", value: "SimHei, sans-serif" },
  { labelKey: "font.kaiti", value: "KaiTi, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
]

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 54, 60, 72, 96]

export const PRESET_COLORS = [
  "#000000", "#404040", "#737373", "#a3a3a3", "#d4d4d4", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
]

export const DEFAULT_THEME: DeckTheme = {
  fontFamily: "system-ui, sans-serif",
  fontColor: "#111827",
  backgroundColor: "#ffffff",
  themeColors: ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2"],
}

export const TRANSITIONS: { value: TransitionType; labelKey: MessageKey }[] = [
  { value: "none", labelKey: "transition.none" },
  { value: "fade", labelKey: "transition.fade" },
  { value: "slideX", labelKey: "transition.slideX" },
  { value: "slideY", labelKey: "transition.slideY" },
  { value: "zoom", labelKey: "transition.zoom" },
]

export const ANIMATIONS: {
  value: AnimationEffect
  labelKey: MessageKey
  type: "in" | "out" | "attention"
}[] = [
  { value: "fadeIn", labelKey: "anim.fadeIn", type: "in" },
  { value: "slideInUp", labelKey: "anim.slideInUp", type: "in" },
  { value: "slideInDown", labelKey: "anim.slideInDown", type: "in" },
  { value: "slideInLeft", labelKey: "anim.slideInLeft", type: "in" },
  { value: "slideInRight", labelKey: "anim.slideInRight", type: "in" },
  { value: "zoomIn", labelKey: "anim.zoomIn", type: "in" },
  { value: "rotateIn", labelKey: "anim.rotateIn", type: "in" },
  { value: "fadeOut", labelKey: "anim.fadeOut", type: "out" },
  { value: "zoomOut", labelKey: "anim.zoomOut", type: "out" },
  { value: "pulse", labelKey: "anim.pulse", type: "attention" },
  { value: "shake", labelKey: "anim.shake", type: "attention" },
]

export const CHART_TYPES: { value: ChartType; labelKey: MessageKey }[] = [
  { value: "column", labelKey: "chart.column" },
  { value: "bar", labelKey: "chart.bar" },
  { value: "line", labelKey: "chart.line" },
  { value: "area", labelKey: "chart.area" },
  { value: "scatter", labelKey: "chart.scatter" },
  { value: "pie", labelKey: "chart.pie" },
  { value: "doughnut", labelKey: "chart.doughnut" },
  { value: "radar", labelKey: "chart.radar" },
]
