import { describe, expect, it } from "vitest"
import { animationStateOf, buildSteps, totalSteps } from "./animation"
import type { ElementAnimation } from "@/types/slides"

const animation = (
  id: string,
  elId: string,
  type: ElementAnimation["type"],
  trigger: ElementAnimation["trigger"] = "click",
): ElementAnimation => ({ id, elId, type, trigger, effect: "fadeIn", duration: 500 })

describe("buildSteps", () => {
  it("gives every click animation its own step", () => {
    const steps = buildSteps([animation("1", "a", "in"), animation("2", "b", "in")])
    expect(steps).toHaveLength(2)
  })

  it("folds auto animations into the preceding step", () => {
    const steps = buildSteps([
      animation("1", "a", "in"),
      animation("2", "b", "in", "auto"),
      animation("3", "c", "in"),
    ])
    expect(steps).toHaveLength(2)
    expect(steps[0]).toHaveLength(2)
  })

  it("starts a step even when the first animation is auto", () => {
    expect(buildSteps([animation("1", "a", "in", "auto")])).toHaveLength(1)
  })

  it("handles a missing list", () => {
    expect(buildSteps(undefined)).toEqual([])
    expect(totalSteps(undefined)).toBe(0)
  })
})

describe("animationStateOf", () => {
  const steps = buildSteps([animation("1", "a", "in"), animation("2", "a", "out")])

  it("leaves elements without animations visible", () => {
    expect(animationStateOf("z", steps, 0)).toEqual({ hidden: false })
  })

  it("hides an element until its entrance runs", () => {
    expect(animationStateOf("a", steps, 0).hidden).toBe(true)
  })

  it("shows and animates the element on the step that just ran", () => {
    const state = animationStateOf("a", steps, 1)
    expect(state.hidden).toBe(false)
    expect(state.effect).toBe("fadeIn")
  })

  it("hides it again once its exit has run", () => {
    expect(animationStateOf("a", steps, 2).hidden).toBe(true)
  })

  it("stops replaying an effect on later steps", () => {
    const later = buildSteps([animation("1", "a", "in"), animation("2", "b", "in")])
    expect(animationStateOf("a", later, 2).effect).toBeUndefined()
    expect(animationStateOf("a", later, 2).hidden).toBe(false)
  })
})
