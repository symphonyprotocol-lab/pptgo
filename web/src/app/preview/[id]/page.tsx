import { redirect } from "next/navigation"
import { currentUser } from "@/auth"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import { SHARE_KEY_PARAM } from "@/lib/constants"
import { ownerFromPreviewKey } from "@/lib/share-link"
import { PreviewClient } from "./preview-client"

export async function generateMetadata() {
  return {
    title: translator(await getLocale())("preview.metaTitle"),
    // a link that carries its own access is a link that gets pasted somewhere public
    // eventually; a crawler that follows one should not leave the deck in an index
    robots: { index: false, follow: false },
  }
}

/**
 * Where a person watches a deck being written.
 *
 * The link an MCP tool hands back points here. It is read-only and it is the *same* deck
 * the editor opens — one document, one version counter — so what an agent writes appears
 * here within a poll, and what someone types in the editor appears here too.
 *
 * Two ways in. A signed `?k=` opens it for whoever holds the link, signed in or not, which
 * is what makes an agent's link worth handing to a person who may have no account here; a
 * session opens it the way the rest of the app opens. Both land on the same read-only
 * page — the key is why the deck API answers, not a mode this page renders differently.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params

  const raw = (await searchParams)[SHARE_KEY_PARAM]
  const key = typeof raw === "string" ? raw : undefined
  const sharedWith = key ? await ownerFromPreviewKey(id, key) : null

  const user = await currentUser()

  if (!user && !sharedWith) {
    // a link that has lapsed is its own answer: sending a visitor with no account to Google
    // asks them to fix something that was never theirs to fix
    if (key) return <LinkNoGood />
    // the deck API checks ownership on every call; this only saves a signed-out visitor
    // from watching the page mount and immediately fail
    redirect(`/login?next=/preview/${id}`)
  }

  return (
    <PreviewClient
      deckId={id}
      // the key travels even for a signed-in reader: they may be holding a link to someone
      // else's deck, where their own session reads nothing
      previewKey={sharedWith ? key : undefined}
      canEdit={Boolean(user) && (!sharedWith || sharedWith === user?.id)}
    />
  )
}

/** Expired, forged, or signed before an `AUTH_SECRET` rotation — one dead end, one page. */
async function LinkNoGood() {
  const t = translator(await getLocale())
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-8">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="font-heading text-base font-medium">{t("preview.linkExpired")}</h1>
        <p className="text-sm text-muted-foreground">{t("preview.linkExpiredBody")}</p>
      </div>
    </div>
  )
}
