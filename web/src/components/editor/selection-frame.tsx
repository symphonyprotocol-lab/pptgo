"use client"

import type { ResizeHandle } from "@/lib/geometry"

const HANDLES: { key: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { key: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { key: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { key: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { key: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { key: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { key: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { key: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { key: "w", x: 0, y: 0.5, cursor: "ew-resize" },
]

interface Props {
  left: number
  top: number
  width: number
  height: number
  rotate: number
  scale: number
  resizable: boolean
  rotatable: boolean
  /** a locked selection shows its frame but offers no handles */
  locked?: boolean
  onResizeStart: (handle: ResizeHandle, event: React.PointerEvent) => void
  onRotateStart: (event: React.PointerEvent) => void
}

export function SelectionFrame({
  left,
  top,
  width,
  height,
  rotate,
  scale,
  resizable,
  rotatable,
  locked,
  onResizeStart,
  onRotateStart,
}: Props) {
  const size = 9 / scale
  const border = 1 / scale
  const accent = locked ? "#f59e0b" : "#2563eb"

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `${border}px solid ${accent}`,
        }}
      />
      {rotatable && (
        <div
          onPointerDown={onRotateStart}
          style={{
            position: "absolute",
            left: width / 2 - size / 2,
            top: -size * 3,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "#fff",
            border: `${border * 1.5}px solid ${accent}`,
            cursor: "grab",
            pointerEvents: "auto",
          }}
        />
      )}
      {resizable &&
        HANDLES.map((h) => (
          <div
            key={h.key}
            onPointerDown={(e) => onResizeStart(h.key, e)}
            style={{
              position: "absolute",
              left: width * h.x - size / 2,
              top: height * h.y - size / 2,
              width: size,
              height: size,
              background: "#fff",
              border: `${border * 1.5}px solid ${accent}`,
              cursor: h.cursor,
              pointerEvents: "auto",
            }}
          />
        ))}
    </div>
  )
}
