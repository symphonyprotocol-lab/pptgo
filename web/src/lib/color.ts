import { VIEWPORT_WIDTH } from "./constants"
import type { Gradient } from "@/types/slides"

/** 1000 canvas units span a 10in slide. */
export const UNIT_TO_INCH = 10 / VIEWPORT_WIDTH
export const UNIT_TO_PT = 72 * UNIT_TO_INCH

const NAMED: Record<string, string> = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  transparent: "FFFFFF",
}

/**
 * OOXML wants a bare six-digit hex. Editor colours are normally `#rrggbb`, but imported
 * decks and CSS-derived values can be `#rgb`, `rgb()`, `rgba()` or a colour keyword.
 */
export function toHex(color: string | undefined, fallback = "000000"): string {
  if (!color) return fallback
  const value = color.trim().toLowerCase()

  if (NAMED[value]) return NAMED[value]

  if (value.startsWith("#")) {
    const digits = value.slice(1)
    if (digits.length === 3 || digits.length === 4) {
      return digits
        .slice(0, 3)
        .split("")
        .map((d) => d + d)
        .join("")
        .toUpperCase()
    }
    if (digits.length >= 6) return digits.slice(0, 6).toUpperCase()
    return fallback
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)/)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return parts
        .slice(0, 3)
        .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
    }
  }

  if (/^[0-9a-f]{6}$/.test(value)) return value.toUpperCase()
  return fallback
}

/** Alpha channel of an `rgba()` / `#rrggbbaa` colour, 1 when opaque. */
export function alphaOf(color: string | undefined): number {
  if (!color) return 1
  const value = color.trim().toLowerCase()
  if (value === "transparent") return 0
  const rgba = value.match(/^rgba\(([^)]+)\)/)
  if (rgba) {
    const parts = rgba[1].split(/[\s,/]+/).filter(Boolean)
    const alpha = Number(parts[3])
    return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  }
  if (value.startsWith("#") && value.length === 9) {
    return parseInt(value.slice(7, 9), 16) / 255
  }
  return 1
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

/**
 * PowerPoint gradients are not expressible through pptxgenjs, which only emits solid fills.
 * Rather than rasterise the shape and lose editability, export the gradient's average
 * colour — the shape stays a native, recolourable shape in PowerPoint.
 */
export function flattenGradient(gradient: Gradient, fallback = "FFFFFF"): string {
  const stops = gradient.stops?.filter(Boolean) ?? []
  if (!stops.length) return fallback
  const sums = [0, 0, 0]
  for (const stop of stops) {
    const [r, g, b] = channels(toHex(stop.color, fallback))
    sums[0] += r
    sums[1] += g
    sums[2] += b
  }
  return sums
    .map((sum) => Math.round(sum / stops.length).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

export const inch = (value: number) => +(value * UNIT_TO_INCH).toFixed(4)
export const pt = (value: number) => Math.max(1, Math.round(value * UNIT_TO_PT))
/** pptxgenjs takes transparency as a 0–100 percentage, the inverse of CSS opacity. */
export const transparency = (opacity: number | undefined) =>
  opacity === undefined || opacity >= 1 ? undefined : Math.round((1 - Math.max(0, opacity)) * 100)
