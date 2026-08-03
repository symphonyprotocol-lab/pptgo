"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { cloudDeckStorage, localDeckStorage } from "@/lib/deck-storage"

/** The editor is a pure browser app — element ids are generated at runtime, so SSR would mismatch. */
const EditorShell = dynamic(
  () => import("@/components/editor/editor-shell").then((m) => m.EditorShell),
  { ssr: false, loading: () => <div className="flex-1 bg-muted/40" /> },
)

/** Without a deck id the editor is a signed-out sandbox backed by IndexedDB. */
export function EditorClient({ deckId }: { deckId?: string }) {
  // a new adapter object on every render would restart the load effect in a loop
  const storage = useMemo(
    () => (deckId ? cloudDeckStorage(deckId) : localDeckStorage),
    [deckId],
  )

  return <EditorShell storage={storage} backHref={deckId ? "/dashboard" : "/"} />
}
