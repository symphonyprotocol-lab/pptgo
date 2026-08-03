"use client"

import type { ChartElement, ChartSeries } from "@/types/slides"

const PAD = { top: 16, right: 16, bottom: 34, left: 44 }
const LEGEND_HEIGHT = 22

interface Frame {
  width: number
  height: number
  plotTop: number
  plotLeft: number
  plotWidth: number
  plotHeight: number
}

function frameOf(el: ChartElement): Frame {
  const legend = el.showLegend ? LEGEND_HEIGHT : 0
  const plotLeft = PAD.left
  const plotTop = PAD.top
  return {
    width: el.width,
    height: el.height,
    plotLeft,
    plotTop,
    plotWidth: Math.max(1, el.width - PAD.left - PAD.right),
    plotHeight: Math.max(1, el.height - PAD.top - PAD.bottom - legend),
  }
}

function extent(series: ChartSeries[], stackFromZero = true): [number, number] {
  const values = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v))
  if (!values.length) return [0, 1]
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (stackFromZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  if (min === max) max = min + 1
  return [min, max]
}

function ticks(min: number, max: number, count = 4): number[] {
  const step = (max - min) / count
  return Array.from({ length: count + 1 }, (_, i) => min + step * i)
}

const fmt = (value: number) =>
  Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k` : `${Math.round(value * 10) / 10}`

/** Lightweight SVG charts — the canvas needs a faithful preview, not an interactive chart lib. */
export function ChartView({ el }: { el: ChartElement }) {
  const frame = frameOf(el)
  const body =
    el.chartType === "pie" || el.chartType === "doughnut" ? (
      <PieBody el={el} frame={frame} />
    ) : el.chartType === "radar" ? (
      <RadarBody el={el} frame={frame} />
    ) : (
      <CartesianBody el={el} frame={frame} />
    )

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${el.width} ${el.height}`}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible", background: el.fill }}
    >
      {body}
      {el.showLegend && <Legend el={el} frame={frame} />}
    </svg>
  )
}

function Legend({ el, frame }: { el: ChartElement; frame: Frame }) {
  const isPie = el.chartType === "pie" || el.chartType === "doughnut"
  const labels = isPie ? el.data.categories : el.data.series.map((s) => s.name)
  const y = frame.height - LEGEND_HEIGHT / 2 - 2
  const itemWidth = Math.min(120, frame.width / Math.max(1, labels.length))
  const totalWidth = itemWidth * labels.length
  const startX = (frame.width - totalWidth) / 2

  return (
    <g>
      {labels.map((label, i) => (
        <g key={i} transform={`translate(${startX + i * itemWidth}, ${y})`}>
          <rect x={0} y={-5} width={10} height={10} rx={2} fill={color(el, i)} />
          <text
            x={15}
            y={0}
            fill={el.textColor}
            fontSize={11}
            dominantBaseline="middle"
            style={{ userSelect: "none" }}
          >
            {truncate(label, Math.max(4, Math.floor(itemWidth / 7)))}
          </text>
        </g>
      ))}
    </g>
  )
}

const color = (el: ChartElement, index: number) =>
  el.themeColors[index % Math.max(1, el.themeColors.length)] ?? "#2563eb"

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text

function CartesianBody({ el, frame }: { el: ChartElement; frame: Frame }) {
  const horizontal = el.chartType === "bar"
  const [min, max] = extent(el.data.series)
  const span = max - min
  const scale = (value: number) => (value - min) / span

  const categories = el.data.categories
  const bandCount = Math.max(1, categories.length)
  const band = (horizontal ? frame.plotHeight : frame.plotWidth) / bandCount

  const x = (index: number) => frame.plotLeft + band * (index + 0.5)
  const y = (value: number) => frame.plotTop + frame.plotHeight * (1 - scale(value))
  const bx = (value: number) => frame.plotLeft + frame.plotWidth * scale(value)
  const by = (index: number) => frame.plotTop + band * (index + 0.5)

  const gridValues = ticks(min, max)

  return (
    <g>
      {el.showGrid &&
        gridValues.map((value, i) =>
          horizontal ? (
            <line
              key={i}
              x1={bx(value)}
              x2={bx(value)}
              y1={frame.plotTop}
              y2={frame.plotTop + frame.plotHeight}
              stroke={el.gridColor}
              strokeWidth={1}
            />
          ) : (
            <line
              key={i}
              x1={frame.plotLeft}
              x2={frame.plotLeft + frame.plotWidth}
              y1={y(value)}
              y2={y(value)}
              stroke={el.gridColor}
              strokeWidth={1}
            />
          ),
        )}

      {gridValues.map((value, i) => (
        <text
          key={`t${i}`}
          x={horizontal ? bx(value) : frame.plotLeft - 6}
          y={horizontal ? frame.plotTop + frame.plotHeight + 14 : y(value)}
          fill={el.textColor}
          fontSize={10}
          textAnchor={horizontal ? "middle" : "end"}
          dominantBaseline="middle"
        >
          {fmt(value)}
        </text>
      ))}

      {categories.map((label, i) => (
        <text
          key={`c${i}`}
          x={horizontal ? frame.plotLeft - 6 : x(i)}
          y={horizontal ? by(i) : frame.plotTop + frame.plotHeight + 14}
          fill={el.textColor}
          fontSize={10}
          textAnchor={horizontal ? "end" : "middle"}
          dominantBaseline="middle"
        >
          {truncate(label, horizontal ? 6 : Math.max(3, Math.floor(band / 7)))}
        </text>
      ))}

      {el.data.series.map((series, si) => {
        const stroke = color(el, si)
        if (el.chartType === "column" || el.chartType === "bar") {
          const count = Math.max(1, el.data.series.length)
          const thickness = (band * 0.7) / count
          return (
            <g key={si}>
              {series.values.map((value, i) => {
                if (!Number.isFinite(value)) return null
                if (horizontal) {
                  const start = Math.min(bx(0), bx(value))
                  return (
                    <rect
                      key={i}
                      x={start}
                      y={by(i) - band * 0.35 + si * thickness}
                      width={Math.abs(bx(value) - bx(0))}
                      height={Math.max(1, thickness - 2)}
                      fill={stroke}
                    />
                  )
                }
                const top = Math.min(y(0), y(value))
                return (
                  <rect
                    key={i}
                    x={x(i) - band * 0.35 + si * thickness}
                    y={top}
                    width={Math.max(1, thickness - 2)}
                    height={Math.abs(y(value) - y(0))}
                    fill={stroke}
                  />
                )
              })}
            </g>
          )
        }

        const points = series.values.map((value, i) => [x(i), y(value)] as const)
        const path = points.map(([px, py], i) => `${i ? "L" : "M"} ${px} ${py}`).join(" ")

        if (el.chartType === "scatter") {
          return (
            <g key={si}>
              {points.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={4} fill={stroke} />
              ))}
            </g>
          )
        }

        return (
          <g key={si}>
            {el.chartType === "area" && points.length > 1 && (
              <path
                d={`${path} L ${points[points.length - 1][0]} ${y(Math.max(0, min))} L ${points[0][0]} ${y(Math.max(0, min))} Z`}
                fill={stroke}
                opacity={0.22}
              />
            )}
            <path d={path} fill="none" stroke={stroke} strokeWidth={2} />
            {points.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={3} fill={stroke} />
            ))}
          </g>
        )
      })}

      {el.showValue &&
        el.data.series.map((series, si) =>
          series.values.map((value, i) => (
            <text
              key={`${si}-${i}`}
              x={horizontal ? bx(value) + 4 : x(i)}
              y={horizontal ? by(i) : y(value) - 5}
              fill={el.textColor}
              fontSize={10}
              textAnchor={horizontal ? "start" : "middle"}
            >
              {fmt(value)}
            </text>
          )),
        )}
    </g>
  )
}

function PieBody({ el, frame }: { el: ChartElement; frame: Frame }) {
  const values = (el.data.series[0]?.values ?? []).map((v) => (Number.isFinite(v) ? Math.abs(v) : 0))
  const total = values.reduce((sum, v) => sum + v, 0)
  const cx = frame.width / 2
  const cy = frame.plotTop + frame.plotHeight / 2
  const radius = Math.max(10, Math.min(frame.plotWidth, frame.plotHeight) / 2 - 6)
  const inner = el.chartType === "doughnut" ? radius * 0.55 : 0

  if (!total) {
    return <circle cx={cx} cy={cy} r={radius} fill="none" stroke={el.gridColor} strokeWidth={1} />
  }

  // running start angle per slice, so nothing is mutated while rendering
  const starts = values.reduce<number[]>(
    (acc, value) => [...acc, acc[acc.length - 1] + (value / total) * Math.PI * 2],
    [-Math.PI / 2],
  )

  return (
    <g>
      {values.map((value, i) => {
        const sweep = (value / total) * Math.PI * 2
        const angle = starts[i]
        const end = starts[i + 1]
        const path = arcPath(cx, cy, radius, inner, angle, end)
        const mid = angle + sweep / 2
        return (
          <g key={i}>
            <path d={path} fill={color(el, i)} />
            {el.showValue && value > 0 && (
              <text
                x={cx + Math.cos(mid) * (radius * 0.7)}
                y={cy + Math.sin(mid) * (radius * 0.7)}
                fill="#ffffff"
                fontSize={11}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {Math.round((value / total) * 100)}%
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function arcPath(
  cx: number,
  cy: number,
  radius: number,
  inner: number,
  start: number,
  end: number,
): string {
  // a full circle cannot be drawn with a single arc — nudge the sweep just short of 2π
  const sweep = Math.min(end - start, Math.PI * 2 - 0.0001)
  const stop = start + sweep
  const large = sweep > Math.PI ? 1 : 0
  const x1 = cx + Math.cos(start) * radius
  const y1 = cy + Math.sin(start) * radius
  const x2 = cx + Math.cos(stop) * radius
  const y2 = cy + Math.sin(stop) * radius

  if (!inner) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
  }
  const ix1 = cx + Math.cos(stop) * inner
  const iy1 = cy + Math.sin(stop) * inner
  const ix2 = cx + Math.cos(start) * inner
  const iy2 = cy + Math.sin(start) * inner
  return (
    `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} ` +
    `L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`
  )
}

function RadarBody({ el, frame }: { el: ChartElement; frame: Frame }) {
  const axes = Math.max(3, el.data.categories.length)
  const [, max] = extent(el.data.series)
  const cx = frame.width / 2
  const cy = frame.plotTop + frame.plotHeight / 2
  const radius = Math.max(10, Math.min(frame.plotWidth, frame.plotHeight) / 2 - 14)
  const angleAt = (i: number) => -Math.PI / 2 + (i / axes) * Math.PI * 2
  const pointAt = (i: number, ratio: number) => [
    cx + Math.cos(angleAt(i)) * radius * ratio,
    cy + Math.sin(angleAt(i)) * radius * ratio,
  ]

  return (
    <g>
      {el.showGrid &&
        [0.25, 0.5, 0.75, 1].map((ratio, ri) => (
          <polygon
            key={ri}
            points={Array.from({ length: axes }, (_, i) => pointAt(i, ratio).join(",")).join(" ")}
            fill="none"
            stroke={el.gridColor}
            strokeWidth={1}
          />
        ))}
      {Array.from({ length: axes }, (_, i) => {
        const [px, py] = pointAt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke={el.gridColor} strokeWidth={1} />
      })}
      {el.data.categories.slice(0, axes).map((label, i) => {
        const [px, py] = pointAt(i, 1.14)
        return (
          <text
            key={i}
            x={px}
            y={py}
            fill={el.textColor}
            fontSize={10}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {truncate(label, 6)}
          </text>
        )
      })}
      {el.data.series.map((series, si) => {
        const points = Array.from({ length: axes }, (_, i) => {
          const value = series.values[i]
          const ratio = Number.isFinite(value) && max > 0 ? Math.max(0, value) / max : 0
          return pointAt(i, ratio).join(",")
        }).join(" ")
        return (
          <polygon
            key={si}
            points={points}
            fill={color(el, si)}
            fillOpacity={0.2}
            stroke={color(el, si)}
            strokeWidth={2}
          />
        )
      })}
    </g>
  )
}
