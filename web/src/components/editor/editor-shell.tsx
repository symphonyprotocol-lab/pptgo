"use client"

import { useEffect, useRef, useState } from "react"
import { Layers, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useEditor } from "@/store/editor"
import { normalizeDeck } from "@/lib/factory"
import { localDeckStorage, type DeckStorage } from "@/lib/deck-storage"
import { Canvas } from "./canvas"
import { PresentView } from "./present-view"
import { PropertyPanel } from "./property-panel"
import { SlideList } from "./slide-list"
import { Toolbar } from "./toolbar"
import { useIsCompact } from "./use-media-query"
import { useShortcuts } from "./use-shortcuts"

export interface EditorShellProps {
  /** defaults to the browser-local IndexedDB adapter */
  storage?: DeckStorage
  /** where the wordmark links to — the dashboard when signed in */
  backHref?: string
}

export function EditorShell({
  storage = localDeckStorage,
  backHref = "/",
}: EditorShellProps = {}) {
  const [presenting, setPresenting] = useState(false)
  const [restored, setRestored] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const dirty = useRef(false)

  const slides = useEditor((s) => s.slides)
  const slideIndex = useEditor((s) => s.slideIndex)
  const title = useEditor((s) => s.title)
  const theme = useEditor((s) => s.theme)
  const activeIds = useEditor((s) => s.activeIds)
  const compact = useIsCompact()

  useShortcuts(!presenting)

  useEffect(() => {
    let cancelled = false
    let failed = false
    storage
      .load()
      .then((deck) => {
        if (cancelled || !deck) return
        // normalizeDeck also re-sanitises stored rich text before it is rendered
        useEditor.getState().loadDeck(normalizeDeck(deck))
      })
      .catch((error: Error) => {
        if (cancelled) return
        failed = true
        setLoadError(error.message || "读取失败")
      })
      .finally(() => {
        // autosave stays off after a failed load — otherwise the starter deck this
        // editor fell back to would overwrite the one that could not be read
        if (!cancelled && !failed) setRestored(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage])

  // Everything persisted has to be in the dependency list, or renaming the deck (or
  // recolouring the theme) would be lost on reload.
  useEffect(() => {
    if (!restored) return
    dirty.current = true
    const timer = window.setTimeout(() => {
      storage
        .save(useEditor.getState().exportDeck())
        .then(() => {
          dirty.current = false
          setSaveError(null)
        })
        .catch((error: Error) => setSaveError(error.message || "自动保存失败"))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [slides, title, theme, restored, storage])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <Toolbar onPresent={() => setPresenting(true)} backHref={backHref} />

        <div className="flex min-h-0 flex-1">
          {compact ? (
            <>
              <Canvas />
              {/* on a narrow screen the two side panels become drawers */}
              <div className="pointer-events-none absolute inset-x-0 bottom-12 z-20 flex justify-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="secondary" className="pointer-events-auto shadow-lg">
                      <PanelLeft className="size-4" /> 幻灯片 {slideIndex + 1}/{slides.length}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0">
                    <SheetTitle className="sr-only">幻灯片列表</SheetTitle>
                    <SlideList className="w-full border-r-0" />
                  </SheetContent>
                </Sheet>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="secondary" className="pointer-events-auto shadow-lg">
                      <Layers className="size-4" />
                      {activeIds.length ? `已选 ${activeIds.length}` : "属性"}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80 p-0">
                    <SheetTitle className="sr-only">属性面板</SheetTitle>
                    <PropertyPanel className="w-full border-l-0" />
                  </SheetContent>
                </Sheet>
              </div>
            </>
          ) : (
            <>
              <SlideList />
              <Canvas />
              <PropertyPanel />
            </>
          )}
        </div>

        {loadError && (
          <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {loadError}——为免覆盖已保存的内容，自动保存已停用
          </div>
        )}
        {saveError && (
          <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {saveError}——请导出 JSON 备份当前内容
          </div>
        )}
        {presenting && (
          <PresentView slides={slides} startIndex={slideIndex} onExit={() => setPresenting(false)} />
        )}
      </div>
    </TooltipProvider>
  )
}
