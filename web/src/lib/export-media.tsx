"use client"

import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { SlideView } from "@/components/editor/slide-view"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants"
import { triggerDownload } from "./export"
import type { Deck, Slide } from "@/types/slides"

/**
 * Renders a slide off-screen with the same components the canvas uses, then hands back the
 * serialised node. XML serialisation (rather than `innerHTML`) keeps the markup well-formed
 * so it can be embedded in an SVG `foreignObject`.
 */
function renderSlide(slide: Slide): { html: string; xml: string } {
  const host = document.createElement("div")
  host.setAttribute("style", "position:fixed;left:-99999px;top:0;pointer-events:none;")
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<SlideView slide={slide} />))
    const node = host.firstElementChild
    const html = host.innerHTML
    const xml = node ? new XMLSerializer().serializeToString(node) : ""
    return { html, xml }
  } finally {
    root.unmount()
    host.remove()
  }
}

export async function slideToBlob(slide: Slide, scale: number): Promise<Blob | null> {
  const { xml } = renderSlide(slide)
  if (!xml) return null

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWPORT_WIDTH}" height="${VIEWPORT_HEIGHT}">` +
    `<foreignObject x="0" y="0" width="${VIEWPORT_WIDTH}" height="${VIEWPORT_HEIGHT}">${xml}</foreignObject>` +
    `</svg>`

  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()

  const canvas = document.createElement("canvas")
  canvas.width = VIEWPORT_WIDTH * scale
  canvas.height = VIEWPORT_HEIGHT * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0)

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
}

/** One PNG per slide, zipped when there is more than one. */
export async function exportImages(deck: Deck, scale = 2) {
  const blobs: { name: string; blob: Blob }[] = []
  for (const [index, slide] of deck.slides.entries()) {
    const blob = await slideToBlob(slide, scale)
    if (blob) blobs.push({ name: `${String(index + 1).padStart(2, "0")}.png`, blob })
  }
  if (!blobs.length) throw new Error("没有可导出的幻灯片")

  const base = deck.title || "deck"
  if (blobs.length === 1) {
    triggerDownload(blobs[0].blob, `${base}.png`)
    return
  }

  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const { name, blob } of blobs) zip.file(name, blob)
  triggerDownload(await zip.generateAsync({ type: "blob" }), `${base}.zip`)
}

/**
 * Print-to-PDF, the same route PPTist takes: lay every slide out at exact page size in a
 * hidden iframe and hand it to the browser's print dialog, where "Save as PDF" lives.
 */
export async function exportPdf(deck: Deck) {
  const pages = deck.slides
    .map((slide) => `<section class="page">${renderSlide(slide).html}</section>`)
    .join("")

  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeText(
    deck.title || "deck",
  )}</title><style>
    @page { size: ${VIEWPORT_WIDTH}px ${VIEWPORT_HEIGHT}px; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff }
    .page {
      width: ${VIEWPORT_WIDTH}px; height: ${VIEWPORT_HEIGHT}px;
      position: relative; overflow: hidden; break-after: page; page-break-after: always;
    }
    .page:last-child { break-after: auto; page-break-after: auto }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
  </style></head><body>${pages}</body></html>`

  const frame = document.createElement("iframe")
  frame.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0;")
  document.body.appendChild(frame)

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve()
    frame.srcdoc = doc
  })
  // let images inside the frame settle before the print snapshot is taken
  await new Promise((resolve) => setTimeout(resolve, 300))

  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  setTimeout(() => frame.remove(), 60_000)
}

function escapeText(text: string) {
  return text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)
}
