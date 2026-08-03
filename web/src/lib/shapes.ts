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
    path: "M 40 40 L 160 40 A 60 60 0 0 1 160 160 L 40 160 A 60 60 0 0 1 40 40 Z",
  },
]

export const SHAPE_MAP = new Map(SHAPE_LIST.map((s) => [s.key, s]))

/** Legacy decks stored only the path — recover the key so export keeps its preset geometry. */
const KEY_BY_PATH = new Map(SHAPE_LIST.map((s) => [s.path, s.key]))
export const shapeKeyFromPath = (path: string) => KEY_BY_PATH.get(path)
