import { describe, expect, it } from "vitest"
import { parsePath } from "./svg-path"
import { custGeomXml } from "./ooxml-geometry"
import { SHAPE_LIST } from "./shapes"

const types = (d: string) => parsePath(d)?.map((s) => s.type)

describe("parsePath", () => {
  it("reads absolute commands", () => {
    expect(parsePath("M 10 20 L 30 40 Z")).toEqual([
      { type: "M", points: [10, 20] },
      { type: "L", points: [30, 40] },
      { type: "Z" },
    ])
  })

  it("resolves relative commands against the pen", () => {
    expect(parsePath("m 10 10 l 5 0 l 0 5")).toEqual([
      { type: "M", points: [10, 10] },
      { type: "L", points: [15, 10] },
      { type: "L", points: [15, 15] },
    ])
  })

  it("treats a repeated coordinate set after a moveto as a lineto", () => {
    expect(types("M 0 0 10 0 20 0")).toEqual(["M", "L", "L"])
  })

  it("carries the axis through a horizontal or vertical line", () => {
    expect(parsePath("M 5 5 H 20 V 30")).toEqual([
      { type: "M", points: [5, 5] },
      { type: "L", points: [20, 5] },
      { type: "L", points: [20, 30] },
    ])
  })

  it("reflects the previous control point for a smooth curve", () => {
    const segments = parsePath("M 0 0 C 10 10 20 10 30 0 S 40 -10 50 0")
    // the reflected control is the previous second control mirrored through the endpoint
    expect(segments?.[2]).toEqual({ type: "C", points: [40, -10, 40, -10, 50, 0] })
  })

  it("starts a smooth curve at the current point when the previous curve was the wrong kind", () => {
    // T reflects a quadratic, so after a cubic it has nothing to mirror
    const segments = parsePath("M 0 0 C 10 10 20 10 30 0 T 50 0")
    expect(segments?.[2]).toEqual({ type: "Q", points: [30, 0, 50, 0] })
  })

  it("reads arc flags written with no separator", () => {
    // `0130 40` is two flags and the start of a coordinate, not one number, so the arc
    // must end where a separated spelling of the same command ends
    const packed = parsePath("M 0 0 a 20 20 0 0130 40")
    expect(packed).toEqual(parsePath("M 0 0 a 20 20 0 0 1 30 40"))
    const last = packed?.[packed.length - 1]
    expect((last as { points: number[] }).points.slice(-2)).toEqual([30, 40])
  })

  it("turns an arc into curves that land on its endpoint", () => {
    const segments = parsePath("M 0 100 A 100 100 0 0 1 200 100")
    const last = segments?.[segments.length - 1]
    expect(last?.type).toBe("C")
    const [x, y] = (last as { points: number[] }).points.slice(-2)
    expect(x).toBeCloseTo(200, 6)
    expect(y).toBeCloseTo(100, 6)
  })

  it("cuts a half turn into more than one curve", () => {
    // a single cubic cannot hold 180 degrees of an ellipse to any useful accuracy
    expect(types("M 0 100 A 100 100 0 0 1 200 100")).toEqual(["M", "C", "C"])
  })

  it("collapses a zero radius to a straight line, as the specification requires", () => {
    // a cubic whose controls sit on its own endpoints draws as a segment
    expect(parsePath("M 0 0 A 0 0 0 0 1 50 50")).toEqual([
      { type: "M", points: [0, 0] },
      { type: "C", points: [0, 0, 50, 50, 50, 50] },
    ])
  })

  it("returns nothing it cannot convert faithfully", () => {
    expect(parsePath("")).toBeNull()
    // no opening moveto, so the contour has no stated starting point
    expect(parsePath("L 10 10")).toBeNull()
    expect(parsePath("M 0 0 X 5 5")).toBeNull()
    expect(parsePath("M 0 0 L 10")).toBeNull()
  })
})

describe("custGeomXml", () => {
  it("scales coordinates up so the integers OOXML wants keep their precision", () => {
    const xml = custGeomXml("M 0.5 1.25 L 199 200", 200, { filled: true })
    expect(xml).toContain('<a:path w="20000" h="20000"')
    expect(xml).toContain('<a:pt x="50" y="125"/>')
  })

  it("marks an unfilled path so PowerPoint does not close it over", () => {
    expect(custGeomXml("M 0 0 L 10 10", 200, { filled: false })).toContain('fill="none"')
    expect(custGeomXml("M 0 0 L 10 10", 200, { filled: true })).not.toContain('fill="none"')
  })

  it("refuses a path that does not begin at a stated point", () => {
    expect(custGeomXml("L 10 10", 200, { filled: true })).toBeNull()
  })
})

describe("the shape registry", () => {
  it("gives every shape its own key and its own preset", () => {
    expect(new Set(SHAPE_LIST.map((s) => s.key)).size).toBe(SHAPE_LIST.length)
    expect(new Set(SHAPE_LIST.map((s) => s.preset)).size).toBe(SHAPE_LIST.length)
  })

  // Every preset path is also what the editor paints and what the palette shows, so one
  // that will not parse is a shape drawn wrong on screen as well as one exported wrong.
  it("draws every shape with a path that parses", () => {
    for (const shape of SHAPE_LIST) {
      expect(parsePath(shape.path), shape.key).not.toBeNull()
    }
  })

  /**
   * The box is the whole of what gets drawn: the renderer stretches `0..viewBox` over the
   * element, so a contour that strays outside is clipped flat against the edge. Sampling
   * rather than checking the raw numbers, because a curve's control points sit outside the
   * curve quite legitimately — an arc's handles always do.
   */
  it("keeps every shape inside its own box", () => {
    for (const shape of SHAPE_LIST) {
      let pen: [number, number] = [0, 0]
      for (const segment of parsePath(shape.path) ?? []) {
        if (segment.type === "Z") continue
        for (const [x, y] of samples(pen, segment.points)) {
          expect(Math.min(x, y), `${shape.key}`).toBeGreaterThanOrEqual(-0.5)
          expect(Math.max(x, y), `${shape.key}`).toBeLessThanOrEqual(shape.viewBox + 0.5)
        }
        pen = segment.points.slice(-2) as [number, number]
      }
    }
  })
})

/** Points along one segment, including both ends. */
function samples(from: [number, number], points: number[]): [number, number][] {
  if (points.length <= 2) return [from, points as [number, number]]
  const stops: [number, number][] = []
  const controls = [from, ...chunk(points)]
  for (let step = 0; step <= 20; step += 1) {
    stops.push(deCasteljau(controls, step / 20))
  }
  return stops
}

const chunk = (points: number[]): [number, number][] =>
  points.reduce<[number, number][]>(
    (out, _, i) => (i % 2 ? out : [...out, [points[i], points[i + 1]]]),
    [],
  )

/** Repeated linear interpolation, which lands on the point a bézier draws at `t`. */
function deCasteljau(points: [number, number][], t: number): [number, number] {
  let current = points
  while (current.length > 1) {
    current = current.slice(1).map((point, i): [number, number] => [
      current[i][0] + (point[0] - current[i][0]) * t,
      current[i][1] + (point[1] - current[i][1]) * t,
    ])
  }
  return current[0]
}
