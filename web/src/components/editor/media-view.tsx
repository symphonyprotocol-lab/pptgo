"use client"

import { useMemo } from "react"
import { Music, Play } from "lucide-react"
import { renderFormula } from "@/lib/formula"
import type { FormulaElement, MediaElement } from "@/types/slides"

/**
 * On the editing canvas media is a still preview — a live `<video>` would swallow the
 * pointer events the canvas needs for selection and dragging. `playable` switches it to
 * a real player for the presentation view.
 */
export function MediaView({ el, playable = false }: { el: MediaElement; playable?: boolean }) {
  if (el.type === "audio") {
    return playable ? (
      <audio
        src={el.src}
        controls
        autoPlay={el.autoplay}
        loop={el.loop}
        style={{ width: "100%" }}
      />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          boxSizing: "border-box",
          borderRadius: 999,
          background: "rgba(15, 23, 42, 0.85)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <Music style={{ width: 20, height: 20, flexShrink: 0 }} />
        <span style={{ fontSize: 13, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
          {el.name}
        </span>
      </div>
    )
  }

  if (playable) {
    return (
      <video
        src={el.src}
        poster={el.poster}
        controls
        autoPlay={el.autoplay}
        loop={el.loop}
        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
      />
    )
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: el.poster ? `center / cover no-repeat url("${el.poster}")` : "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Play style={{ width: 22, height: 22, color: "#0f172a" }} />
      </div>
    </div>
  )
}

export function FormulaView({ el }: { el: FormulaElement }) {
  const html = useMemo(() => renderFormula(el.latex), [el.latex])
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: el.color,
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
