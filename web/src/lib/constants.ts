import type { AnimationEffect, DeckTheme, TransitionType } from "@/types/slides"

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

export const FONT_FAMILIES = [
  { label: "系统默认", value: "system-ui, sans-serif" },
  { label: "微软雅黑", value: "'Microsoft YaHei', sans-serif" },
  { label: "苹方", value: "'PingFang SC', sans-serif" },
  { label: "宋体", value: "SimSun, serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "楷体", value: "KaiTi, serif" },
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

export const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "none", label: "无" },
  { value: "fade", label: "淡入淡出" },
  { value: "slideX", label: "左右滑动" },
  { value: "slideY", label: "上下滑动" },
  { value: "zoom", label: "缩放" },
]

export const ANIMATIONS: { value: AnimationEffect; label: string; type: "in" | "out" | "attention" }[] = [
  { value: "fadeIn", label: "淡入", type: "in" },
  { value: "slideInUp", label: "上滑进入", type: "in" },
  { value: "slideInDown", label: "下滑进入", type: "in" },
  { value: "slideInLeft", label: "左滑进入", type: "in" },
  { value: "slideInRight", label: "右滑进入", type: "in" },
  { value: "zoomIn", label: "放大进入", type: "in" },
  { value: "rotateIn", label: "旋转进入", type: "in" },
  { value: "fadeOut", label: "淡出", type: "out" },
  { value: "zoomOut", label: "缩小退出", type: "out" },
  { value: "pulse", label: "强调脉冲", type: "attention" },
  { value: "shake", label: "强调抖动", type: "attention" },
]

export const CHART_TYPES = [
  { value: "column", label: "柱状图" },
  { value: "bar", label: "条形图" },
  { value: "line", label: "折线图" },
  { value: "area", label: "面积图" },
  { value: "scatter", label: "散点图" },
  { value: "pie", label: "饼图" },
  { value: "doughnut", label: "环形图" },
  { value: "radar", label: "雷达图" },
] as const
