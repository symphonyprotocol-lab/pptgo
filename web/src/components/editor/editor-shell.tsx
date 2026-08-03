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

/**
 * How often a deck that has other writers is checked for having moved. It costs one
 * indexed row — `/api/decks/[id]/version` never opens the document — so this is tuned for
 * how soon a reader should see someone else's save rather than for what the query costs.
 */
const POLL_INTERVAL = 4000

export function EditorShell({ storage, backHref = "/" }: EditorShellProps) {
  const t = useT()
  const [presenting, setPresenting] = useState(false)
  const [restored, setRestored] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const dirty = useRef(false)
  /**
   * Read by the autosave timer, which fires long after the render that set it — state
   * would be the value captured when the timer was scheduled, and the whole point is to
   * stop a save that was already in flight when the conflict appeared.
   */
  const conflicted = useRef(false)
  /**
   * Set just before the store is handed a document from storage, and cleared by the
   * autosave effect that the resulting state change triggers. Without it, accepting
   * someone else's version would immediately save it back as if it were an edit —
   * bumping the version again and telling every other reader to reload.
   */
  const applyingRemote = useRef(false)

  const flagConflict = (value: boolean) => {
    conflicted.current = value
    setConflict(value)
  }
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
    // accepting a document from storage is not an edit either, and saving it back would
    // start a round trip between two editors both "updating" each other
    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    dirty.current = true
    const timer = window.setTimeout(() => {
      // the store is the source of what gets written, so it has to still be holding a deck
      // that was loaded — see `hydrated`
      if (!useEditor.getState().hydrated) return
      // autosave stays paused while a conflict is on screen: every attempt would be
      // refused, and the reader has been asked which document should win
      if (conflicted.current) return
      storage
        .save(useEditor.getState().exportDeck())
        .then((result) => {
          if (!result.ok) {
            flagConflict(true)
            return
          }
          dirty.current = false
          setSaveError(null)
        })
        .catch((error: Error) => setSaveError(error.message || t("error.storageSave")))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [slides, title, theme, restored, storage, t])

  /**
   * Poll for the deck having been written elsewhere. Only storage with more than one
   * writer offers this — `changedRemotely` is null for IndexedDB — so the signed-out
   * editor runs no timer at all.
   */
  useEffect(() => {
    const probe = storage.changedRemotely
    if (!restored || !probe) return

    let cancelled = false

    const tick = async () => {
      // a hidden tab is not being read, and a conflict already on screen is waiting on the
      // reader rather than on more polling
      if (cancelled || conflicted.current || document.hidden) return

      let moved: boolean
      try {
        moved = await probe()
      } catch {
        // a poll that fails is a network blip, not news about the document — the next one
        // will say the same thing if it was real
        return
      }
      if (cancelled || !moved) return

      // local edits are never thrown away to make room for someone else's: the reader is
      // told, and picks
      if (dirty.current) {
        flagConflict(true)
        return
      }

      try {
        const deck = await storage.load()
        if (cancelled || !deck) return
        applyingRemote.current = true
        useEditor.getState().applyRemote(normalizeDeck(deck, t))
        setNotice(t("editor.remoteReloaded"))
      } catch {
        // leave what is on screen; the deck has not been touched here, so the next tick
        // finds the same thing and tries again
      }
    }

    const timer = window.setInterval(() => void tick(), POLL_INTERVAL)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [restored, storage, t])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  /** "Load the new version" — the stored document wins, local edits go. */
  const takeRemote = async () => {
    try {
      const deck = await storage.load()
      if (!deck) return
      applyingRemote.current = true
      useEditor.getState().applyRemote(normalizeDeck(deck, t))
      dirty.current = false
      flagConflict(false)
      setSaveError(null)
      setNotice(t("editor.remoteReloaded"))
    } catch (error) {
      setLoadError((error as Error).message || t("error.storageRead"))
    }
  }

  /** "Overwrite with mine" — what is on screen wins, whatever version is stored. */
  const keepLocal = async () => {
    try {
      const result = await storage.save(useEditor.getState().exportDeck(), { force: true })
      // a forced save reads the current version and writes over it, so it only comes back
      // refused if yet another write landed in between — the banner stays and so do the
      // local edits
      if (!result.ok) return
      dirty.current = false
      flagConflict(false)
      setSaveError(null)
    } catch (error) {
      setSaveError((error as Error).message || t("error.storageSave"))
    }
  }

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

        {conflict && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-primary/10 px-3 py-1.5 text-xs">
            {/* not the destructive colour: nothing has been lost, and both documents are
                still available — the reader is being asked which one to keep */}
            <span>{t("editor.remoteChanged")}</span>
            <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={takeRemote}>
              {t("editor.remoteReload")}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={keepLocal}>
              {t("editor.remoteKeepMine")}
            </Button>
          </div>
        )}
        {notice && (
          <div className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {notice}
          </div>
        )}
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
