import { NextResponse } from "next/server"
import { readDeckVersion } from "@/lib/decks"
import { deckReader } from "@/lib/deck-access"
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
 *
 * It answers a link — preview key or share token — as well as a session, for the same
 * reason the deck route does: a page that could load once but never poll would stop being
 * live the moment it opened.
 */
export async function GET(request: Request, { params }: Context) {
  const t = translator(await getLocale())
  const { id } = await params

  const reader = await deckReader(request, id)
  if (!reader) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const found = await readDeckVersion(id, reader.ownerId)
  if (!found) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  return NextResponse.json(found)
}
