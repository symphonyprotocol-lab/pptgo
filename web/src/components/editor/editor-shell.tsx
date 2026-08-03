"use client"

import { useEffect, useRef, useState } from "react"
import { Layers, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useEditor } from "@/store/editor"
import { createDeck, normalizeDeck } from "@/lib/factory"
import { useT } from "@/lib/i18n/client"
import { type DeckStorage } from "@/lib/deck-storage"
import { Canvas } from "./canvas"
import { PresentView } from "./present-view"
import { PropertyPanel } from "./property-panel"
import { SlideList } from "./slide-list"
import { Toolbar } from "./toolbar"
import { useIsCompact } from "./use-media-query"
import { useShortcuts } from "./use-shortcuts"

export interface EditorShellProps {
  /** the IndexedDB adapter signed out, the API adapter signed in */
  storage: DeckStorage
  /** where the wordmark links to — the dashboard when signed in */
  backHref?: string
}

export function EditorShell({ storage, backHref = "/" }: EditorShellProps) {
  const t = useT()
  const [presenting, setPresenting] = useState(false)
  const [restored, setRestored] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const dirty = useRef(false)
  /**
   * Guards the first run of the autosave effect. That effect fires once as soon as
   * `restored` flips, which meant simply opening a deck and reading it wrote the deck
   * straight back: the dashboard's "last edited" moved, a thumbnail was re-rendered and
   * re-uploaded, and the tile jumped to the front of a list ordered by edit time. Nothing
   * had been edited.
   */
  const settled = useRef(false)

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
        if (cancelled) return
        // normalizeDeck also re-sanitises stored rich text before it is rendered. With
        // nothing stored the starter deck is built here rather than in the store, so its
        // wording is the reader's language and not whatever the module was authored in.
        useEditor.getState().loadDeck(normalizeDeck(deck ?? createDeck(t), t))
      })
      .catch((error: Error) => {
        if (cancelled) return
        failed = true
        setLoadError(error.message || t("error.storageRead"))
      })
      .finally(() => {
        // autosave stays off after a failed load — otherwise the starter deck this
        // editor fell back to would overwrite the one that could not be read
        if (!cancelled && !failed) setRestored(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage, t])

  // Everything persisted has to be in the dependency list, or renaming the deck (or
  // recolouring the theme) would be lost on reload.
  useEffect(() => {
    if (!restored) return
    // the run triggered by `restored` itself is the load, not an edit
    if (!settled.current) {
      settled.current = true
      return
    }
    dirty.current = true
    const timer = window.setTimeout(() => {
      // the store is the source of what gets written, so it has to still be holding a deck
      // that was loaded — see `hydrated`
      if (!useEditor.getState().hydrated) return
      storage
        .save(useEditor.getState().exportDeck())
        .then(() => {
          dirty.current = false
          setSaveError(null)
        })
        .catch((error: Error) => setSaveError(error.message || t("error.storageSave")))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [slides, title, theme, restored, storage, t])

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
                      <PanelLeft className="size-4" />{" "}
                      {t("editor.slidesDrawer", {
                        index: slideIndex + 1,
                        total: slides.length,
                      })}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0">
                    <SheetTitle className="sr-only">{t("editor.slideList")}</SheetTitle>
                    <SlideList className="w-full border-r-0" />
                  </SheetContent>
                </Sheet>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="secondary" className="pointer-events-auto shadow-lg">
                      <Layers className="size-4" />
                      {activeIds.length
                        ? t("editor.selectedCount", { count: activeIds.length })
                        : t("editor.properties")}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-80 p-0">
                    <SheetTitle className="sr-only">{t("editor.propertyPanel")}</SheetTitle>
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
            {t("editor.loadFailed", { message: loadError })}
          </div>
        )}
        {saveError && (
          <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {t("editor.saveFailed", { message: saveError })}
          </div>
        )}
        {presenting && (
          <PresentView slides={slides} startIndex={slideIndex} onExit={() => setPresenting(false)} />
        )}
      </div>
    </TooltipProvider>
  )
}
