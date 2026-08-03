"use client"

import dynamic from "next/dynamic"

/**
 * Browser-only for the same reason the editor is, plus one of its own: the slides are
 * rendered from stored HTML through `dangerouslySetInnerHTML`, and the re-sanitising that
 * makes that safe needs a real DOM. Server-rendering this page would mean emitting the
 * stored markup before anything had scrubbed it.
 */
const PreviewShell = dynamic(
  () => import("@/components/preview/preview-shell").then((m) => m.PreviewShell),
  { ssr: false, loading: () => <div className="flex-1 bg-muted/40" /> },
)

export function PreviewClient({
  deckId,
  previewKey,
  shareToken,
  canEdit,
}: {
  deckId: string
  previewKey?: string
  shareToken?: string
  canEdit: boolean
}) {
  return (
    <PreviewShell
      deckId={deckId}
      previewKey={previewKey}
      shareToken={shareToken}
      canEdit={canEdit}
    />
  )
}
