"use client"

import type { CSSProperties } from "react"
import { filterCss } from "@/lib/image"
import type {
  ChartElement,
  ImageElement,
  LineElement,
  ShapeElement,
  SlideElement,
  TableElement,
  TextElement,
} from "@/types/slides"
import { ChartView } from "./chart-view"
import { FormulaView, MediaView } from "./media-view"
import { TableView } from "./table-view"

const LINE_PAD = 12

function outlineToBorder(el: { outline?: { style: string; width: number; color: string } }) {
  if (!el.outline || !el.outline.width) return {}
  return { border: `${el.outline.width}px ${el.outline.style} ${el.outline.color}` }
}

function shadowToCss(shadow?: { h: number; v: number; blur: number; color: string }) {
  if (!shadow) return undefined
  return `${shadow.h}px ${shadow.v}px ${shadow.blur}px ${shadow.color}`
}

const verticalToFlex = { top: "flex-start", middle: "center", bottom: "flex-end" } as const

export function textBoxStyle(el: TextElement): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: verticalToFlex[el.vertical],
    padding: el.padding ?? 8,
    background: el.fill,
    boxSizing: "border-box",
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    color: el.color,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: [el.underline && "underline", el.strikethrough && "line-through"]
      .filter(Boolean)
      .join(" "),
    textAlign: el.align,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    // `wrap === false` comes from a PPTX body that forbade wrapping; everything authored
    // here wraps, so the flag being absent has to keep the old behaviour
    wordBreak: el.wrap === false ? "normal" : "break-word",
    whiteSpace: el.wrap === false ? "pre" : "pre-wrap",
    textShadow: shadowToCss(el.shadow),
    ...outlineToBorder(el),
  }
}

export function shapeTextStyle(el: ShapeElement): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: verticalToFlex[el.text.vertical],
    padding: "8px 12px",
    boxSizing: "border-box",
    fontFamily: el.text.fontFamily,
    fontSize: el.text.fontSize,
    color: el.text.color,
    fontWeight: el.text.bold ? 700 : 400,
    fontStyle: el.text.italic ? "italic" : "normal",
    textDecoration: [el.text.underline && "underline", el.text.strikethrough && "line-through"]
      .filter(Boolean)
      .join(" "),
    textAlign: el.text.align,
    lineHeight: el.text.lineHeight,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  }
}

function TextView({ el }: { el: TextElement }) {
  return <div style={textBoxStyle(el)} dangerouslySetInnerHTML={{ __html: el.content }} />
}

function ShapeView({ el }: { el: ShapeElement }) {
  const gradientId = `grad-${el.id}`
  const flip = `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${el.viewBox} ${el.viewBox}`}
        preserveAspectRatio="none"
        style={{
          display: "block",
          overflow: "visible",
          transform: el.flipH || el.flipV ? flip : undefined,
          filter: el.shadow ? `drop-shadow(${shadowToCss(el.shadow)})` : undefined,
        }}
      >
        {el.gradient && (
          <defs>
            {el.gradient.type === "linear" ? (
              <linearGradient id={gradientId} gradientTransform={`rotate(${el.gradient.rotate})`}>
                {el.gradient.stops.map((s, i) => (
                  <stop key={i} offset={`${s.pos}%`} stopColor={s.color} />
                ))}
              </linearGradient>
            ) : (
              <radialGradient id={gradientId}>
                {el.gradient.stops.map((s, i) => (
                  <stop key={i} offset={`${s.pos}%`} stopColor={s.color} />
                ))}
              </radialGradient>
            )}
          </defs>
        )}
        <path
          d={el.path}
          fill={el.gradient ? `url(#${gradientId})` : el.fill}
          stroke={el.outline?.color}
          strokeWidth={el.outline?.width ?? 0}
          strokeDasharray={
            el.outline?.style === "dashed" ? "10 6" : el.outline?.style === "dotted" ? "2 6" : undefined
          }
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {el.text.content && (
        <div style={shapeTextStyle(el)} dangerouslySetInnerHTML={{ __html: el.text.content }} />
      )}
    </div>
  )
}

function ImageView({ el }: { el: ImageElement }) {
  const f = el.filter
  const clip = el.clip
  // A crop is expressed as the visible fraction of the source, so the image is blown up
  // by the inverse of that fraction and shifted to bring the window into view.
  const [[x1, y1], [x2, y2]] = clip?.range ?? [
    [0, 0],
    [1, 1],
  ]
  const spanX = Math.max(0.01, x2 - x1)
  const spanY = Math.max(0.01, y2 - y1)

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: el.radius,
        boxShadow: shadowToCss(el.shadow),
        boxSizing: "border-box",
        transform: `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`,
        ...outlineToBorder(el),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={el.src}
        alt={el.name}
        draggable={false}
        style={{
          position: "absolute",
          width: `${100 / spanX}%`,
          height: `${100 / spanY}%`,
          left: `${(-x1 / spanX) * 100}%`,
          top: `${(-y1 / spanY) * 100}%`,
          objectFit: "fill",
          filter: filterCss(f),
        }}
      />
      {el.colorMask && (
        <div style={{ position: "absolute", inset: 0, background: el.colorMask, mixBlendMode: "color" }} />
      )}
    </div>
  )
}

function LineView({ el }: { el: LineElement }) {
  const markerId = `cap-${el.id}`
  const [x1, y1] = el.start
  const [x2, y2] = el.end
  const d = el.curve
    ? `M ${x1 + LINE_PAD} ${y1 + LINE_PAD} Q ${el.curve[0] + LINE_PAD} ${el.curve[1] + LINE_PAD} ${x2 + LINE_PAD} ${y2 + LINE_PAD}`
    : `M ${x1 + LINE_PAD} ${y1 + LINE_PAD} L ${x2 + LINE_PAD} ${y2 + LINE_PAD}`

  return (
    <svg
      width={el.width + LINE_PAD * 2}
      height={el.height + LINE_PAD * 2}
      style={{ position: "absolute", left: -LINE_PAD, top: -LINE_PAD, overflow: "visible" }}
    >
      <defs>
        <marker
          id={`${markerId}-arrow`}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={el.color} />
        </marker>
        <marker
          id={`${markerId}-arrow-start`}
          markerWidth="10"
          markerHeight="10"
          refX="2"
          refY="5"
          orient="auto"
        >
          <path d="M 10 0 L 0 5 L 10 10 z" fill={el.color} />
        </marker>
        <marker id={`${markerId}-dot`} markerWidth="8" markerHeight="8" refX="4" refY="4">
          <circle cx="4" cy="4" r="3.5" fill={el.color} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={el.color}
        strokeWidth={el.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={
          el.style === "dashed"
            ? `${el.strokeWidth * 4} ${el.strokeWidth * 3}`
            : el.style === "dotted"
              ? `1 ${el.strokeWidth * 3}`
              : undefined
        }
        markerStart={
          el.startCap === "arrow"
            ? `url(#${markerId}-arrow-start)`
            : el.startCap === "dot"
              ? `url(#${markerId}-dot)`
              : undefined
        }
        markerEnd={
          el.endCap === "arrow"
            ? `url(#${markerId}-arrow)`
            : el.endCap === "dot"
              ? `url(#${markerId}-dot)`
              : undefined
        }
      />
    </svg>
  )
}

export function ElementView({
  element,
  playable,
}: {
  element: SlideElement
  /** presentation view turns media into real players */
  playable?: boolean
}) {
  switch (element.type) {
    case "text":
      return <TextView el={element} />
    case "shape":
      return <ShapeView el={element} />
    case "image":
      return <ImageView el={element} />
    case "line":
      return <LineView el={element} />
    case "table":
      return <TableView el={element as TableElement} />
    case "chart":
      return <ChartView el={element as ChartElement} />
    case "video":
    case "audio":
      return <MediaView el={element} playable={playable} />
    case "formula":
      return <FormulaView el={element} />
  }
}

/** Absolute wrapper shared by the canvas, thumbnails and presentation view. */
export function ElementBox({
  element,
  children,
  contentOverride,
  playable,
  onFollowLink,
  ...rest
}: {
  element: SlideElement
  children?: React.ReactNode
  contentOverride?: React.ReactNode
  playable?: boolean
  /**
   * Called when a linked element is clicked, in the views where links are live. Element
   * hyperlinks were settable in the property panel and honoured on export, but inert in
   * the app — a link you could add, save and hand to an audience, and which then did
   * nothing when anyone clicked it during the presentation.
   */
  onFollowLink?: (link: NonNullable<SlideElement["link"]>) => void
} & React.HTMLAttributes<HTMLDivElement>) {
  const linked = onFollowLink && element.link
  return (
    <div
      {...rest}
      onClick={
        linked
          ? (event) => {
              event.stopPropagation()
              onFollowLink(element.link!)
              rest.onClick?.(event)
            }
          : rest.onClick
      }
      style={{
        position: "absolute",
        left: element.left,
        top: element.top,
        width: element.width,
        height: element.height,
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
        opacity: element.opacity ?? 1,
        cursor: linked ? "pointer" : undefined,
        ...rest.style,
      }}
    >
      {contentOverride ?? <ElementView element={element} playable={playable} />}
      {children}
    </div>
  )
}
