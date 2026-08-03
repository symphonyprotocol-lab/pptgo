import { beforeEach, describe, expect, it } from "vitest"
import { useEditor } from "./editor"
import {
  createDeck,
  createShapeElement,
  createSlide,
  createTableElement,
  createTextElement,
} from "@/lib/factory"
import type { ShapeElement, SlideElement, TableElement } from "@/types/slides"

const reset = (
  elements: SlideElement[] = [createShapeElement("rect", { left: 0, top: 0 })],
) => {
  useEditor.getState().loadDeck({ ...createDeck(), slides: [createSlide({ elements })] })
}

const ids = () => useEditor.getState().currentSlide().elements.map((el) => el.id)

beforeEach(() => reset())

describe("history", () => {
  it("undoes an element deletion", () => {
    const [id] = ids()
    useEditor.getState().deleteElements([id])
    expect(ids()).toHaveLength(0)
    useEditor.getState().undo()
    expect(ids()).toEqual([id])
  })

  it("redoes what was undone", () => {
    useEditor.getState().deleteElements(ids())
    useEditor.getState().undo()
    useEditor.getState().redo()
    expect(ids()).toHaveLength(0)
  })

  // Notes used to bypass history, so an unrelated undo silently reverted them.
  it("records speaker notes", () => {
    useEditor.getState().setNotes("hello")
    expect(useEditor.getState().currentSlide().notes).toBe("hello")
    useEditor.getState().undo()
    expect(useEditor.getState().currentSlide().notes).toBe("")
  })

  it("does nothing when there is nothing to undo", () => {
    const before = ids()
    useEditor.getState().undo()
    expect(ids()).toEqual(before)
  })
})

describe("reorder", () => {
  beforeEach(() =>
    reset([
      createTextElement({ content: "a" }),
      createTextElement({ content: "b" }),
      createTextElement({ content: "c" }),
    ]),
  )

  it("moves a selection to the front and back", () => {
    const [a, b, c] = ids()
    useEditor.getState().setActiveIds([a])
    useEditor.getState().reorder([a], "front")
    expect(ids()).toEqual([b, c, a])
    useEditor.getState().reorder([a], "back")
    expect(ids()).toEqual([a, b, c])
  })

  it("steps one layer at a time", () => {
    const [a, b, c] = ids()
    useEditor.getState().reorder([a], "forward")
    expect(ids()).toEqual([b, a, c])
    useEditor.getState().reorder([a], "backward")
    expect(ids()).toEqual([a, b, c])
  })

  it("keeps a multi-selection together", () => {
    const [a, b, c] = ids()
    useEditor.getState().reorder([a, b], "front")
    expect(ids()).toEqual([c, a, b])
  })

  it("is a no-op at the edges", () => {
    const before = ids()
    useEditor.getState().reorder([before[2]], "forward")
    expect(ids()).toEqual(before)
    useEditor.getState().reorder([before[0]], "backward")
    expect(ids()).toEqual(before)
  })
})

describe("lock", () => {
  it("toggles and can always be undone from the panel", () => {
    const [id] = ids()
    useEditor.getState().toggleLock([id])
    expect(useEditor.getState().currentSlide().elements[0].lock).toBe(true)
    useEditor.getState().toggleLock([id])
    expect(useEditor.getState().currentSlide().elements[0].lock).toBe(false)
  })

  it("refuses to move a locked element", () => {
    const [id] = ids()
    useEditor.getState().toggleLock([id], true)
    useEditor.getState().setActiveIds([id])
    useEditor.getState().alignElements("right")
    expect(useEditor.getState().currentSlide().elements[0].left).toBe(0)
  })
})

describe("grouping", () => {
  it("tags a group and clears it again", () => {
    reset([createTextElement(), createTextElement()])
    const all = ids()
    useEditor.getState().setActiveIds(all)
    useEditor.getState().groupElements()
    const groupIds = useEditor.getState().currentSlide().elements.map((el) => el.groupId)
    expect(groupIds[0]).toBeTruthy()
    expect(groupIds[0]).toBe(groupIds[1])

    useEditor.getState().ungroupElements()
    expect(useEditor.getState().currentSlide().elements.every((el) => !el.groupId)).toBe(true)
  })

  it("needs two elements", () => {
    useEditor.getState().setActiveIds(ids())
    useEditor.getState().groupElements()
    expect(useEditor.getState().currentSlide().elements[0].groupId).toBeUndefined()
  })
})

describe("clipboard", () => {
  it("pastes an offset copy with fresh ids", () => {
    const [id] = ids()
    useEditor.getState().setActiveIds([id])
    useEditor.getState().copy()
    useEditor.getState().paste()
    const elements = useEditor.getState().currentSlide().elements
    expect(elements).toHaveLength(2)
    expect(elements[1].id).not.toBe(id)
    expect(elements[1].left).toBe(elements[0].left + 20)
  })

  it("gives a pasted group its own group id", () => {
    reset([createTextElement(), createTextElement()])
    useEditor.getState().setActiveIds(ids())
    useEditor.getState().groupElements()
    useEditor.getState().copy()
    useEditor.getState().paste()
    const elements = useEditor.getState().currentSlide().elements
    expect(elements[2].groupId).toBe(elements[3].groupId)
    expect(elements[2].groupId).not.toBe(elements[0].groupId)
  })
})

describe("format painter", () => {
  const shapes = () => useEditor.getState().currentSlide().elements as ShapeElement[]

  beforeEach(() => {
    reset([
      createShapeElement("rect", { fill: "#ff0000", outline: { style: "solid", width: 4, color: "#00ff00" } }),
      createShapeElement("ellipse", { fill: "#0000ff" }),
    ])
  })

  it("copies appearance onto another element of the same type", () => {
    const [source, target] = shapes()
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])

    const [, updated] = shapes()
    expect(updated.fill).toBe("#ff0000")
    expect(updated.outline).toMatchObject({ width: 4, color: "#00ff00" })
  })

  it("leaves geometry and identity alone", () => {
    const [source, target] = shapes()
    const before = { left: target.left, top: target.top, width: target.width, id: target.id }
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])

    expect(shapes()[1]).toMatchObject(before)
    // the target keeps its own geometry key too
    expect(shapes()[1].shapeKey).toBe("ellipse")
  })

  it("keeps the target's own words when copying a shape's typography", () => {
    reset([
      createShapeElement("rect", {
        fill: "#ff0000",
        text: { ...createShapeElement("rect").text, content: "源文字", fontSize: 44 },
      }),
      createShapeElement("rect", {
        text: { ...createShapeElement("rect").text, content: "目标文字" },
      }),
    ])
    const [source, target] = shapes()
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])

    expect(shapes()[1].text.content).toBe("目标文字")
    expect(shapes()[1].text.fontSize).toBe(44)
  })

  it("refuses to copy across element types", () => {
    reset([createShapeElement("rect", { fill: "#ff0000" }), createTextElement({ color: "#123456" })])
    const [source, target] = useEditor.getState().currentSlide().elements
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])

    const updated = useEditor.getState().currentSlide().elements[1]
    expect(updated.type === "text" && updated.color).toBe("#123456")
  })

  it("skips locked targets", () => {
    const [source, target] = shapes()
    useEditor.getState().toggleLock([target.id], true)
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])
    expect(shapes()[1].fill).toBe("#0000ff")
  })

  it("does nothing when nothing was picked up", () => {
    const [, target] = shapes()
    useEditor.getState().clearFormatPainter()
    useEditor.getState().applyFormat([target.id])
    expect(shapes()[1].fill).toBe("#0000ff")
  })

  it("can be undone in one step", () => {
    const [source, target] = shapes()
    useEditor.getState().setActiveIds([source.id])
    useEditor.getState().pickUpFormat()
    useEditor.getState().applyFormat([target.id])
    useEditor.getState().undo()
    expect(shapes()[1].fill).toBe("#0000ff")
  })
})

describe("slides", () => {
  it("refuses to delete the last slide", () => {
    useEditor.getState().deleteSlide(0)
    expect(useEditor.getState().slides).toHaveLength(1)
  })

  it("gives a duplicated slide new element ids", () => {
    useEditor.getState().duplicateSlide(0)
    const [first, second] = useEditor.getState().slides
    expect(second.id).not.toBe(first.id)
    expect(second.elements[0].id).not.toBe(first.elements[0].id)
  })

  it("applies one background to every slide", () => {
    useEditor.getState().addSlide()
    useEditor.getState().setSlideIndex(0)
    useEditor.getState().setBackground({ type: "solid", color: "#123456" })
    useEditor.getState().applyBackgroundToAll()
    expect(useEditor.getState().slides.every((s) => s.background.color === "#123456")).toBe(true)
  })

  it("drops animations belonging to a deleted element", () => {
    const [id] = ids()
    useEditor.getState().addAnimation({
      elId: id,
      effect: "fadeIn",
      type: "in",
      duration: 500,
      trigger: "click",
    })
    expect(useEditor.getState().currentSlide().animations).toHaveLength(1)
    useEditor.getState().deleteElements([id])
    expect(useEditor.getState().currentSlide().animations).toHaveLength(0)
  })
})

describe("tables", () => {
  const table = () => useEditor.getState().currentSlide().elements[0] as TableElement

  beforeEach(() => {
    reset([createTableElement(3, 3)])
    useEditor.getState().setActiveIds(ids())
  })

  it("merges a selected range into its top-left cell", () => {
    useEditor.getState().setTableSelection([
      [0, 0],
      [1, 1],
    ])
    useEditor.getState().mergeTableCells()
    expect(table().rows[0][0]).toMatchObject({ colspan: 2, rowspan: 2 })
    expect(table().rows[0][1].merged).toBe(true)
    expect(table().rows[1][1].merged).toBe(true)
    expect(table().rows[0][2].merged).toBeFalsy()
  })

  it("splits a merged cell back apart", () => {
    useEditor.getState().setTableSelection([
      [0, 0],
      [1, 1],
    ])
    useEditor.getState().mergeTableCells()
    useEditor.getState().setTableSelection([
      [0, 0],
      [0, 0],
    ])
    useEditor.getState().splitTableCell()
    expect(table().rows[0][0]).toMatchObject({ colspan: 1, rowspan: 1 })
    expect(table().rows[1][1].merged).toBe(false)
  })

  it("normalises an inverted drag selection", () => {
    useEditor.getState().setTableSelection([
      [1, 1],
      [0, 0],
    ])
    useEditor.getState().mergeTableCells()
    expect(table().rows[0][0].colspan).toBe(2)
  })

  it("inserts and removes rows and columns", () => {
    useEditor.getState().addTableRow()
    expect(table().rows).toHaveLength(4)
    useEditor.getState().addTableColumn()
    expect(table().rows[0]).toHaveLength(4)
    expect(table().colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)

    useEditor.getState().removeTableRow()
    expect(table().rows).toHaveLength(3)
    useEditor.getState().removeTableColumn()
    expect(table().rows[0]).toHaveLength(3)
  })

  it("keeps the column widths the user set when a column is added or removed", () => {
    // an equal-share reset threw away tuned widths every time a column was touched
    useEditor.getState().updateElement(table().id, { colWidths: [0.6, 0.2, 0.2] } as never)

    useEditor.getState().addTableColumn(3)
    expect(table().colWidths).toHaveLength(4)
    expect(table().colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    // the first column is still the widest, and still three times the second
    expect(table().colWidths[0]).toBeGreaterThan(table().colWidths[1])
    expect(table().colWidths[0] / table().colWidths[1]).toBeCloseTo(3)

    useEditor.getState().setTableSelection([
      [0, 3],
      [0, 3],
    ])
    useEditor.getState().removeTableColumn()
    expect(table().colWidths).toHaveLength(3)
    expect(table().colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(table().colWidths[0]).toBeCloseTo(0.6)
  })

  /**
   * Deleting the row or column an anchor sat in used to leave its `merged` neighbours
   * pointing at nothing. The renderer skips a cell that claims to be covered, so the table
   * came back a cell short per row with no way to get it back.
   */
  it("frees cells whose merge anchor was deleted", () => {
    useEditor.getState().setTableSelection([
      [0, 0],
      [1, 1],
    ])
    useEditor.getState().mergeTableCells()
    expect(table().rows[1][1].merged).toBe(true)

    // remove the row holding the anchor
    useEditor.getState().setTableSelection([
      [0, 0],
      [0, 0],
    ])
    useEditor.getState().removeTableRow()

    expect(table().rows).toHaveLength(2)
    for (const row of table().rows) {
      for (const cell of row) expect(cell.merged).toBeFalsy()
    }
    // and every row still has a full set of cells to render
    expect(table().rows.every((row) => row.filter((c) => !c.merged).length === 3)).toBe(true)
  })

  it("clamps a span that outgrew the grid it was left in", () => {
    useEditor.getState().setTableSelection([
      [1, 1],
      [2, 2],
    ])
    useEditor.getState().mergeTableCells()

    useEditor.getState().setTableSelection([
      [2, 2],
      [2, 2],
    ])
    useEditor.getState().removeTableRow()

    for (const [r, row] of table().rows.entries()) {
      for (const [c, cell] of row.entries()) {
        expect(r + cell.rowspan).toBeLessThanOrEqual(table().rows.length)
        expect(c + cell.colspan).toBeLessThanOrEqual(row.length)
      }
    }
  })

  it("never removes the last row or column", () => {
    reset([createTableElement(1, 1)])
    useEditor.getState().setActiveIds(ids())
    useEditor.getState().removeTableRow()
    useEditor.getState().removeTableColumn()
    expect(table().rows).toHaveLength(1)
    expect(table().rows[0]).toHaveLength(1)
  })
})

describe("applyRemote", () => {
  /** A stored deck of `count` slides, standing in for one written by another writer. */
  const remote = (count: number) => ({
    ...createDeck(),
    slides: Array.from({ length: count }, () => createSlide({ elements: [] })),
  })

  it("holds the reader's place instead of jumping to the first slide", () => {
    useEditor.getState().loadDeck(remote(5))
    useEditor.getState().setSlideIndex(3)

    useEditor.getState().applyRemote(remote(5))

    expect(useEditor.getState().slideIndex).toBe(3)
  })

  it("clamps the held position when the incoming deck is shorter", () => {
    useEditor.getState().loadDeck(remote(6))
    useEditor.getState().setSlideIndex(5)

    useEditor.getState().applyRemote(remote(2))

    expect(useEditor.getState().slideIndex).toBe(1)
  })

  it("drops a selection that referred to the replaced document", () => {
    reset()
    useEditor.getState().setActiveIds(ids())
    expect(useEditor.getState().activeIds).not.toHaveLength(0)

    useEditor.getState().applyRemote(remote(1))

    expect(useEditor.getState().activeIds).toEqual([])
    expect(useEditor.getState().editingId).toBeNull()
  })

  it("drops undo history, which described a document that is gone", () => {
    reset()
    useEditor.getState().deleteElements(ids())
    expect(useEditor.getState().past).not.toHaveLength(0)

    useEditor.getState().applyRemote(remote(1))

    expect(useEditor.getState().past).toEqual([])
    expect(useEditor.getState().future).toEqual([])
  })
})
