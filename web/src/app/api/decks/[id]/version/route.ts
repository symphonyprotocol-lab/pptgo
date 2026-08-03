import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import { readDeckVersion } from "@/lib/decks"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

type Context = { params: Promise<{ id: string }> }

/**
 * What an open editor polls to find out whether the deck has moved under it.
 *
 * The whole point of this route is what it does *not* do: `GET /api/decks/[id]` answers
 * the same question, but it fetches the document out of the bucket to do it, and a deck
 * with embedded images runs to megabytes. Every editor and every preview asks this every
 * few seconds, so it stays a single indexed row and never touches object storage. Anything
 * added here that needs the document belongs on the other route.
 */
export async function GET(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  const found = await readDeckVersion(id, user.id)
  if (!found) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  return NextResponse.json(found)
}
