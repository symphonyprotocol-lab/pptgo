"use client"

import type { CSSProperties } from "react"
import { animationStateOf, buildSteps } from "@/lib/animation"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import type { Slide, SlideBackground } from "@/types/slides"
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
}

/** Read-only render of a slide at 1:1 scale; callers apply a CSS transform. */
export function SlideView({ slide, animationStep, playable }: Props) {
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
        if (!animated) return <ElementBox key={el.id} element={el} playable={playable} />
        const state = animationStateOf(el.id, steps, animationStep!)
        return (
          <ElementBox
            key={el.id}
            element={el}
            playable={playable}
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

export function SlideThumbnail({ slide, width }: { slide: Slide; width: number }) {
  const scale = width / VIEWPORT_WIDTH
  return (
    <div
      style={{
        width,
        height: width * (VIEWPORT_HEIGHT / VIEWPORT_WIDTH),
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SlideView slide={slide} />
      </div>
    </div>
  )
}
