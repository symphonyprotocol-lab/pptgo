"use client"

import { create } from "zustand"
import { createSlide, newId } from "@/lib/factory"
import { distribute, rotateWithin, scaleWithin, unionBounds, type Box } from "@/lib/geometry"
import { DEFAULT_THEME, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import type {
  Deck,
  DeckTheme,
  ElementAnimation,
  ElementLink,
  Slide,
  SlideBackground,
  SlideElement,
  TableCell,
  TableElement,
  TransitionType,
} from "@/types/slides"

export type CreatingTool =
  | { kind: "text" }
  | { kind: "shape"; shapeKey: string }
  | { kind: "line"; style: "solid" | "dashed"; endCap: "none" | "arrow" }
  | { kind: "pencil" }

interface Snapshot {
  slides: Slide[]
  slideIndex: number
}

const HISTORY_LIMIT: number = 50

export type AlignAction =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "hcenter"
  | "vcenter"

interface EditorState {
  /**
   * Whether `loadDeck` has run, i.e. whether these slides came from storage rather than
   * being the placeholder below.
   *
   * Autosave keys off this. Without it, anything that replaced the store's state with a
   * fresh initial one — a Fast Refresh re-evaluating this module is the way it actually
   * happens — left a mounted editor believing it was still holding the user's deck, and
   * the next autosave wrote one blank slide over it. A flag that resets with the module
   * turns that into doing nothing.
   */
  hydrated: boolean
  title: string
  theme: DeckTheme
  slides: Slide[]
  slideIndex: number
  activeIds: string[]
  editingId: string | null
  /** [[row, col], [row, col]] anchor/focus while editing a table */
  tableSelection: [[number, number], [number, number]] | null
  creating: CreatingTool | null
  canvasScale: number
  showGrid: boolean
  showRuler: boolean
  /** element whose styling the format painter is carrying, if it is armed */
  painter: SlideElement | null
  past: Snapshot[]
  future: Snapshot[]
  clipboard: SlideElement[] | null

  currentSlide: () => Slide
  activeElements: () => SlideElement[]

  setTitle: (title: string) => void
  setTheme: (theme: Partial<DeckTheme>) => void
  loadDeck: (deck: Deck) => void
  /**
   * Replace the document with one that was stored elsewhere — another tab, another
   * device, or eventually an agent writing through the API.
   *
   * Distinct from `loadDeck` in exactly one respect that matters to whoever is watching:
   * it holds the reader's place. Jumping to slide 1 is right when *opening* a deck and
   * wrong when a deck someone is reading gets updated underneath them; being thrown back
   * to the front every time another writer saves would make the deck unreadable while it
   * is being written. Undo history still goes, because it describes edits to a document
   * that is no longer the one on screen.
   */
  applyRemote: (deck: Deck) => void
  /**
   * Swap the whole slide array in place, leaving history and the current position
   * alone. This is what deck-wide edits (find and replace) need: `loadDeck` is for
   * *opening* a deck, so it deliberately drops undo history and jumps to slide 1 —
   * which silently made those edits irreversible when used to apply one.
   */
  setSlides: (slides: Slide[]) => void
  exportDeck: () => Deck

  setSlideIndex: (index: number) => void
  addSlide: (slide?: Slide) => void
  addSlides: (slides: Slide[]) => void
  duplicateSlide: (index: number) => void
  deleteSlide: (index: number) => void
  moveSlide: (from: number, to: number) => void
  setBackground: (background: SlideBackground) => void
  applyBackgroundToAll: () => void
  setNotes: (notes: string) => void
  setTransition: (transition: TransitionType) => void
  setSection: (section: string | undefined) => void

  setActiveIds: (ids: string[]) => void
  toggleActiveId: (id: string) => void
  setEditingId: (id: string | null) => void
  setTableSelection: (selection: [[number, number], [number, number]] | null) => void
  mergeTableCells: () => void
  splitTableCell: () => void
  addTableRow: (at?: number) => void
  addTableColumn: (at?: number) => void
  removeTableRow: () => void
  removeTableColumn: () => void
  setCreating: (creating: CreatingTool | null) => void
  setCanvasScale: (scale: number) => void
  toggleGrid: () => void
  toggleRuler: () => void
  pickUpFormat: () => void
  applyFormat: (ids: string[]) => void
  clearFormatPainter: () => void

  addElement: (element: SlideElement) => void
  addElements: (elements: SlideElement[]) => void
  updateElement: (id: string, patch: Partial<SlideElement>) => void
  updateElements: (patches: { id: string; patch: Partial<SlideElement> }[]) => void
  deleteElements: (ids: string[]) => void
  reorder: (ids: string[], action: "front" | "back" | "forward" | "backward") => void
  setElementIndex: (id: string, index: number) => void
  alignElements: (align: AlignAction) => void
  distributeElements: (axis: "h" | "v") => void
  groupElements: () => void
  ungroupElements: () => void
  toggleLock: (ids: string[], lock?: boolean) => void
  setLink: (id: string, link: ElementLink | undefined) => void
  /** Scale the current selection so its bounds move from `from` to `to`. */
  transformSelection: (from: Box, to: Box) => void
  rotateSelection: (centre: [number, number], delta: number) => void

  addAnimation: (animation: Omit<ElementAnimation, "id">) => void
  updateAnimation: (id: string, patch: Partial<ElementAnimation>) => void
  removeAnimation: (id: string) => void
  moveAnimation: (from: number, to: number) => void

  copy: () => void
  cut: () => void
  paste: () => void

  commit: () => void
  undo: () => void
  redo: () => void
}

const clone = <T,>(value: T): T =>
  typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value))

/**
 * One blank slide, not the starter deck. The store is module scope, where there is no
 * request and therefore no language — building the sample deck here meant its wording was
 * fixed at import time, and every reader saw a frame of it before `EditorShell` replaced
 * it with the same deck in their own language. The shell now builds it, and this is just
 * something valid for `currentSlide()` to return in the meantime.
 */
const initial: Pick<Deck, "title" | "theme" | "slides"> = {
  title: "",
  theme: DEFAULT_THEME,
  slides: [createSlide()],
}

/** Applies `fn` to the slide currently being edited, leaving the others untouched. */
const mapCurrent = (slides: Slide[], index: number, fn: (slide: Slide) => Slide) =>
  slides.map((slide, i) => (i === index ? fn(slide) : slide))

/** The table the table-specific actions operate on — whichever one is selected. */
function selectedTable(get: () => EditorState): TableElement | null {
  const state = get()
  const id = state.editingId ?? state.activeIds[0]
  const element = state.currentSlide().elements.find((el) => el.id === id)
  return element?.type === "table" ? element : null
}

/**
 * The subset of an element the format painter carries: appearance only. Position, size,
 * rotation, content, links and lock state stay with the target.
 */
function styleOf(source: SlideElement): Partial<SlideElement> {
  const shared = { opacity: source.opacity }

  switch (source.type) {
    case "text":
      return {
        ...shared,
        fontFamily: source.fontFamily,
        fontSize: source.fontSize,
        color: source.color,
        bold: source.bold,
        italic: source.italic,
        underline: source.underline,
        strikethrough: source.strikethrough,
        align: source.align,
        vertical: source.vertical,
        lineHeight: source.lineHeight,
        letterSpacing: source.letterSpacing,
        paragraphSpacing: source.paragraphSpacing,
        padding: source.padding,
        fill: source.fill,
        outline: source.outline && { ...source.outline },
        shadow: source.shadow && { ...source.shadow },
      } as Partial<SlideElement>
    case "shape":
      return {
        ...shared,
        fill: source.fill,
        gradient: source.gradient && { ...source.gradient, stops: [...source.gradient.stops] },
        outline: source.outline && { ...source.outline },
        shadow: source.shadow && { ...source.shadow },
        // the target keeps its own words, but takes the source's typography
        text: { ...source.text, content: "" },
      } as Partial<SlideElement>
    case "image":
      return {
        ...shared,
        filter: { ...source.filter },
        radius: source.radius,
        colorMask: source.colorMask,
        outline: source.outline && { ...source.outline },
        shadow: source.shadow && { ...source.shadow },
      } as Partial<SlideElement>
    case "line":
      return {
        ...shared,
        color: source.color,
        style: source.style,
        strokeWidth: source.strokeWidth,
        startCap: source.startCap,
        endCap: source.endCap,
      } as Partial<SlideElement>
    case "table":
      return {
        ...shared,
        theme: { ...source.theme },
        outline: { ...source.outline },
        fontFamily: source.fontFamily,
        fontSize: source.fontSize,
      } as Partial<SlideElement>
    case "chart":
      return {
        ...shared,
        themeColors: [...source.themeColors],
        gridColor: source.gridColor,
        textColor: source.textColor,
        showLegend: source.showLegend,
        showGrid: source.showGrid,
        showValue: source.showValue,
      } as Partial<SlideElement>
    case "formula":
      return { ...shared, color: source.color } as Partial<SlideElement>
    default:
      return shared as Partial<SlideElement>
  }
}

/**
 * Applying a shape's format must not wipe the target's own text, so the copied
 * typography is merged onto whatever the target already says.
 */
export function mergeStyle(target: SlideElement, style: Partial<SlideElement>): Partial<SlideElement> {
  if (target.type !== "shape") return style
  const incoming = (style as Partial<Extract<SlideElement, { type: "shape" }>>).text
  if (!incoming) return style
  return { ...style, text: { ...incoming, content: target.text.content } } as Partial<SlideElement>
}

/**
 * Column widths after inserting one, and after removing one.
 *
 * Both used to reset every column to an equal share, so adding a column to a table whose
 * widths had been tuned threw that work away. The new column takes an average share and
 * the rest are rescaled to keep their proportions; a removed column's share is given back
 * to the others in the same way.
 */
function insertColumnWidth(widths: number[], at: number, count: number): number[] {
  if (widths.length !== count) return Array.from({ length: count + 1 }, () => 1 / (count + 1))
  const share = 1 / (count + 1)
  const next = widths.map((w) => w * (1 - share))
  next.splice(at, 0, share)
  return next
}

function removeColumnWidth(widths: number[], at: number, count: number): number[] {
  if (widths.length !== count) return Array.from({ length: count - 1 }, () => 1 / (count - 1))
  const rest = widths.filter((_, i) => i !== at)
  const total = rest.reduce((sum, w) => sum + w, 0)
  return total > 0 ? rest.map((w) => w / total) : rest.map(() => 1 / rest.length)
}

/**
 * Clamps every span to the grid that is actually left, and frees cells whose anchor is
 * gone.
 *
 * Deleting the row or column an anchor sat in used to leave its `merged` neighbours
 * pointing at nothing: the renderer skipped them because they claimed to be covered, and
 * nothing covered them any more, so the table came back a cell short per row.
 */
function repairSpans(rows: TableCell[][]): TableCell[][] {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const covered = rows.map((row) => row.map(() => false))

  const repaired = rows.map((row, r) =>
    row.map((cell, c) => {
      const colspan = Math.max(1, Math.min(cell.colspan ?? 1, width - c))
      const rowspan = Math.max(1, Math.min(cell.rowspan ?? 1, height - r))
      return { ...cell, colspan, rowspan }
    }),
  )

  // mark what each surviving anchor covers
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const cell = repaired[r][c]
      if (cell.merged) continue
      for (let dr = 0; dr < cell.rowspan; dr += 1) {
        for (let dc = 0; dc < cell.colspan; dc += 1) {
          if (dr || dc) covered[r + dr][c + dc] = true
        }
      }
    }
  }

  return repaired.map((row, r) =>
    row.map((cell, c) =>
      cell.merged && !covered[r][c] ? { ...cell, merged: false, colspan: 1, rowspan: 1 } : cell,
    ),
  )
}

/** Orders an anchor/focus pair into top-left / bottom-right. */
function normalizedRange(
  selection: [[number, number], [number, number]] | null,
): [[number, number], [number, number]] | null {
  if (!selection) return null
  const [[r1, c1], [r2, c2]] = selection
  return [
    [Math.min(r1, r2), Math.min(c1, c2)],
    [Math.max(r1, r2), Math.max(c1, c2)],
  ]
}

export const useEditor = create<EditorState>((set, get) => ({
  hydrated: false,
  title: initial.title,
  theme: initial.theme,
  slides: initial.slides,
  slideIndex: 0,
  activeIds: [],
  editingId: null,
  tableSelection: null,
  creating: null,
  canvasScale: 1,
  showGrid: false,
  showRuler: false,
  painter: null,
  past: [],
  future: [],
  clipboard: null,

  currentSlide: () => {
    const { slides, slideIndex } = get()
    return slides[Math.min(slideIndex, slides.length - 1)]
  },
  activeElements: () => {
    const slide = get().currentSlide()
    const ids = new Set(get().activeIds)
    return slide.elements.filter((el) => ids.has(el.id))
  },

  setTitle: (title) => set({ title }),
  setTheme: (theme) => set((s) => ({ theme: { ...s.theme, ...theme } })),

  loadDeck: (deck) =>
    set({
      hydrated: true,
      title: deck.title,
      theme: deck.theme,
      slides: deck.slides,
      slideIndex: 0,
      activeIds: [],
      editingId: null,
      past: [],
      future: [],
    }),

  applyRemote: (deck) =>
    set((s) => ({
      hydrated: true,
      title: deck.title,
      theme: deck.theme,
      slides: deck.slides,
      // the incoming deck may be shorter than the one on screen, so the held position is
      // clamped rather than trusted
      slideIndex: Math.max(0, Math.min(s.slideIndex, deck.slides.length - 1)),
      // the selection referred to elements of the replaced document; keeping ids that may
      // no longer exist would leave the property panel editing nothing
      activeIds: [],
      editingId: null,
      tableSelection: null,
      past: [],
      future: [],
    })),

  setSlides: (slides) =>
    set((s) => ({
      slides,
      // a deck-wide edit never changes the slide count, but clamp anyway so this stays
      // safe for any future caller
      slideIndex: Math.max(0, Math.min(s.slideIndex, slides.length - 1)),
    })),

  exportDeck: () => {
    const { title, theme, slides } = get()
    return { version: 1, title, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, theme, slides }
  },

  setSlideIndex: (index) =>
    set((s) => ({
      slideIndex: Math.max(0, Math.min(index, s.slides.length - 1)),
      activeIds: [],
      editingId: null,
    })),

  addSlide: (slide) => {
    get().commit()
    set((s) => {
      const slides = [...s.slides]
      slides.splice(s.slideIndex + 1, 0, slide ?? createSlide())
      return { slides, slideIndex: s.slideIndex + 1, activeIds: [], editingId: null }
    })
  },

  addSlides: (incoming) => {
    if (!incoming.length) return
    get().commit()
    set((s) => {
      const slides = [...s.slides]
      slides.splice(s.slideIndex + 1, 0, ...incoming)
      return { slides, slideIndex: s.slideIndex + 1, activeIds: [], editingId: null }
    })
  },

  duplicateSlide: (index) => {
    get().commit()
    set((s) => {
      const copy = clone(s.slides[index])
      copy.id = newId()
      const idMap = new Map<string, string>()
      copy.elements = copy.elements.map((el) => {
        const id = newId()
        idMap.set(el.id, id)
        return { ...el, id }
      })
      copy.animations = (copy.animations ?? [])
        .filter((a) => idMap.has(a.elId))
        .map((a) => ({ ...a, id: newId(), elId: idMap.get(a.elId)! }))
      const slides = [...s.slides]
      slides.splice(index + 1, 0, copy)
      return { slides, slideIndex: index + 1, activeIds: [] }
    })
  },

  deleteSlide: (index) => {
    if (get().slides.length <= 1) return
    get().commit()
    set((s) => {
      const slides = s.slides.filter((_, i) => i !== index)
      return {
        slides,
        slideIndex: Math.max(0, Math.min(s.slideIndex, slides.length - 1)),
        activeIds: [],
      }
    })
  },

  moveSlide: (from, to) => {
    if (from === to) return
    get().commit()
    set((s) => {
      const slides = [...s.slides]
      const [moved] = slides.splice(from, 1)
      slides.splice(to, 0, moved)
      return { slides, slideIndex: to }
    })
  },

  setBackground: (background) => {
    get().commit()
    set((s) => ({ slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({ ...sl, background })) }))
  },

  applyBackgroundToAll: () => {
    get().commit()
    set((s) => {
      const background = clone(s.slides[s.slideIndex].background)
      return { slides: s.slides.map((sl) => ({ ...sl, background: clone(background) })) }
    })
  },

  setNotes: (notes) => {
    get().commit()
    set((s) => ({ slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({ ...sl, notes })) }))
  },

  setTransition: (transition) => {
    get().commit()
    set((s) => ({ slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({ ...sl, transition })) }))
  },

  setSection: (section) => {
    get().commit()
    set((s) => ({ slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({ ...sl, section })) }))
  },

  setActiveIds: (ids) => set({ activeIds: ids }),
  toggleActiveId: (id) =>
    set((s) => ({
      activeIds: s.activeIds.includes(id)
        ? s.activeIds.filter((x) => x !== id)
        : [...s.activeIds, id],
    })),
  setEditingId: (editingId) => set({ editingId, tableSelection: null }),
  setTableSelection: (tableSelection) => set({ tableSelection }),

  mergeTableCells: () => {
    const table = selectedTable(get)
    const range = normalizedRange(get().tableSelection)
    if (!table || !range) return
    const [[r1, c1], [r2, c2]] = range
    if (r1 === r2 && c1 === c2) return
    get().commit()
    const rows = table.rows.map((row, r) =>
      row.map((cell, c) => {
        if (r === r1 && c === c1) {
          return { ...cell, colspan: c2 - c1 + 1, rowspan: r2 - r1 + 1, merged: false }
        }
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) {
          return { ...cell, colspan: 1, rowspan: 1, merged: true }
        }
        return cell
      }),
    )
    get().updateElement(table.id, { rows } as Partial<SlideElement>)
    set({ tableSelection: [[r1, c1], [r1, c1]] })
  },

  splitTableCell: () => {
    const table = selectedTable(get)
    const range = normalizedRange(get().tableSelection)
    if (!table || !range) return
    const [[r1, c1]] = range
    const anchor = table.rows[r1]?.[c1]
    if (!anchor || (anchor.colspan === 1 && anchor.rowspan === 1)) return
    get().commit()
    const rows = table.rows.map((row, r) =>
      row.map((cell, c) => {
        if (r === r1 && c === c1) return { ...cell, colspan: 1, rowspan: 1, merged: false }
        if (
          r >= r1 &&
          r < r1 + anchor.rowspan &&
          c >= c1 &&
          c < c1 + anchor.colspan
        ) {
          return { ...cell, merged: false }
        }
        return cell
      }),
    )
    get().updateElement(table.id, { rows } as Partial<SlideElement>)
  },

  addTableRow: (at) => {
    const table = selectedTable(get)
    if (!table) return
    get().commit()
    const index = at ?? (normalizedRange(get().tableSelection)?.[1][0] ?? table.rows.length - 1) + 1
    const width = table.rows[0]?.length ?? 1
    const blank = Array.from({ length: width }, () => ({ text: "", colspan: 1, rowspan: 1 }))
    const rows = [...table.rows]
    rows.splice(Math.max(0, Math.min(index, rows.length)), 0, blank)
    get().updateElement(table.id, {
      rows,
      height: table.height + table.height / Math.max(1, table.rows.length),
    } as Partial<SlideElement>)
  },

  addTableColumn: (at) => {
    const table = selectedTable(get)
    if (!table) return
    get().commit()
    const count = table.rows[0]?.length ?? 1
    const index = at ?? (normalizedRange(get().tableSelection)?.[1][1] ?? count - 1) + 1
    const clamped = Math.max(0, Math.min(index, count))
    const rows = table.rows.map((row) => {
      const next = [...row]
      next.splice(clamped, 0, { text: "", colspan: 1, rowspan: 1 })
      return next
    })
    get().updateElement(table.id, {
      rows,
      colWidths: insertColumnWidth(table.colWidths, clamped, count),
    } as Partial<SlideElement>)
  },

  removeTableRow: () => {
    const table = selectedTable(get)
    const range = normalizedRange(get().tableSelection)
    if (!table || table.rows.length <= 1) return
    const index = range?.[0][0] ?? table.rows.length - 1
    get().commit()
    const rows = repairSpans(table.rows.filter((_, r) => r !== index))
    get().updateElement(table.id, { rows } as Partial<SlideElement>)
    set({ tableSelection: null })
  },

  removeTableColumn: () => {
    const table = selectedTable(get)
    const range = normalizedRange(get().tableSelection)
    const count = table?.rows[0]?.length ?? 0
    if (!table || count <= 1) return
    const index = range?.[0][1] ?? count - 1
    get().commit()
    const rows = repairSpans(table.rows.map((row) => row.filter((_, c) => c !== index)))
    get().updateElement(table.id, {
      rows,
      colWidths: removeColumnWidth(table.colWidths, index, count),
    } as Partial<SlideElement>)
    set({ tableSelection: null })
  },

  setCreating: (creating) => set({ creating, activeIds: [], editingId: null }),
  setCanvasScale: (canvasScale) => set({ canvasScale: Math.max(0.2, Math.min(4, canvasScale)) }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleRuler: () => set((s) => ({ showRuler: !s.showRuler })),

  pickUpFormat: () => {
    const [source] = get().activeElements()
    set({ painter: source ? clone(source) : null })
  },

  /**
   * Copies look, not content or geometry, and only between elements that share a type —
   * a text box's font means nothing to a chart.
   */
  applyFormat: (ids) => {
    const source = get().painter
    if (!source || !ids.length) return
    const slide = get().currentSlide()
    const patches = slide.elements
      .filter((el) => ids.includes(el.id) && el.type === source.type && !el.lock)
      .map((el) => ({ id: el.id, patch: mergeStyle(el, styleOf(source)) }))
    if (!patches.length) return
    get().commit()
    get().updateElements(patches)
  },

  clearFormatPainter: () => set({ painter: null }),

  addElement: (element) => get().addElements([element]),

  addElements: (elements) => {
    if (!elements.length) return
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        elements: [...sl.elements, ...elements],
      })),
      activeIds: elements.map((el) => el.id),
      editingId: null,
    }))
  },

  updateElement: (id, patch) => get().updateElements([{ id, patch }]),

  updateElements: (patches) => {
    if (!patches.length) return
    const map = new Map(patches.map((p) => [p.id, p.patch]))
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        elements: sl.elements.map((el) =>
          map.has(el.id) ? ({ ...el, ...map.get(el.id) } as SlideElement) : el,
        ),
      })),
    }))
  },

  deleteElements: (ids) => {
    if (!ids.length) return
    get().commit()
    const doomed = new Set(ids)
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        elements: sl.elements.filter((el) => !doomed.has(el.id)),
        animations: (sl.animations ?? []).filter((a) => !doomed.has(a.elId)),
      })),
      activeIds: [],
      editingId: null,
    }))
  },

  reorder: (ids, action) => {
    if (!ids.length) return
    get().commit()
    const moving = new Set(ids)
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => {
        const picked = sl.elements.filter((el) => moving.has(el.id))
        const rest = sl.elements.filter((el) => !moving.has(el.id))
        if (!picked.length) return sl

        if (action === "front") return { ...sl, elements: [...rest, ...picked] }
        if (action === "back") return { ...sl, elements: [...picked, ...rest] }

        // step a contiguous run one position past its nearest outside neighbour
        const elements = [...sl.elements]
        const indices = elements.reduce<number[]>((acc, el, i) => {
          if (moving.has(el.id)) acc.push(i)
          return acc
        }, [])
        if (action === "forward") {
          const top = indices[indices.length - 1]
          if (top >= elements.length - 1) return sl
          const [neighbour] = elements.splice(top + 1, 1)
          elements.splice(indices[0], 0, neighbour)
        } else {
          const bottom = indices[0]
          if (bottom <= 0) return sl
          const [neighbour] = elements.splice(bottom - 1, 1)
          elements.splice(indices[indices.length - 1], 0, neighbour)
        }
        return { ...sl, elements }
      }),
    }))
  },

  setElementIndex: (id, index) => {
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => {
        const elements = [...sl.elements]
        const from = elements.findIndex((el) => el.id === id)
        if (from < 0) return sl
        const [el] = elements.splice(from, 1)
        elements.splice(Math.max(0, Math.min(index, elements.length)), 0, el)
        return { ...sl, elements }
      }),
    }))
  },

  alignElements: (align) => {
    const elements = get().activeElements().filter((el) => !el.lock)
    if (!elements.length) return
    get().commit()
    const multi = elements.length > 1
    const bounds = multi
      ? unionBounds(elements)!
      : { left: 0, top: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }

    const patches = elements.map((el) => {
      switch (align) {
        case "left":
          return { id: el.id, patch: { left: bounds.left } }
        case "right":
          return { id: el.id, patch: { left: bounds.left + bounds.width - el.width } }
        case "center":
        case "hcenter":
          return { id: el.id, patch: { left: bounds.left + (bounds.width - el.width) / 2 } }
        case "top":
          return { id: el.id, patch: { top: bounds.top } }
        case "bottom":
          return { id: el.id, patch: { top: bounds.top + bounds.height - el.height } }
        default:
          return { id: el.id, patch: { top: bounds.top + (bounds.height - el.height) / 2 } }
      }
    })
    get().updateElements(patches)
  },

  distributeElements: (axis) => {
    const elements = get().activeElements().filter((el) => !el.lock)
    const patches = distribute(elements, axis)
    if (!patches.length) return
    get().commit()
    get().updateElements(patches as { id: string; patch: Partial<SlideElement> }[])
  },

  groupElements: () => {
    const elements = get().activeElements()
    if (elements.length < 2) return
    get().commit()
    const groupId = newId()
    get().updateElements(elements.map((el) => ({ id: el.id, patch: { groupId } })))
  },

  ungroupElements: () => {
    const elements = get().activeElements()
    if (!elements.some((el) => el.groupId)) return
    get().commit()
    get().updateElements(elements.map((el) => ({ id: el.id, patch: { groupId: undefined } })))
  },

  toggleLock: (ids, lock) => {
    if (!ids.length) return
    get().commit()
    const slide = get().currentSlide()
    const current = new Map(slide.elements.map((el) => [el.id, el]))
    get().updateElements(
      ids.map((id) => ({ id, patch: { lock: lock ?? !current.get(id)?.lock } })),
    )
  },

  setLink: (id, link) => {
    get().commit()
    get().updateElement(id, { link })
  },

  transformSelection: (from, to) => {
    const elements = get().activeElements().filter((el) => !el.lock)
    if (!elements.length) return
    get().updateElements(
      elements.map((el) => ({ id: el.id, patch: scaleWithin(el, from, to) as Partial<SlideElement> })),
    )
  },

  rotateSelection: (centre, delta) => {
    const elements = get().activeElements().filter((el) => !el.lock)
    if (!elements.length) return
    get().updateElements(
      elements.map((el) => ({
        id: el.id,
        patch: rotateWithin(el, centre, delta) as Partial<SlideElement>,
      })),
    )
  },

  addAnimation: (animation) => {
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        animations: [...(sl.animations ?? []), { ...animation, id: newId() }],
      })),
    }))
  },

  updateAnimation: (id, patch) => {
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        animations: (sl.animations ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    }))
  },

  removeAnimation: (id) => {
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        animations: (sl.animations ?? []).filter((a) => a.id !== id),
      })),
    }))
  },

  moveAnimation: (from, to) => {
    if (from === to) return
    get().commit()
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => {
        const animations = [...(sl.animations ?? [])]
        if (from < 0 || from >= animations.length || to < 0 || to >= animations.length) return sl
        const [moved] = animations.splice(from, 1)
        animations.splice(to, 0, moved)
        return { ...sl, animations }
      }),
    }))
  },

  copy: () => {
    const elements = get().activeElements()
    if (elements.length) set({ clipboard: clone(elements) })
  },

  cut: () => {
    const elements = get().activeElements()
    if (!elements.length) return
    set({ clipboard: clone(elements) })
    get().deleteElements(elements.map((el) => el.id))
  },

  paste: () => {
    const clipboard = get().clipboard
    if (!clipboard?.length) return
    get().commit()
    const groupRemap = new Map<string, string>()
    const copies = clipboard.map((el) => {
      const copy = clone(el)
      copy.id = newId()
      copy.left += 20
      copy.top += 20
      if (copy.groupId) {
        if (!groupRemap.has(copy.groupId)) groupRemap.set(copy.groupId, newId())
        copy.groupId = groupRemap.get(copy.groupId)
      }
      return copy
    })
    set((s) => ({
      slides: mapCurrent(s.slides, s.slideIndex, (sl) => ({
        ...sl,
        elements: [...sl.elements, ...copies],
      })),
      activeIds: copies.map((c) => c.id),
      clipboard: clone(copies),
    }))
  },

  commit: () =>
    set((s) => ({
      past: [...s.past, { slides: clone(s.slides), slideIndex: s.slideIndex }].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1]
      if (!previous) return s
      return {
        past: s.past.slice(0, -1),
        future: [{ slides: clone(s.slides), slideIndex: s.slideIndex }, ...s.future].slice(
          0,
          HISTORY_LIMIT,
        ),
        slides: previous.slides,
        slideIndex: Math.min(previous.slideIndex, previous.slides.length - 1),
        activeIds: [],
        editingId: null,
      }
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0]
      if (!next) return s
      return {
        future: s.future.slice(1),
        past: [...s.past, { slides: clone(s.slides), slideIndex: s.slideIndex }].slice(
          -HISTORY_LIMIT,
        ),
        slides: next.slides,
        slideIndex: Math.min(next.slideIndex, next.slides.length - 1),
        activeIds: [],
        editingId: null,
      }
    }),
}))
