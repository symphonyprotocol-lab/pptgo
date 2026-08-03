import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import { readJsonObject } from "@/lib/http"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import { MAX_SHARE_PASSWORD, deleteShare, readShare, upsertShare } from "@/lib/shares"
import type { ShareMode } from "@/types/share"

type Context = { params: Promise<{ id: string }> }

/**
 * The owner's control over one deck's share link.
 *
 * Session only, all three methods. A share link may read or write the *document* it was
 * issued for; what it must never do is reach back here and widen itself — an edit link
 * that could turn its own password off would make the password decorative.
 */

/** The current share, or `{ share: null }` when the deck is not shared. */
export async function GET(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  return NextResponse.json({ share: await readShare(id, user.id) })
}

/**
 * Start sharing, or change how it is shared.
 *
 * `password` is deliberately three-valued: a string sets one, `null` removes it, and
 * leaving the field out keeps whatever is there. Switching a link from read to edit should
 * not quietly unlock it.
 */
export async function PUT(request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const body = await readJsonObject(request, 64 * 1024)
  if (!body.ok) return NextResponse.json({ error: t("api.badJson") }, { status: 400 })

  const mode = body.value.mode
  if (mode !== "read" && mode !== "edit") {
    return NextResponse.json({ error: t("api.shareModeRequired") }, { status: 400 })
  }

  const raw = body.value.password
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    return NextResponse.json({ error: t("api.sharePasswordBad") }, { status: 400 })
  }
  // trimmed, then an empty string means the same as null: a form that submits a blank
  // field is asking for no password, not for a password of nothing
  const trimmed = typeof raw === "string" ? raw.trim() : raw
  if (typeof trimmed === "string" && trimmed.length > MAX_SHARE_PASSWORD) {
    return NextResponse.json({ error: t("api.sharePasswordBad") }, { status: 400 })
  }
  const password = trimmed === "" ? null : trimmed

  const { id } = await params
  const share = await upsertShare(id, user.id, { mode: mode as ShareMode, password })
  if (!share) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  return NextResponse.json({ share })
}

/** Revoke. Every copy of the link stops working on the next request. */
export async function DELETE(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  if (!(await deleteShare(id, user.id))) {
    return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
