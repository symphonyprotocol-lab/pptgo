"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlignEndHorizontal,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignVerticalJustifyCenter,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BringToFront,
  Check,
  Copy,
  Download,
  Grid3x3,
  Group,
  Image as ImageIcon,
  Loader2,
  Minus,
  Music,
  Paintbrush,
  Pencil,
  Play,
  Redo2,
  Ruler as RulerIcon,
  Save,
  Search,
  SendToBack,
  Shapes,
  Sigma,
  Table as TableIcon,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Upload,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoMark } from "@/components/site/logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  createChartElement,
  createFormulaElement,
  createImageElement,
  createMediaElement,
  createTableElement,
  normalizeDeck,
} from "@/lib/factory"
import { downloadDeckJson, exportPptx } from "@/lib/export"
import { exportImages, exportPdf } from "@/lib/export-media"
import { formatBytes, importPptx } from "@/lib/import-pptx"
import { SHAPE_LIST } from "@/lib/shapes"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { MAX_DECK_BYTES } from "@/lib/deck-schema"
import { useT } from "@/lib/i18n/client"
import { useEditor } from "@/store/editor"
import type { DeckLibrary } from "@/lib/deck-storage"
import type { Deck } from "@/types/slides"
import { FindReplace } from "./find-replace"
import { OpenMenu } from "./open-menu"

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="size-8"
          disabled={disabled}
          // the label lives in a tooltip, which is portalled and only exists while
          // hovered — so without this the whole toolbar is unnamed buttons to a screen
          // reader, and `aria-pressed` is what makes the toggles' state audible
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * What a single inserted file may weigh. Everything embeds as a base64 data URI inside the
 * deck document, so these are budgets against `MAX_DECK_BYTES` — and the point of checking
 * here is that the alternative was letting someone drop in a 200MB video, work for twenty
 * minutes, and be told at the first autosave that none of it could be kept.
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_MEDIA_BYTES = 20 * 1024 * 1024
/**
 * A whole document rather than one asset, so it is the document ceiling itself. Holding a
 * lower number here refused files the app could store, and refused them by name — a 45MB
 * deck was turned away by the editor rather than by anything that knew what the limit was.
 */
const MAX_DECK_FILE_BYTES = MAX_DECK_BYTES

/** What the Save button is showing; `saved` is a short acknowledgement, not a resting state. */
export type SaveState = "idle" | "saving" | "saved"

export function Toolbar({
  onPresent,
  backHref = "/",
  library,
  save,
  saveState = "idle",
}: {
  onPresent: () => void
  backHref?: string
  /** the decks this editor can switch between, when its storage keeps any */
  library?: DeckLibrary | null
  /** absent where there is nothing to save to, which hides the button entirely */
  save?: () => void | Promise<void>
  saveState?: SaveState
}) {
  const t = useT()
  const title = useEditor((s) => s.title)
  const activeIds = useEditor((s) => s.activeIds)
  const creating = useEditor((s) => s.creating)
  const showGrid = useEditor((s) => s.showGrid)
  const showRuler = useEditor((s) => s.showRuler)
  const painter = useEditor((s) => s.painter)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const imageInput = useRef<HTMLInputElement>(null)
  const deckInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [finding, setFinding] = useState(false)
  const [shapesOpen, setShapesOpen] = useState(false)
  const [linesOpen, setLinesOpen] = useState(false)

  // ⌘F is handled by the global shortcut hook, which announces it here
  useEffect(() => {
    const open = () => setFinding(true)
    window.addEventListener("pptgo:find", open)
    return () => window.removeEventListener("pptgo:find", open)
  }, [])

  const hasSelection = activeIds.length > 0

  /** True when the file fits; otherwise it says so and the caller stops. */
  const withinLimit = (file: File, limit: number) => {
    if (file.size <= limit) return true
    window.alert(
      t("error.fileTooLarge", {
        name: file.name,
        size: formatBytes(file.size),
        limit: formatBytes(limit),
      }),
    )
    return false
  }

  const onPickImage = (file: File) => {
    if (!withinLimit(file, MAX_IMAGE_BYTES)) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => {
        const ratio = img.width / img.height
        let width = Math.min(img.width, VIEWPORT_WIDTH * 0.6)
        let height = width / ratio
        if (height > VIEWPORT_HEIGHT * 0.8) {
          height = VIEWPORT_HEIGHT * 0.8
          width = height * ratio
        }
        useEditor.getState().addElement(createImageElement(src, width, height))
      }
      img.onerror = () => window.alert(t("error.imageUnreadable"))
      img.src = src
    }
    reader.onerror = () => window.alert(t("error.imageUnreadable"))
    reader.readAsDataURL(file)
  }

  const onPickMedia = (type: "video" | "audio", file: File) => {
    if (!withinLimit(file, MAX_MEDIA_BYTES)) return
    const reader = new FileReader()
    reader.onload = () =>
      useEditor
        .getState()
        .addElement(createMediaElement(type, String(reader.result), { name: file.name }))
    reader.onerror = () => window.alert(t("error.mediaUnreadable"))
    reader.readAsDataURL(file)
  }

  /**
   * Importing replaces the whole document, so the one on screen is filed on the way out —
   * otherwise opening a .pptx to look at it threw away whatever was being edited, with no
   * undo and nothing in the interface to suggest it had happened.
   */
  const replaceDeck = async (deck: Deck) => {
    await library?.archive(useEditor.getState().exportDeck()).catch(() => {})
    useEditor.getState().loadDeck(normalizeDeck(deck, t))
  }

  const onImportDeck = async (file: File) => {
    if (!withinLimit(file, MAX_DECK_FILE_BYTES)) return

    if (file.name.toLowerCase().endsWith(".pptx")) {
      setBusy(t("editor.busyImporting"))
      try {
        await replaceDeck(await importPptx(file, t))
      } catch (error) {
        window.alert(t("error.pptxUnparsable", { message: (error as Error).message }))
      } finally {
        setBusy(null)
      }
      return
    }

    const text = await file.text()
    try {
      const raw = JSON.parse(text) as Deck
      if (!Array.isArray(raw.slides)) throw new Error("no slides")
      await replaceDeck(raw)
    } catch {
      window.alert(t("error.deckUnparsable"))
    }
  }

  const runExport = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    try {
      await task()
    } catch (error) {
      window.alert(t("error.exportFailed", { message: (error as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-background px-3 py-1 lg:h-12 lg:flex-nowrap lg:py-0">
      {/* mark only — the toolbar has no room for the wordmark, and a mark that still
          reads at 18px is the whole reason it is only two shapes */}
      <Link
        href={backHref}
        aria-label={t("editor.back")}
        className="order-1 shrink-0 rounded-md px-1.5 py-1 text-[18px] hover:bg-muted"
      >
        <LogoMark />
      </Link>
      {/*
        The mark beside this links to the same place, but it reads as "home" rather than
        as the way out of a document — so the way back to the deck list was a thing you had
        to already know. Named, and next to the title it belongs to.
      */}
      {backHref !== "/" && (
        <Button asChild variant="ghost" size="sm" className="order-1 shrink-0">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            <span className="hidden lg:inline">{t("site.myDecks")}</span>
          </Link>
        </Button>
      )}
      {library && <OpenMenu library={library} />}
      <Input
        value={title}
        aria-label={t("editor.deckTitle")}
        onChange={(e) => useEditor.getState().setTitle(e.target.value)}
        className="order-2 hidden h-8 w-28 shrink-0 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input focus-visible:border-input sm:block lg:w-36"
      />

      <div className="order-4 flex w-full min-w-0 flex-1 basis-full items-center gap-1 overflow-x-auto [scrollbar-width:none] lg:order-3 lg:w-auto lg:basis-auto [&::-webkit-scrollbar]:hidden">
        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton label={t("editor.undo")} disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label={t("editor.redo")} disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <Redo2 className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label={t("editor.textBox")}
          active={creating?.kind === "text"}
          onClick={() => useEditor.getState().setCreating({ kind: "text" })}
        >
          <Type className="size-4" />
        </IconButton>

        {/* Controlled, because picking a shape has to dismiss the palette: it is anchored
            under the toolbar and overhangs the top-left of the canvas, so leaving it open
            means the very next drag — the one that places the shape you just chose — lands
            on the palette instead of the sheet. */}
        <Popover open={shapesOpen} onOpenChange={setShapesOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={creating?.kind === "shape" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label={t("editor.shapes")}
            >
              <Shapes className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="grid grid-cols-6 gap-1">
              {SHAPE_LIST.map((shape) => (
                <button
                  key={shape.key}
                  title={t(shape.labelKey)}
                  aria-label={t(shape.labelKey)}
                  onClick={() => {
                    useEditor.getState().setCreating({ kind: "shape", shapeKey: shape.key })
                    setShapesOpen(false)
                  }}
                  className="flex size-10 items-center justify-center rounded-md hover:bg-accent"
                >
                  <svg viewBox="0 0 200 200" className="size-6">
                    <path d={shape.path} className="fill-foreground/70" />
                  </svg>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={linesOpen} onOpenChange={setLinesOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={creating?.kind === "line" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label={t("editor.lines")}
            >
              <Minus className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44" align="start">
            <div className="flex flex-col gap-1">
              {(
                [
                  {
                    labelKey: "editor.lineSolid",
                    style: "solid",
                    endCap: "none",
                    icon: <Minus className="size-4" />,
                  },
                  {
                    labelKey: "editor.lineDashed",
                    style: "dashed",
                    endCap: "none",
                    icon: <Minus className="size-4 opacity-50" />,
                  },
                  {
                    labelKey: "editor.lineArrow",
                    style: "solid",
                    endCap: "arrow",
                    icon: <ArrowRight className="size-4" />,
                  },
                ] as const
              ).map((item) => (
                <Button
                  key={item.labelKey}
                  variant="ghost"
                  className="justify-start gap-2"
                  onClick={() => {
                    useEditor
                      .getState()
                      .setCreating({ kind: "line", style: item.style, endCap: item.endCap })
                    setLinesOpen(false)
                  }}
                >
                  {item.icon}
                  {t(item.labelKey)}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <IconButton label={t("editor.insertImage")} onClick={() => imageInput.current?.click()}>
          <ImageIcon className="size-4" />
        </IconButton>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickImage(file)
            e.target.value = ""
          }}
        />

        <IconButton
          label={t("editor.insertTable")}
          onClick={() => useEditor.getState().addElement(createTableElement(3, 3, {}, t))}
        >
          <TableIcon className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.insertChart")}
          onClick={() => useEditor.getState().addElement(createChartElement({}, t))}
        >
          <BarChart3 className="size-4" />
        </IconButton>
        <IconButton label={t("editor.insertVideo")} onClick={() => videoInput.current?.click()}>
          <Video className="size-4" />
        </IconButton>
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickMedia("video", file)
            e.target.value = ""
          }}
        />
        <IconButton label={t("editor.insertAudio")} onClick={() => audioInput.current?.click()}>
          <Music className="size-4" />
        </IconButton>
        <input
          ref={audioInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickMedia("audio", file)
            e.target.value = ""
          }}
        />
        <IconButton
          label={t("editor.insertFormula")}
          onClick={() => useEditor.getState().addElement(createFormulaElement())}
        >
          <Sigma className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.freehand")}
          active={creating?.kind === "pencil"}
          onClick={() => useEditor.getState().setCreating({ kind: "pencil" })}
        >
          <Pencil className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label={t("editor.alignLeft")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("left")}
        >
          <AlignStartHorizontal className="size-4 rotate-90" />
        </IconButton>
        <IconButton
          label={t("editor.alignCenter")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("center")}
        >
          <AlignHorizontalJustifyCenter className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.alignRight")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("right")}
        >
          <AlignEndHorizontal className="size-4 rotate-90" />
        </IconButton>
        <IconButton
          label={t("editor.alignMiddle")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("middle")}
        >
          <AlignVerticalJustifyCenter className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label={t("editor.bringToFront")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().reorder(activeIds, "front")}
        >
          <BringToFront className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.sendToBack")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().reorder(activeIds, "back")}
        >
          <SendToBack className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.group")}
          disabled={activeIds.length < 2}
          onClick={() => useEditor.getState().groupElements()}
        >
          <Group className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.ungroup")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().ungroupElements()}
        >
          <Ungroup className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.duplicate")}
          disabled={!hasSelection}
          onClick={() => {
            const store = useEditor.getState()
            store.copy()
            store.paste()
          }}
        >
          <Copy className="size-4" />
        </IconButton>
        <IconButton
          label={t("editor.delete")}
          disabled={!hasSelection}
          onClick={() => useEditor.getState().deleteElements(activeIds)}
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton label={t("editor.grid")} active={showGrid} onClick={() => useEditor.getState().toggleGrid()}>
          <Grid3x3 className="size-4" />
        </IconButton>
        <IconButton label={t("editor.ruler")} active={showRuler} onClick={() => useEditor.getState().toggleRuler()}>
          <RulerIcon className="size-4" />
        </IconButton>
        <IconButton
          label={painter ? t("editor.formatPainterArmed") : t("editor.formatPainter")}
          active={!!painter}
          disabled={!painter && activeIds.length !== 1}
          onClick={() => {
            const store = useEditor.getState()
            if (painter) store.clearFormatPainter()
            else store.pickUpFormat()
          }}
        >
          <Paintbrush className="size-4" />
        </IconButton>
        <IconButton label={t("editor.findReplace")} onClick={() => setFinding(true)}>
          <Search className="size-4" />
        </IconButton>
      </div>

      <div className="order-3 ml-auto flex shrink-0 items-center gap-1 lg:order-4 lg:ml-0">
      {busy && <span className="shrink-0 text-xs text-muted-foreground">{busy}</span>}

      {/*
        Saving on purpose. The deck autosaves anyway, but that is invisible: this is where
        someone about to close the tab can put the question to rest and watch it answered.
      */}
      {save && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={saveState === "saving"}
          title={t("editor.saveHint")}
          onClick={() => void save()}
        >
          {saveState === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : saveState === "saved" ? (
            <Check className="size-4 text-primary" />
          ) : (
            <Save className="size-4" />
          )}
          {saveState === "saved" ? t("editor.saved") : t("editor.save")}
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => deckInput.current?.click()}
      >
        <Upload className="size-4" /> {t("editor.import")}
      </Button>
      <input
        ref={deckInput}
        type="file"
        accept=".pptx,application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onImportDeck(file)
          e.target.value = ""
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="shrink-0" disabled={!!busy}>
            <Download className="size-4" /> {t("editor.export")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              runExport(t("editor.busyPptx"), () =>
                exportPptx(useEditor.getState().exportDeck(), t),
              )
            }
          >
            {t("editor.exportPptx")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              runExport(t("editor.busyImages"), () =>
                exportImages(useEditor.getState().exportDeck(), t),
              )
            }
          >
            {t("editor.exportPng")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              runExport(t("editor.busyPdf"), () => exportPdf(useEditor.getState().exportDeck()))
            }
          >
            {t("editor.exportPdf")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => downloadDeckJson(useEditor.getState().exportDeck())}>
            {t("editor.exportJson")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" className="shrink-0" onClick={onPresent}>
        <Play className="size-4" /> {t("editor.present")}
      </Button>
      </div>

      {finding && <FindReplace onClose={() => setFinding(false)} />}
    </header>
  )
}
