import { cookies } from "next/headers"
import { EditorClient } from "@/app/editor/editor-client"
import { PreviewClient } from "@/app/preview/[id]/preview-client"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import { grantCookie, grantIsGood, shareByToken } from "@/lib/shares"
import { UnlockForm } from "./unlock-form"

export async function generateMetadata() {
  return {
    title: translator(await getLocale())("share.metaTitle"),
    // a URL that carries its own permission should not end up in a search index
    robots: { index: false, follow: false },
  }
}

/**
 * A shared deck, for someone who is not signed in.
 *
 * Everything the visitor is allowed to do is decided here, once, from the row: a read link
 * gets the same live preview an agent's link gets, an edit link gets the real editor. The
 * token then travels with the client's own requests, and `lib/deck-access.ts` checks it
 * again on every one of them — this page decides what to render, not what is permitted.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const share = await shareByToken(token)

  if (!share) return <LinkGone />

  if (share.passwordHash) {
    const grant = (await cookies()).get(grantCookie(share.id))?.value
    if (!(await grantIsGood(share, grant))) return <UnlockForm token={token} />
  }

  if (share.mode === "edit") {
    // back to the marketing page rather than a dashboard the visitor has no account for
    return <EditorClient deckId={share.deckId} shareToken={token} backHref="/" />
  }

  return <PreviewClient deckId={share.deckId} shareToken={token} canEdit={false} />
}

/** Revoked, mistyped, or a deck that has since been deleted — one dead end, one page. */
async function LinkGone() {
  const t = translator(await getLocale())
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-8">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="font-heading text-base font-medium">{t("share.linkGone")}</h1>
        <p className="text-sm text-muted-foreground">{t("share.linkGoneBody")}</p>
      </div>
    </div>
  )
}
