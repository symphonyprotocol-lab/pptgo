"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlignEndHorizontal,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignVerticalJustifyCenter,
  ArrowRight,
  BarChart3,
  BringToFront,
  Copy,
  Download,
  Grid3x3,
  Group,
  Image as ImageIcon,
  Minus,
  Music,
  Paintbrush,
  Pencil,
  Play,
  Redo2,
  Ruler as RulerIcon,
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
import { importPptx } from "@/lib/import-pptx"
import { SHAPE_LIST } from "@/lib/shapes"
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "@/lib/constants"
import { useEditor } from "@/store/editor"
import type { Deck } from "@/types/slides"
import { FindReplace } from "./find-replace"

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

export function Toolbar({
  onPresent,
  backHref = "/",
}: {
  onPresent: () => void
  backHref?: string
}) {
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

  const onPickImage = (file: File) => {
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
      img.onerror = () => window.alert("这张图片无法读取")
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const onPickMedia = (type: "video" | "audio", file: File) => {
    const reader = new FileReader()
    reader.onload = () =>
      useEditor
        .getState()
        .addElement(createMediaElement(type, String(reader.result), { name: file.name }))
    reader.onerror = () => window.alert("这个文件无法读取")
    reader.readAsDataURL(file)
  }

  const onImportDeck = async (file: File) => {
    if (file.name.toLowerCase().endsWith(".pptx")) {
      setBusy("正在解析 PPTX…")
      try {
        const deck = await importPptx(file)
        useEditor.getState().loadDeck(normalizeDeck(deck))
      } catch (error) {
        window.alert(`无法解析该 PPTX：${(error as Error).message}`)
      } finally {
        setBusy(null)
      }
      return
    }

    const text = await file.text()
    try {
      const raw = JSON.parse(text) as Deck
      if (!Array.isArray(raw.slides)) throw new Error("缺少 slides")
      useEditor.getState().loadDeck(normalizeDeck(raw))
    } catch {
      window.alert("无法解析该文件，请选择 .pptx 或由 PPTGo 导出的 .pptgo.json")
    }
  }

  const runExport = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    try {
      await task()
    } catch (error) {
      window.alert(`导出失败：${(error as Error).message}`)
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
        aria-label="返回"
        className="order-1 shrink-0 rounded-md px-1.5 py-1 text-[18px] hover:bg-muted"
      >
        <LogoMark />
      </Link>
      <Input
        value={title}
        onChange={(e) => useEditor.getState().setTitle(e.target.value)}
        className="order-2 hidden h-8 w-28 shrink-0 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input focus-visible:border-input sm:block lg:w-36"
      />

      <div className="order-4 flex w-full min-w-0 flex-1 basis-full items-center gap-1 overflow-x-auto [scrollbar-width:none] lg:order-3 lg:w-auto lg:basis-auto [&::-webkit-scrollbar]:hidden">
        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton label="撤销 (⌘Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="重做 (⌘⇧Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <Redo2 className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label="文本框"
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
              aria-label="形状"
            >
              <Shapes className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="grid grid-cols-6 gap-1">
              {SHAPE_LIST.map((shape) => (
                <button
                  key={shape.key}
                  title={shape.label}
                  aria-label={shape.label}
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
              aria-label="线条"
            >
              <Minus className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44" align="start">
            <div className="flex flex-col gap-1">
              {(
                [
                  { label: "直线", style: "solid", endCap: "none", icon: <Minus className="size-4" /> },
                  {
                    label: "虚线",
                    style: "dashed",
                    endCap: "none",
                    icon: <Minus className="size-4 opacity-50" />,
                  },
                  {
                    label: "箭头",
                    style: "solid",
                    endCap: "arrow",
                    icon: <ArrowRight className="size-4" />,
                  },
                ] as const
              ).map((item) => (
                <Button
                  key={item.label}
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
                  {item.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <IconButton label="插入图片" onClick={() => imageInput.current?.click()}>
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
          label="插入表格"
          onClick={() => useEditor.getState().addElement(createTableElement())}
        >
          <TableIcon className="size-4" />
        </IconButton>
        <IconButton
          label="插入图表"
          onClick={() => useEditor.getState().addElement(createChartElement())}
        >
          <BarChart3 className="size-4" />
        </IconButton>
        <IconButton label="插入视频" onClick={() => videoInput.current?.click()}>
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
        <IconButton label="插入音频" onClick={() => audioInput.current?.click()}>
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
          label="插入公式"
          onClick={() => useEditor.getState().addElement(createFormulaElement())}
        >
          <Sigma className="size-4" />
        </IconButton>
        <IconButton
          label="自由绘制"
          active={creating?.kind === "pencil"}
          onClick={() => useEditor.getState().setCreating({ kind: "pencil" })}
        >
          <Pencil className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label="左对齐"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("left")}
        >
          <AlignStartHorizontal className="size-4 rotate-90" />
        </IconButton>
        <IconButton
          label="水平居中"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("center")}
        >
          <AlignHorizontalJustifyCenter className="size-4" />
        </IconButton>
        <IconButton
          label="右对齐"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("right")}
        >
          <AlignEndHorizontal className="size-4 rotate-90" />
        </IconButton>
        <IconButton
          label="垂直居中"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().alignElements("middle")}
        >
          <AlignVerticalJustifyCenter className="size-4" />
        </IconButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <IconButton
          label="置于顶层"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().reorder(activeIds, "front")}
        >
          <BringToFront className="size-4" />
        </IconButton>
        <IconButton
          label="置于底层"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().reorder(activeIds, "back")}
        >
          <SendToBack className="size-4" />
        </IconButton>
        <IconButton
          label="组合 (⌘G)"
          disabled={activeIds.length < 2}
          onClick={() => useEditor.getState().groupElements()}
        >
          <Group className="size-4" />
        </IconButton>
        <IconButton
          label="取消组合 (⌘⇧G)"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().ungroupElements()}
        >
          <Ungroup className="size-4" />
        </IconButton>
        <IconButton
          label="创建副本 (⌘D)"
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
          label="删除 (Del)"
          disabled={!hasSelection}
          onClick={() => useEditor.getState().deleteElements(activeIds)}
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton label="网格" active={showGrid} onClick={() => useEditor.getState().toggleGrid()}>
          <Grid3x3 className="size-4" />
        </IconButton>
        <IconButton label="标尺" active={showRuler} onClick={() => useEditor.getState().toggleRuler()}>
          <RulerIcon className="size-4" />
        </IconButton>
        <IconButton
          label={painter ? "点击目标元素应用格式（按住 Alt 可连续应用）" : "格式刷"}
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
        <IconButton label="查找替换 (⌘F)" onClick={() => setFinding(true)}>
          <Search className="size-4" />
        </IconButton>
      </div>

      <div className="order-3 ml-auto flex shrink-0 items-center gap-1 lg:order-4 lg:ml-0">
      {busy && <span className="shrink-0 text-xs text-muted-foreground">{busy}</span>}

      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => deckInput.current?.click()}
      >
        <Upload className="size-4" /> 导入
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
            <Download className="size-4" /> 导出
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              runExport("正在生成 PPTX…", () => exportPptx(useEditor.getState().exportDeck()))
            }
          >
            导出 PPTX
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              runExport("正在生成图片…", () => exportImages(useEditor.getState().exportDeck()))
            }
          >
            导出图片 (PNG)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => runExport("正在准备打印…", () => exportPdf(useEditor.getState().exportDeck()))}
          >
            导出 PDF（打印）
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => downloadDeckJson(useEditor.getState().exportDeck())}>
            导出 JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" className="shrink-0" onClick={onPresent}>
        <Play className="size-4" /> 放映
      </Button>
      </div>

      {finding && <FindReplace onClose={() => setFinding(false)} />}
    </header>
  )
}
