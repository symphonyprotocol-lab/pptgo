/**
 * Draws an SVG document onto a canvas and hands back a PNG data URI.
 * Returns null wherever the browser cannot rasterise, so callers can fall back.
 */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  scale = 3,
): Promise<string | null> {
  if (typeof document === "undefined") return null

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  try {
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()

    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    ctx.scale(scale, scale)
    ctx.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}

/** Wraps arbitrary XHTML in an SVG `foreignObject` so it can go through `svgToPng`. */
export function wrapForeignObject(xhtml: string, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject>` +
    `</svg>`
  )
}
