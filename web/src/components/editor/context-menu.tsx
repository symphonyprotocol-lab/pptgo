"use client"

import { useEffect, useRef } from "react"
import { useEditor } from "@/store/editor"
import { useT } from "@/lib/i18n/client"

interface Item {
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  run: () => void
}

/** Right-click menu on the canvas, positioned at the cursor inside the scaled wrapper. */
export function CanvasContextMenu({
  x,
  y,
  onClose,
}: {
  x: number
  y: number
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const activeIds = useEditor((s) => s.activeIds)
  const clipboard = useEditor((s) => s.clipboard)
  const slide = useEditor((s) => s.slides[Math.min(s.slideIndex, s.slides.length - 1)])

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const store = useEditor.getState
  const has = activeIds.length > 0
  const selected = slide.elements.filter((el) => activeIds.includes(el.id))
  const locked = selected.some((el) => el.lock)

  const groups: Item[][] = [
    [
      { label: t("menu.copy"), shortcut: "⌘C", disabled: !has, run: () => store().copy() },
      { label: t("menu.cut"), shortcut: "⌘X", disabled: !has, run: () => store().cut() },
      {
        label: t("menu.paste"),
        shortcut: "⌘V",
        disabled: !clipboard?.length,
        run: () => store().paste(),
      },
      {
        label: t("menu.duplicate"),
        shortcut: "⌘D",
        disabled: !has,
        run: () => {
          store().copy()
          store().paste()
        },
      },
    ],
    [
      {
        label: t("editor.bringToFront"),
        disabled: !has,
        run: () => store().reorder(activeIds, "front"),
      },
      {
        label: t("editor.sendToBack"),
        disabled: !has,
        run: () => store().reorder(activeIds, "back"),
      },
      {
        label: t("editor.bringForward"),
        disabled: !has,
        run: () => store().reorder(activeIds, "forward"),
      },
      {
        label: t("editor.sendBackward"),
        disabled: !has,
        run: () => store().reorder(activeIds, "backward"),
      },
    ],
    [
      {
        label: t("editor.group"),
        shortcut: "⌘G",
        disabled: activeIds.length < 2,
        run: () => store().groupElements(),
      },
      {
        label: t("editor.ungroup"),
        shortcut: "⌘⇧G",
        disabled: !selected.some((el) => el.groupId),
        run: () => store().ungroupElements(),
      },
      {
        label: locked ? t("menu.unlock") : t("menu.lock"),
        disabled: !has,
        run: () => store().toggleLock(activeIds, !locked),
      },
    ],
    [
      { label: t("editor.newSlide"), run: () => store().addSlide() },
      { label: t("menu.selectAll"), shortcut: "⌘A", run: () => store().setActiveIds(slide.elements.filter((el) => !el.lock).map((el) => el.id)) },
      {
        label: t("dashboard.delete"),
        shortcut: "Del",
        disabled: !has,
        danger: true,
        run: () => store().deleteElements(activeIds),
      },
    ],
  ]

  return (
    <div
      ref={ref}
      className="absolute z-50 w-44 overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {groups.map((group, gi) => (
        <div key={gi} className={gi ? "border-t pt-1 mt-1" : undefined}>
          {group.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                item.run()
                onClose()
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${
                item.danger ? "text-destructive" : ""
              }`}
            >
              {item.label}
              {item.shortcut && (
                <span className="text-[10px] text-muted-foreground">{item.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
