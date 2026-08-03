import type { ElementAnimation } from "@/types/slides"

/**
 * Animations run in list order. A `click` animation opens a new step; `auto` ones ride along
 * with the step before them, which is how PowerPoint's "with previous" behaves.
 */
export function buildSteps(animations: ElementAnimation[] | undefined): ElementAnimation[][] {
  const steps: ElementAnimation[][] = []
  for (const animation of animations ?? []) {
    if (animation.trigger === "auto" && steps.length) steps[steps.length - 1].push(animation)
    else steps.push([animation])
  }
  return steps
}

export interface AnimationState {
  hidden: boolean
  effect?: string
  duration?: number
}

/**
 * Resolves how an element should look after `played` steps: still waiting to enter,
 * already gone, or showing the effect that ran most recently.
 */
export function animationStateOf(
  elementId: string,
  steps: ElementAnimation[][],
  played: number,
): AnimationState {
  const mine = steps.flatMap((step, index) => step.filter((a) => a.elId === elementId).map((a) => ({ a, index })))
  if (!mine.length) return { hidden: false }

  const entrance = mine.find((m) => m.a.type === "in")
  if (entrance && played <= entrance.index) return { hidden: true }

  const done = mine.filter((m) => played > m.index)
  if (!done.length) return { hidden: false }

  const last = done[done.length - 1]
  if (last.a.type === "out") return { hidden: true }
  // only animate on the step that just ran, so earlier elements sit still
  const isCurrent = last.index === played - 1
  return {
    hidden: false,
    effect: isCurrent ? last.a.effect : undefined,
    duration: last.a.duration,
  }
}

export const totalSteps = (animations: ElementAnimation[] | undefined) =>
  buildSteps(animations).length
