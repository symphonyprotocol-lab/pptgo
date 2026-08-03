export type ElementType =
  | "text"
  | "image"
  | "shape"
  | "line"
  | "table"
  | "chart"
  | "video"
  | "audio"
  | "formula"

export type AlignHorizontal = "left" | "center" | "right" | "justify"
export type AlignVertical = "top" | "middle" | "bottom"

export interface Outline {
  style: "solid" | "dashed" | "dotted"
  width: number
  color: string
}

export interface Shadow {
  h: number
  v: number
  blur: number
  color: string
}

export interface GradientStop {
  pos: number
  color: string
}

export interface Gradient {
  type: "linear" | "radial"
  rotate: number
  stops: GradientStop[]
}

/** Either an external URL or a jump to another slide in this deck. */
export interface ElementLink {
  type: "web" | "slide"
  /** url for `web`, slide id for `slide` */
  target: string
}

interface BaseElement {
  id: string
  name: string
  left: number
  top: number
  width: number
  height: number
  rotate: number
  lock?: boolean
  groupId?: string
  opacity?: number
  link?: ElementLink
}

export interface TextElement extends BaseElement {
  type: "text"
  /** sanitized HTML */
  content: string
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  align: AlignHorizontal
  vertical: AlignVertical
  lineHeight: number
  letterSpacing: number
  /**
   * Whether long lines wrap inside the box. Defaults to true; PPTX text bodies carrying
   * `bodyPr/@wrap="none"` import as false, because PowerPoint sizes those boxes to the
   * text rather than the other way round — wrapping them anyway splits short labels like
   * "CONTROL PLANE" across two lines and wrecks the layout they were placed in.
   */
  wrap?: boolean
  paragraphSpacing?: number
  /** inner padding in canvas units */
  padding?: number
  fill?: string
  outline?: Outline
  shadow?: Shadow
}

export interface ImageClip {
  /** crop window as fractions of the source image: [[x1,y1],[x2,y2]] */
  range: [[number, number], [number, number]]
}

export interface ImageElement extends BaseElement {
  type: "image"
  src: string
  fixedRatio: boolean
  radius: number
  flipH: boolean
  flipV: boolean
  clip?: ImageClip
  /** solid colour laid over the image */
  colorMask?: string
  filter: {
    blur: number
    brightness: number
    contrast: number
    grayscale: number
    saturate: number
    sepia: number
  }
  outline?: Outline
  shadow?: Shadow
}

export interface ShapeText {
  content: string
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  align: AlignHorizontal
  vertical: AlignVertical
  lineHeight: number
}

export interface ShapeElement extends BaseElement {
  type: "shape"
  /** key into SHAPE_MAP — drives both rendering and the OOXML preset on export */
  shapeKey: string
  /** path drawn inside `viewBox`, denormalised from `shapeKey` for rendering */
  path: string
  viewBox: number
  fill: string
  gradient?: Gradient
  outline?: Outline
  shadow?: Shadow
  flipH?: boolean
  flipV?: boolean
  text: ShapeText
}

export type LineCap = "none" | "arrow" | "dot"

export interface LineElement extends BaseElement {
  type: "line"
  /** relative to left/top */
  start: [number, number]
  end: [number, number]
  /** control-point offset for curved lines, relative to left/top */
  curve?: [number, number]
  color: string
  style: "solid" | "dashed" | "dotted"
  strokeWidth: number
  startCap: LineCap
  endCap: LineCap
}

export interface TableCell {
  /** plain text — table cells are not rich-text edited */
  text: string
  colspan: number
  rowspan: number
  /** true when a neighbouring cell spans over this one */
  merged?: boolean
  fill?: string
  color?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: AlignHorizontal
}

export interface TableTheme {
  color: string
  rowHeader: boolean
  banded: boolean
}

export interface TableElement extends BaseElement {
  type: "table"
  /** column widths as fractions of `width`, summing to 1 */
  colWidths: number[]
  rows: TableCell[][]
  theme: TableTheme
  outline: Outline
  fontFamily: string
  fontSize: number
}

export type ChartType =
  | "bar"
  | "column"
  | "line"
  | "area"
  | "scatter"
  | "pie"
  | "doughnut"
  | "radar"

export interface ChartSeries {
  name: string
  values: number[]
}

export interface ChartData {
  categories: string[]
  series: ChartSeries[]
}

export interface ChartElement extends BaseElement {
  type: "chart"
  chartType: ChartType
  data: ChartData
  themeColors: string[]
  fill?: string
  gridColor: string
  textColor: string
  showLegend: boolean
  showGrid: boolean
  showValue: boolean
}

export interface MediaElement extends BaseElement {
  type: "video" | "audio"
  /** data URI or remote url */
  src: string
  /** poster frame, video only */
  poster?: string
  autoplay: boolean
  loop: boolean
}

export interface FormulaElement extends BaseElement {
  type: "formula"
  latex: string
  color: string
}

export type SlideElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | TableElement
  | ChartElement
  | MediaElement
  | FormulaElement

export interface SlideBackground {
  type: "solid" | "gradient" | "image"
  color: string
  gradient?: Gradient
  image?: string
  imageSize?: "cover" | "contain" | "repeat"
}

export type TransitionType = "none" | "fade" | "slideX" | "slideY" | "zoom"

export type AnimationEffect =
  | "fadeIn"
  | "slideInUp"
  | "slideInDown"
  | "slideInLeft"
  | "slideInRight"
  | "zoomIn"
  | "rotateIn"
  | "fadeOut"
  | "zoomOut"
  | "pulse"
  | "shake"

export interface ElementAnimation {
  id: string
  elId: string
  effect: AnimationEffect
  type: "in" | "out" | "attention"
  duration: number
  /** `click` starts a new step, `auto` runs alongside the previous one */
  trigger: "click" | "auto"
}

export interface Slide {
  id: string
  elements: SlideElement[]
  background: SlideBackground
  notes: string
  /** a slide that starts a section carries the section name */
  section?: string
  transition?: TransitionType
  animations?: ElementAnimation[]
}

export interface DeckTheme {
  fontFamily: string
  fontColor: string
  backgroundColor: string
  themeColors: string[]
}

export interface Deck {
  version: 1
  title: string
  width: number
  height: number
  theme: DeckTheme
  slides: Slide[]
}
