"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"
import { cloudDeckStorage, localDeckStorage } from "@/lib/deck-storage"
import { useT } from "@/lib/i18n/client"

/** The editor is a pure browser app — element ids are generated at runtime, so SSR would mismatch. */
const EditorShell = dynamic(
  () => import("@/components/editor/editor-shell").then((m) => m.EditorShell),
  { ssr: false, loading: () => <div className="flex-1 bg-muted/40" /> },
)

/** Without a deck id the editor is a signed-out sandbox backed by IndexedDB. */
export function EditorClient({ deckId }: { deckId?: string }) {
  const t = useT()
  // a new adapter object on every render would restart the load effect in a loop; `t` is
  // stable for a locale, so this only rebuilds when the language itself changes
  const storage = useMemo(
    () => (deckId ? cloudDeckStorage(deckId, t) : localDeckStorage(t)),
    [deckId, t],
  )

  return <EditorShell storage={storage} backHref={deckId ? "/dashboard" : "/"} />
}
