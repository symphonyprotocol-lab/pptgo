import type { MessageKey } from "@/lib/i18n/messages"

export interface ShapeDef {
  key: string
  /** message key for the palette tooltip and the element's default layer name */
  labelKey: MessageKey
  path: string
  viewBox: number
  /** OOXML preset geometry used when exporting to .pptx */
  preset: string
}

/** All paths are authored inside a 200 x 200 box. */
export const SHAPE_LIST: ShapeDef[] = [
  { key: "rect", labelKey: "shape.rect", viewBox: 200, preset: "rect", path: "M 0 0 L 200 0 L 200 200 L 0 200 Z" },
  {
    key: "roundRect",
    labelKey: "shape.roundRect",
    viewBox: 200,
    preset: "roundRect",
    path: "M 24 0 L 176 0 A 24 24 0 0 1 200 24 L 200 176 A 24 24 0 0 1 176 200 L 24 200 A 24 24 0 0 1 0 176 L 0 24 A 24 24 0 0 1 24 0 Z",
  },
  {
    key: "ellipse",
    labelKey: "shape.ellipse",
    viewBox: 200,
    preset: "ellipse",
    path: "M 100 0 A 100 100 0 1 1 100 200 A 100 100 0 1 1 100 0 Z",
  },
  { key: "triangle", labelKey: "shape.triangle", viewBox: 200, preset: "triangle", path: "M 100 0 L 200 200 L 0 200 Z" },
  {
    key: "rightTriangle",
    labelKey: "shape.rightTriangle",
    viewBox: 200,
    preset: "rtTriangle",
    path: "M 0 0 L 200 200 L 0 200 Z",
  },
  { key: "diamond", labelKey: "shape.diamond", viewBox: 200, preset: "diamond", path: "M 100 0 L 200 100 L 100 200 L 0 100 Z" },
  {
    key: "parallelogram",
    labelKey: "shape.parallelogram",
    viewBox: 200,
    preset: "parallelogram",
    path: "M 50 0 L 200 0 L 150 200 L 0 200 Z",
  },
  {
    key: "trapezoid",
    labelKey: "shape.trapezoid",
    viewBox: 200,
    preset: "trapezoid",
    path: "M 50 0 L 150 0 L 200 200 L 0 200 Z",
  },
  {
    key: "pentagon",
    labelKey: "shape.pentagon",
    viewBox: 200,
    preset: "pentagon",
    path: "M 100 0 L 200 76 L 162 200 L 38 200 L 0 76 Z",
  },
  {
    key: "hexagon",
    labelKey: "shape.hexagon",
    viewBox: 200,
    preset: "hexagon",
    path: "M 50 0 L 150 0 L 200 100 L 150 200 L 50 200 L 0 100 Z",
  },
  {
    key: "octagon",
    labelKey: "shape.octagon",
    viewBox: 200,
    preset: "octagon",
    path: "M 60 0 L 140 0 L 200 60 L 200 140 L 140 200 L 60 200 L 0 140 L 0 60 Z",
  },
  {
    key: "star5",
    labelKey: "shape.star5",
    viewBox: 200,
    preset: "star5",
    path: "M 100 0 L 129 63 L 195 72 L 147 120 L 159 190 L 100 157 L 41 190 L 53 120 L 5 72 L 71 63 Z",
  },
  {
    key: "star4",
    labelKey: "shape.star4",
    viewBox: 200,
    preset: "star4",
    path: "M 100 0 L 128 72 L 200 100 L 128 128 L 100 200 L 72 128 L 0 100 L 72 72 Z",
  },
  {
    key: "star6",
    labelKey: "shape.star6",
    viewBox: 200,
    preset: "star6",
    path: "M 100 0 L 129 50 L 187 50 L 158 100 L 187 150 L 129 150 L 100 200 L 71 150 L 13 150 L 42 100 L 13 50 L 71 50 Z",
  },
  {
    key: "arrowRight",
    labelKey: "shape.arrowRight",
    viewBox: 200,
    preset: "rightArrow",
    path: "M 0 60 L 120 60 L 120 10 L 200 100 L 120 190 L 120 140 L 0 140 Z",
  },
  {
    key: "arrowLeft",
    labelKey: "shape.arrowLeft",
    viewBox: 200,
    preset: "leftArrow",
    path: "M 200 60 L 80 60 L 80 10 L 0 100 L 80 190 L 80 140 L 200 140 Z",
  },
  {
    key: "arrowUp",
    labelKey: "shape.arrowUp",
    viewBox: 200,
    preset: "upArrow",
    path: "M 60 200 L 60 80 L 10 80 L 100 0 L 190 80 L 140 80 L 140 200 Z",
  },
  {
    key: "arrowDown",
    labelKey: "shape.arrowDown",
    viewBox: 200,
    preset: "downArrow",
    path: "M 60 0 L 60 120 L 10 120 L 100 200 L 190 120 L 140 120 L 140 0 Z",
  },
  {
    key: "leftRightArrow",
    labelKey: "shape.leftRightArrow",
    viewBox: 200,
    preset: "leftRightArrow",
    path: "M 0 100 L 60 40 L 60 75 L 140 75 L 140 40 L 200 100 L 140 160 L 140 125 L 60 125 L 60 160 Z",
  },
  {
    key: "chevron",
    labelKey: "shape.chevron",
    viewBox: 200,
    preset: "chevron",
    path: "M 0 0 L 130 0 L 200 100 L 130 200 L 0 200 L 70 100 Z",
  },
  {
    key: "cross",
    labelKey: "shape.cross",
    viewBox: 200,
    preset: "plus",
    path: "M 70 0 L 130 0 L 130 70 L 200 70 L 200 130 L 130 130 L 130 200 L 70 200 L 70 130 L 0 130 L 0 70 L 70 70 Z",
  },
  {
    key: "heart",
    labelKey: "shape.heart",
    viewBox: 200,
    preset: "heart",
    path: "M 100 190 C 40 140 0 105 0 65 C 0 30 26 6 58 6 C 78 6 92 16 100 30 C 108 16 122 6 142 6 C 174 6 200 30 200 65 C 200 105 160 140 100 190 Z",
  },
  {
    key: "callout",
    labelKey: "shape.callout",
    viewBox: 200,
    preset: "wedgeRectCallout",
    path: "M 16 0 L 184 0 A 16 16 0 0 1 200 16 L 200 134 A 16 16 0 0 1 184 150 L 90 150 L 55 200 L 55 150 L 16 150 A 16 16 0 0 1 0 134 L 0 16 A 16 16 0 0 1 16 0 Z",
  },
  {
    key: "cloud",
    labelKey: "shape.cloud",
    viewBox: 200,
    preset: "cloud",
    path: "M 50 160 A 40 40 0 0 1 46 82 A 45 45 0 0 1 128 52 A 38 38 0 0 1 172 104 A 33 33 0 0 1 152 160 Z",
  },
  {
    key: "cylinder",
    labelKey: "shape.cylinder",
    viewBox: 200,
    preset: "can",
    path: "M 0 30 A 100 30 0 0 1 200 30 L 200 170 A 100 30 0 0 1 0 170 Z",
  },
  {
    key: "flowChartProcess",
    labelKey: "shape.flowChartProcess",
    viewBox: 200,
    preset: "flowChartProcess",
    path: "M 0 40 L 200 40 L 200 160 L 0 160 Z",
  },
  {
    key: "flowChartDecision",
    labelKey: "shape.flowChartDecision",
    viewBox: 200,
    preset: "flowChartDecision",
    path: "M 100 20 L 200 100 L 100 180 L 0 100 Z",
  },
  {
    key: "flowChartTerminator",
    labelKey: "shape.flowChartTerminator",
    viewBox: 200,
    preset: "flowChartTerminator",
    // the caps are inset by their own radius; centred on 40 and 160 they reached x=220 and
    // x=-20, so both rounded ends were clipped flat against the edge of the box
    path: "M 60 40 L 140 40 A 60 60 0 0 1 140 160 L 60 160 A 60 60 0 0 1 60 40 Z",
  },
  // A hole is a second subpath wound the other way round, which the non-zero fill rule
  // reads as empty — the same thing OOXML's own donut geometry does.
  {
    key: "donut",
    labelKey: "shape.donut",
    viewBox: 200,
    preset: "donut",
    path: "M 100 0 A 100 100 0 1 1 100 200 A 100 100 0 1 1 100 0 Z M 100 50 A 50 50 0 1 0 100 150 A 50 50 0 1 0 100 50 Z",
  },
  {
    key: "pie",
    labelKey: "shape.pie",
    viewBox: 200,
    preset: "pie",
    path: "M 100 100 L 200 100 A 100 100 0 1 1 100 0 Z",
  },
  {
    key: "teardrop",
    labelKey: "shape.teardrop",
    viewBox: 200,
    preset: "teardrop",
    path: "M 100 0 A 100 100 0 0 0 0 100 A 100 100 0 0 0 100 200 A 100 100 0 0 0 200 100 L 200 0 Z",
  },
  {
    key: "frame",
    labelKey: "shape.frame",
    viewBox: 200,
    preset: "frame",
    path: "M 0 0 L 200 0 L 200 200 L 0 200 Z M 25 25 L 25 175 L 175 175 L 175 25 Z",
  },
  {
    key: "plaque",
    labelKey: "shape.plaque",
    viewBox: 200,
    preset: "plaque",
    path: "M 33 0 L 167 0 A 33 33 0 0 0 200 33 L 200 167 A 33 33 0 0 0 167 200 L 33 200 A 33 33 0 0 0 0 167 L 0 33 A 33 33 0 0 0 33 0 Z",
  },
  {
    key: "round1Rect",
    labelKey: "shape.round1Rect",
    viewBox: 200,
    preset: "round1Rect",
    path: "M 0 0 L 167 0 A 33 33 0 0 1 200 33 L 200 200 L 0 200 Z",
  },
  {
    key: "snip1Rect",
    labelKey: "shape.snip1Rect",
    viewBox: 200,
    preset: "snip1Rect",
    path: "M 0 0 L 167 0 L 200 33 L 200 200 L 0 200 Z",
  },
  {
    key: "homePlate",
    labelKey: "shape.homePlate",
    viewBox: 200,
    preset: "homePlate",
    path: "M 0 0 L 150 0 L 200 100 L 150 200 L 0 200 Z",
  },
  {
    key: "upDownArrow",
    labelKey: "shape.upDownArrow",
    viewBox: 200,
    preset: "upDownArrow",
    path: "M 100 0 L 160 60 L 130 60 L 130 140 L 160 140 L 100 200 L 40 140 L 70 140 L 70 60 L 40 60 Z",
  },
  {
    key: "quadArrow",
    labelKey: "shape.quadArrow",
    viewBox: 200,
    preset: "quadArrow",
    path: "M 100 0 L 148 40 L 122 40 L 122 78 L 160 78 L 160 52 L 200 100 L 160 148 L 160 122 L 122 122 L 122 160 L 148 160 L 100 200 L 52 160 L 78 160 L 78 122 L 40 122 L 40 148 L 0 100 L 40 52 L 40 78 L 78 78 L 78 40 L 52 40 Z",
  },
  {
    key: "bentArrow",
    labelKey: "shape.bentArrow",
    viewBox: 200,
    preset: "bentArrow",
    path: "M 0 200 L 0 60 L 120 60 L 120 20 L 200 90 L 120 160 L 120 120 L 60 120 L 60 200 Z",
  },
  {
    key: "notchedRightArrow",
    labelKey: "shape.notchedRightArrow",
    viewBox: 200,
    preset: "notchedRightArrow",
    path: "M 0 60 L 120 60 L 120 10 L 200 100 L 120 190 L 120 140 L 0 140 L 40 100 Z",
  },
  {
    key: "star7",
    labelKey: "shape.star7",
    viewBox: 200,
    preset: "star7",
    path: "M 100 5 L 116 66 L 174 41 L 137 92 L 193 121 L 130 124 L 141 186 L 100 138 L 59 186 L 70 124 L 7 121 L 63 92 L 26 41 L 84 66 Z",
  },
  {
    key: "star8",
    labelKey: "shape.star8",
    viewBox: 200,
    preset: "star8",
    path: "M 100 5 L 114 67 L 167 33 L 133 86 L 195 100 L 133 114 L 167 167 L 114 133 L 100 195 L 86 133 L 33 167 L 67 114 L 5 100 L 67 86 L 33 33 L 86 67 Z",
  },
  {
    key: "ellipseCallout",
    labelKey: "shape.ellipseCallout",
    viewBox: 200,
    preset: "wedgeEllipseCallout",
    // the tail closes the gap the arc leaves, so body and tail are one contour rather than
    // two overlapping ones with a seam drawn across the join
    path: "M 60 146 A 95 75 0 1 1 140 146 L 30 200 Z",
  },
  // These four look like shapes already in the list, and are here so that a deck that used
  // the flowchart preset keeps it: a decision drawn as a diamond loses nothing on screen,
  // but the shape stops being a decision the moment it round-trips as a plain diamond.
  {
    key: "flowChartConnector",
    labelKey: "shape.flowChartConnector",
    viewBox: 200,
    preset: "flowChartConnector",
    path: "M 100 0 A 100 100 0 1 1 100 200 A 100 100 0 1 1 100 0 Z",
  },
  {
    key: "flowChartInputOutput",
    labelKey: "shape.flowChartInputOutput",
    viewBox: 200,
    preset: "flowChartInputOutput",
    path: "M 40 0 L 200 0 L 160 200 L 0 200 Z",
  },
  {
    key: "flowChartPreparation",
    labelKey: "shape.flowChartPreparation",
    viewBox: 200,
    preset: "flowChartPreparation",
    path: "M 40 0 L 160 0 L 200 100 L 160 200 L 40 200 L 0 100 Z",
  },
  {
    key: "flowChartDocument",
    labelKey: "shape.flowChartDocument",
    viewBox: 200,
    preset: "flowChartDocument",
    path: "M 0 20 L 200 20 L 200 160 C 160 190 140 130 100 160 C 60 190 40 130 0 160 Z",
  },
]

export const SHAPE_MAP = new Map(SHAPE_LIST.map((s) => [s.key, s]))

/** Legacy decks stored only the path — recover the key so export keeps its preset geometry. */
const KEY_BY_PATH = new Map(SHAPE_LIST.map((s) => [s.path, s.key]))
export const shapeKeyFromPath = (path: string) => KEY_BY_PATH.get(path)
