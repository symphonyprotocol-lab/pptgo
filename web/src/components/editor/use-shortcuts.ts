"use client"

import { useEffect } from "react"
import { createImageElement, createTextElement, newId } from "@/lib/factory"
import { escapeHtml } from "@/lib/sanitize"
import { useEditor } from "@/store/editor"
import type { SlideElement } from "@/types/slides"

/** Marker written alongside copied elements so a paste can tell our payload from stray text. */
const CLIPBOARD_TAG = "pptgo/elements"

/**
 * Whether a keystroke belongs to something the user is typing into, in which case the
 * editor's own shortcuts have to stay out of the way.
 *
 * The guard is `instanceof Element`, not a cast. An event target is only an element when
 * something focusable was focused — a key event dispatched at `document` or `window`
 * (browser extensions and automation both do this) arrives here as a target that has no
 * `closest`, and the old `as HTMLElement` assertion hid that from the type checker. The
 * result was a TypeError thrown on the first line of the key handler, which took every
 * shortcut for that keystroke down with it rather than just this check.
 *
 * A non-element target means nothing is being typed into, so the shortcuts should run.
 */
const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.closest("[data-editing-text]") !== null
  )
}

/** Mirrors the internal clipboard to the system one so elements survive a tab switch. */
function publishClipboard() {
  const elements = useEditor.getState().activeElements()
  if (!elements.length) return
  const payload = JSON.stringify({ [CLIPBOARD_TAG]: elements })
  void navigator.clipboard?.writeText(payload).catch(() => {})
}

export function useShortcuts(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const store = useEditor.getState()
      const mod = event.metaKey || event.ctrlKey
      const ids = store.activeIds

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault()
        store.redo()
        return
      }
      if (mod && event.key.toLowerCase() === "c") {
        store.copy()
        publishClipboard()
        return
      }
      if (mod && event.key.toLowerCase() === "x") {
        publishClipboard()
        store.cut()
        return
      }
      // paste is handled by the document `paste` listener so system content works too
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault()
        store.setActiveIds(store.currentSlide().elements.filter((el) => !el.lock).map((el) => el.id))
        return
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault()
        store.copy()
        store.paste()
        return
      }
      if (mod && event.key.toLowerCase() === "g") {
        event.preventDefault()
        if (event.shiftKey) store.ungroupElements()
        else store.groupElements()
        return
      }
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("pptgo:find"))
        return
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!ids.length) return
        event.preventDefault()
        store.deleteElements(ids)
        return
      }
      if (event.key === "Escape") {
        store.setActiveIds([])
        store.setCreating(null)
        return
      }

      if (event.key.startsWith("Arrow")) {
        event.preventDefault()
        if (!ids.length) {
          if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            store.setSlideIndex(store.slideIndex + 1)
          } else {
            store.setSlideIndex(store.slideIndex - 1)
          }
          return
        }
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0
        store.commit()
        const elements = store
          .currentSlide()
          .elements.filter((el) => ids.includes(el.id) && !el.lock)
        store.updateElements(
          elements.map((el) => ({ id: el.id, patch: { left: el.left + dx, top: el.top + dy } })),
        )
      }
    }

    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return
      const data = event.clipboardData
      if (!data) return
      const store = useEditor.getState()

      const image = Array.from(data.files).find((file) => file.type.startsWith("image/"))
      if (image) {
        event.preventDefault()
        const reader = new FileReader()
        reader.onload = () => {
          const src = String(reader.result)
          const probe = new Image()
          probe.onload = () => {
            const ratio = probe.width / probe.height
            const width = Math.min(probe.width, 600)
            store.addElement(createImageElement(src, width, width / ratio))
          }
          probe.src = src
        }
        reader.readAsDataURL(image)
        return
      }

      const text = data.getData("text/plain")
      if (!text) {
        // nothing usable on the system clipboard — fall back to the in-app one
        event.preventDefault()
        store.paste()
        return
      }

      const elements = parseElements(text)
      if (elements) {
        event.preventDefault()
        store.addElements(
          elements.map((el) => ({ ...el, id: newId(), left: el.left + 20, top: el.top + 20 })),
        )
        return
      }

      event.preventDefault()
      if (store.clipboard?.length) {
        store.paste()
        return
      }
      store.addElement(
        createTextElement({ content: escapeHtml(text.slice(0, 2000)), width: 420, height: 80 }),
      )
    }

    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("paste", onPaste)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("paste", onPaste)
    }
  }, [enabled])
}

function parseElements(text: string): SlideElement[] | null {
  if (!text.includes(CLIPBOARD_TAG)) return null
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const elements = parsed[CLIPBOARD_TAG]
    return Array.isArray(elements) && elements.length ? (elements as SlideElement[]) : null
  } catch {
    return null
  }
}
