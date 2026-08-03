import type { ImageElement } from "@/types/slides"

const NEUTRAL = { blur: 0, brightness: 100, contrast: 100, grayscale: 0, saturate: 100, sepia: 0 }

export function filterCss(filter: ImageElement["filter"]): string {
  return (
    `blur(${filter.blur}px) brightness(${filter.brightness}%) contrast(${filter.contrast}%) ` +
    `grayscale(${filter.grayscale}%) saturate(${filter.saturate}%) sepia(${filter.sepia}%)`
  )
}

export const hasFilter = (filter: ImageElement["filter"]) =>
  (Object.keys(NEUTRAL) as (keyof typeof NEUTRAL)[]).some((key) => filter[key] !== NEUTRAL[key])

/** True when the editor shows something OOXML has no way to express on its own. */
export function needsBaking(el: ImageElement): boolean {
  return hasFilter(el.filter) || !!el.colorMask || el.radius > 0
}

/**
 * OOXML carries no CSS filters, colour masks or corner radii, so the visible result is
 * rendered onto a canvas and the flattened PNG is exported instead. Falls back to the
 * original source whenever canvas is unavailable or the image cannot be read.
 */
export async function bakeImage(el: ImageElement): Promise<string> {
  if (!needsBaking(el)) return el.src
  if (typeof document === "undefined") return el.src

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  // no 2d backend (jsdom) or no filter support — nothing to gain from decoding the image
  if (!ctx || !("filter" in ctx)) return el.src

  try {
    const image = await loadImage(el.src)
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    if (!canvas.width || !canvas.height) return el.src

    if (el.radius > 0) {
      // the radius is authored against the element box, so scale it into source pixels
      const scale = Math.min(canvas.width / Math.max(1, el.width), canvas.height / Math.max(1, el.height))
      roundedPath(ctx, canvas.width, canvas.height, el.radius * scale)
      ctx.clip()
    }

    ctx.filter = hasFilter(el.filter) ? filterCss(el.filter) : "none"
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    if (el.colorMask) {
      ctx.filter = "none"
      // `color` keeps the source luminance and takes the hue from the mask, matching CSS
      ctx.globalCompositeOperation = "color"
      ctx.fillStyle = el.colorMask
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = "source-over"
    }

    return canvas.toDataURL("image/png")
  } catch {
    return el.src
  }
}

function roundedPath(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(width - r, 0)
  ctx.quadraticCurveTo(width, 0, width, r)
  ctx.lineTo(width, height - r)
  ctx.quadraticCurveTo(width, height, width - r, height)
  ctx.lineTo(r, height)
  ctx.quadraticCurveTo(0, height, 0, height - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
}

const LOAD_TIMEOUT = 10_000

/**
 * A source that neither loads nor errors would otherwise stall the whole export, so the
 * wait is bounded and the caller falls back to the original bitmap.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // remote sources would otherwise taint the canvas and block toDataURL
    if (!src.startsWith("data:")) image.crossOrigin = "anonymous"

    const timer = setTimeout(() => reject(new Error("图片读取超时")), LOAD_TIMEOUT)
    const settle = (fn: () => void) => {
      clearTimeout(timer)
      fn()
    }
    image.onload = () => settle(() => resolve(image))
    image.onerror = () => settle(() => reject(new Error("图片读取失败")))
    image.src = src
  })
}
