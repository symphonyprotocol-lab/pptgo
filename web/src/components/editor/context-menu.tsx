"use client"

import { useEffect, useRef } from "react"
import { useEditor } from "@/store/editor"

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
      { label: "复制", shortcut: "⌘C", disabled: !has, run: () => store().copy() },
      { label: "剪切", shortcut: "⌘X", disabled: !has, run: () => store().cut() },
      { label: "粘贴", shortcut: "⌘V", disabled: !clipboard?.length, run: () => store().paste() },
      {
        label: "创建副本",
        shortcut: "⌘D",
        disabled: !has,
        run: () => {
          store().copy()
          store().paste()
        },
      },
    ],
    [
      { label: "置于顶层", disabled: !has, run: () => store().reorder(activeIds, "front") },
      { label: "置于底层", disabled: !has, run: () => store().reorder(activeIds, "back") },
      { label: "上移一层", disabled: !has, run: () => store().reorder(activeIds, "forward") },
      { label: "下移一层", disabled: !has, run: () => store().reorder(activeIds, "backward") },
    ],
    [
      {
        label: "组合",
        shortcut: "⌘G",
        disabled: activeIds.length < 2,
        run: () => store().groupElements(),
      },
      {
        label: "取消组合",
        shortcut: "⌘⇧G",
        disabled: !selected.some((el) => el.groupId),
        run: () => store().ungroupElements(),
      },
      {
        label: locked ? "解锁" : "锁定",
        disabled: !has,
        run: () => store().toggleLock(activeIds, !locked),
      },
    ],
    [
      { label: "新建幻灯片", run: () => store().addSlide() },
      { label: "全选", shortcut: "⌘A", run: () => store().setActiveIds(slide.elements.filter((el) => !el.lock).map((el) => el.id)) },
      {
        label: "删除",
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
