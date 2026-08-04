"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { animationStateOf, buildSteps } from "@/lib/animation"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import type { Slide, SlideBackground, SlideElement } from "@/types/slides"
import { ElementBox } from "./element-view"

export function backgroundStyle(background: SlideBackground): CSSProperties {
  if (background.type === "image" && background.image) {
    return {
      backgroundColor: background.color,
      // the url is quoted, so any quote or backslash inside it has to be neutralised
      backgroundImage: `url("${background.image.replace(/["\\]/g, encodeURIComponent)}")`,
      backgroundSize:
        background.imageSize === "contain"
          ? "contain"
          : background.imageSize === "repeat"
            ? "auto"
            : "cover",
      backgroundRepeat: background.imageSize === "repeat" ? "repeat" : "no-repeat",
      backgroundPosition: "center",
    }
  }
  if (background.type === "gradient" && background.gradient) {
    const stops = background.gradient.stops.map((s) => `${s.color} ${s.pos}%`).join(", ")
    return {
      backgroundImage:
        background.gradient.type === "linear"
          ? `linear-gradient(${background.gradient.rotate}deg, ${stops})`
          : `radial-gradient(circle, ${stops})`,
    }
  }
  return { backgroundColor: background.color }
}

interface Props {
  slide: Slide
  /** how many animation steps have played — omit to show the finished slide */
  animationStep?: number
  /** turn media elements into real players (presentation view) */
  playable?: boolean
  /** makes element hyperlinks clickable; only the presentation view passes this */
  onFollowLink?: (link: NonNullable<SlideElement["link"]>) => void
}

/** Read-only render of a slide at 1:1 scale; callers apply a CSS transform. */
export function SlideView({ slide, animationStep, playable, onFollowLink }: Props) {
  const animated = animationStep !== undefined && !!slide.animations?.length
  const steps = animated ? buildSteps(slide.animations) : []

  return (
    <div
      style={{
        position: "relative",
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        overflow: "hidden",
        ...backgroundStyle(slide.background),
      }}
    >
      {slide.elements.map((el) => {
        if (!animated) {
          return (
            <ElementBox
              key={el.id}
              element={el}
              playable={playable}
              onFollowLink={onFollowLink}
            />
          )
        }
        const state = animationStateOf(el.id, steps, animationStep!)
        return (
          <ElementBox
            key={el.id}
            element={el}
            playable={playable}
            onFollowLink={onFollowLink}
            style={{
              visibility: state.hidden ? "hidden" : "visible",
              animationName: state.effect,
              animationDuration: state.duration ? `${state.duration}ms` : undefined,
              animationFillMode: "both",
              animationTimingFunction: "ease-out",
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * A slide at thumbnail size, drawn by scaling the real renderer so a preview can never
 * disagree with the canvas about how a deck looks.
 *
 * Leave `width` out and it fills the box it is given, measuring itself to work out the
 * scale. That is what a rail wants: its width is not one number — a fixed sidebar on a
 * wide screen, a drawer on a narrow one — so a thumbnail pinned to a constant sat inside
 * a card that was wider than it was, showing a strip of the card's own white down one
 * side of every slide.
 */
export function SlideThumbnail({ slide, width }: { slide: Slide; width?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(0)

  useEffect(() => {
    const node = box.current
    if (width !== undefined || !node) return
    setMeasured(node.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setMeasured(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [width])

  const rendered = width ?? measured
  return (
    <div
      ref={box}
      style={{
        width: width ?? "100%",
        // the ratio rather than a computed height, so the box is already the right shape
        // on the render before it has been measured
        aspectRatio: `${VIEWPORT_WIDTH} / ${VIEWPORT_HEIGHT}`,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{ transform: `scale(${rendered / VIEWPORT_WIDTH})`, transformOrigin: "0 0" }}
      >
        <SlideView slide={slide} />
      </div>
    </div>
  )
}
