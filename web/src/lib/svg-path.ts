/**
 * SVG path data reduced to the four things OOXML custom geometry can say: move, line,
 * quadratic and cubic. Everything else in the grammar is shorthand for one of those —
 * `H`/`V` are lines with an axis carried over, `S`/`T` are curves with a reflected control
 * point, and an elliptical arc is a handful of cubics once its centre is recovered.
 *
 * Relative commands, repeated coordinate sets after a single letter and the compressed
 * arc-flag spelling (`a24 24 0 0124 24`) all appear in real path data, so the reader is a
 * scanner rather than a split on whitespace.
 */

export type PathSegment =
  | { type: "M" | "L"; points: [number, number] }
  | { type: "Q"; points: [number, number, number, number] }
  | { type: "C"; points: [number, number, number, number, number, number] }
  | { type: "Z" }

const isSpace = (c: string) => c === " " || c === "," || c === "\t" || c === "\n" || c === "\r"

function scanner(d: string) {
  let i = 0
  const skip = () => {
    while (i < d.length && isSpace(d[i])) i += 1
  }
  return {
    done() {
      skip()
      return i >= d.length
    },
    /** the next command letter, without consuming it */
    peek() {
      skip()
      const c = d[i]
      return c && /[A-Za-z]/.test(c) ? c : null
    },
    take() {
      skip()
      return d[i++]
    },
    number(): number | null {
      skip()
      const match = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i))
      if (!match) return null
      i += match[0].length
      return Number(match[0])
    },
    /**
     * Arc flags are single characters and may be written with nothing between them and
     * the next number, so they cannot go through `number()` — `0124 24` is three
     * arguments, not one.
     */
    flag(): number | null {
      skip()
      const c = d[i]
      if (c !== "0" && c !== "1") return null
      i += 1
      return Number(c)
    },
  }
}

/**
 * Absolute segments, or `null` when the data is not something we can faithfully convert —
 * the caller then falls back to rasterising rather than exporting a wrong shape.
 */
export function parsePath(d: string): PathSegment[] | null {
  const scan = scanner(d)
  const out: PathSegment[] = []

  let x = 0
  let y = 0
  /** where the current subpath began, which is where `Z` returns to */
  let startX = 0
  let startY = 0
  /**
   * The previous curve's last control point, which `S` and `T` reflect through the current
   * point. Each only reflects its own kind of curve — a `T` after a cubic starts from the
   * current point instead — so the kind is carried along with it.
   */
  let lastControl: [number, number] | null = null
  let lastCurve: "C" | "Q" | null = null
  let command = ""

  const reflected = (kind: "C" | "Q"): [number, number] =>
    lastControl && lastCurve === kind ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y]

  const nums = (count: number): number[] | null => {
    const values: number[] = []
    for (let n = 0; n < count; n += 1) {
      const value = scan.number()
      if (value === null) return null
      values.push(value)
    }
    return values
  }

  // a path that does not open with a moveto has no stated starting point, and guessing the
  // origin would place the whole contour somewhere it was never drawn
  if (scan.peek()?.toUpperCase() !== "M") return null

  while (!scan.done()) {
    const next = scan.peek()
    if (next) {
      command = scan.take()
    } else if (!command) {
      return null
    } else if (command === "M") {
      // a repeated coordinate set after a moveto is a lineto, per the grammar
      command = "L"
    } else if (command === "m") {
      command = "l"
    }

    const relative = command === command.toLowerCase()
    const upper = command.toUpperCase()
    const dx = relative ? x : 0
    const dy = relative ? y : 0

    switch (upper) {
      case "Z":
        out.push({ type: "Z" })
        x = startX
        y = startY
        lastControl = null
        lastCurve = null
        break

      case "M": {
        const v = nums(2)
        if (!v) return null
        x = v[0] + dx
        y = v[1] + dy
        startX = x
        startY = y
        lastControl = null
        lastCurve = null
        out.push({ type: "M", points: [x, y] })
        break
      }

      case "L": {
        const v = nums(2)
        if (!v) return null
        x = v[0] + dx
        y = v[1] + dy
        lastControl = null
        lastCurve = null
        out.push({ type: "L", points: [x, y] })
        break
      }

      case "H": {
        const v = nums(1)
        if (!v) return null
        x = v[0] + dx
        lastControl = null
        lastCurve = null
        out.push({ type: "L", points: [x, y] })
        break
      }

      case "V": {
        const v = nums(1)
        if (!v) return null
        y = v[0] + dy
        lastControl = null
        lastCurve = null
        out.push({ type: "L", points: [x, y] })
        break
      }

      case "C": {
        const v = nums(6)
        if (!v) return null
        const points: [number, number, number, number, number, number] = [
          v[0] + dx, v[1] + dy, v[2] + dx, v[3] + dy, v[4] + dx, v[5] + dy,
        ]
        lastControl = [points[2], points[3]]
        lastCurve = "C"
        x = points[4]
        y = points[5]
        out.push({ type: "C", points })
        break
      }

      case "S": {
        const v = nums(4)
        if (!v) return null
        const [cx, cy] = reflected("C")
        const points: [number, number, number, number, number, number] = [
          cx, cy, v[0] + dx, v[1] + dy, v[2] + dx, v[3] + dy,
        ]
        lastControl = [points[2], points[3]]
        lastCurve = "C"
        x = points[4]
        y = points[5]
        out.push({ type: "C", points })
        break
      }

      case "Q": {
        const v = nums(4)
        if (!v) return null
        const points: [number, number, number, number] = [v[0] + dx, v[1] + dy, v[2] + dx, v[3] + dy]
        lastControl = [points[0], points[1]]
        lastCurve = "Q"
        x = points[2]
        y = points[3]
        out.push({ type: "Q", points })
        break
      }

      case "T": {
        const v = nums(2)
        if (!v) return null
        const [cx, cy] = reflected("Q")
        const points: [number, number, number, number] = [cx, cy, v[0] + dx, v[1] + dy]
        lastControl = [cx, cy]
        lastCurve = "Q"
        x = points[2]
        y = points[3]
        out.push({ type: "Q", points })
        break
      }

      case "A": {
        const radii = nums(3)
        const largeArc = scan.flag()
        const sweep = scan.flag()
        const end = nums(2)
        if (!radii || largeArc === null || sweep === null || !end) return null
        const ex = end[0] + dx
        const ey = end[1] + dy
        for (const curve of arcToCurves(x, y, radii[0], radii[1], radii[2], largeArc, sweep, ex, ey)) {
          out.push({ type: "C", points: curve })
        }
        x = ex
        y = ey
        lastControl = null
        lastCurve = null
        break
      }

      default:
        return null
    }
  }

  return out.length ? out : null
}

type Cubic = [number, number, number, number, number, number]

/**
 * An elliptical arc as cubics. OOXML has an `a:arcTo` of its own, but it takes no rotation
 * for the ellipse's axes, so anything with `x-axis-rotation` would come out wrong; cubics
 * carry every arc the same way and are within a fraction of a unit of the true curve once
 * the sweep is cut into quarter turns.
 *
 * The centre parameterisation follows the conversion in the SVG specification's
 * implementation notes.
 */
function arcToCurves(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Cubic[] {
  // a degenerate radius is defined to collapse to a straight line
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]]

  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)

  const mx = (x1 - x2) / 2
  const my = (y1 - y2) / 2
  const x1p = cos * mx + sin * my
  const y1p = -sin * mx + cos * my

  // radii too small to reach the endpoint are scaled up until they just do
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }

  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const numerator = rx * rx * ry * ry - denominator
  const factor = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (factor * rx * y1p) / ry
  const cyp = (-factor * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2

  const angleOf = (ux: number, uy: number) => Math.atan2(uy, ux)
  const start = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry)
  const end = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry)
  let delta = end - start
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI

  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const step = delta / steps
  // the standard control-point distance for a bézier standing in for a circular arc
  const handle = (4 / 3) * Math.tan(step / 4)

  const point = (angle: number): [number, number] => [
    cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin,
    cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos,
  ]
  const derivative = (angle: number): [number, number] => [
    -rx * Math.sin(angle) * cos - ry * Math.cos(angle) * sin,
    -rx * Math.sin(angle) * sin + ry * Math.cos(angle) * cos,
  ]

  const curves: Cubic[] = []
  for (let n = 0; n < steps; n += 1) {
    const from = start + n * step
    const to = from + step
    const [px, py] = point(from)
    const [qx, qy] = point(to)
    const [dpx, dpy] = derivative(from)
    const [dqx, dqy] = derivative(to)
    curves.push([
      px + handle * dpx,
      py + handle * dpy,
      qx - handle * dqx,
      qy - handle * dqy,
      qx,
      qy,
    ])
  }
  return curves
}
