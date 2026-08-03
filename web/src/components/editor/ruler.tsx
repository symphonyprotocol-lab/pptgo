"use client"

import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"

const STEP = 50
const SIZE = 18

/** Rulers sit just outside the canvas and are drawn in screen pixels, so they stay legible at any zoom. */
export function Ruler({ scale }: { scale: number }) {
  const xTicks = Array.from({ length: Math.floor(VIEWPORT_WIDTH / STEP) + 1 }, (_, i) => i * STEP)
  const yTicks = Array.from({ length: Math.floor(VIEWPORT_HEIGHT / STEP) + 1 }, (_, i) => i * STEP)

  return (
    <>
      <div
        className="pointer-events-none absolute border-b border-border/70 bg-background/80 text-[9px] text-muted-foreground"
        style={{ left: 0, top: -SIZE, width: VIEWPORT_WIDTH * scale, height: SIZE }}
      >
        {xTicks.map((tick) => (
          <span
            key={tick}
            className="absolute bottom-0 border-l border-border/70 pl-0.5 leading-none"
            style={{ left: tick * scale, height: tick % (STEP * 2) === 0 ? 10 : 5 }}
          >
            {tick % (STEP * 2) === 0 ? tick : ""}
          </span>
        ))}
      </div>
      <div
        className="pointer-events-none absolute border-r border-border/70 bg-background/80 text-[9px] text-muted-foreground"
        style={{ left: -SIZE, top: 0, width: SIZE, height: VIEWPORT_HEIGHT * scale }}
      >
        {yTicks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 border-t border-border/70 leading-none"
            style={{ top: tick * scale, width: tick % (STEP * 2) === 0 ? 10 : 5 }}
          >
            {tick % (STEP * 2) === 0 ? (
              <span className="absolute -top-0.5 right-2.5">{tick}</span>
            ) : null}
          </span>
        ))}
      </div>
    </>
  )
}
