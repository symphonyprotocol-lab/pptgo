import { NextResponse } from "next/server"
import { readDeck } from "@/lib/decks"
import { deckReader } from "@/lib/deck-access"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

type Context = { params: Promise<{ id: string }> }

/**
 * The deck's first slide, and nothing else.
 *
 * A dashboard tile shows a render of slide one. Normally that render is a stored PNG the
 * editor uploaded, but a deck can exist without one — created through the API, or opened
 * and never edited, since nothing is uploaded until something is saved. Those tiles used
 * to read "no preview", which says nothing about a deck that is perfectly fine.
 *
 * So the tile draws the slide itself, and this is where it gets it. Not `GET
 * /api/decks/[id]`: that returns the whole document, and a deck with embedded images runs
 * to megabytes — a dashboard of them would pull the entire library over the wire to draw a
 * grid of thumbnails. Slicing on the server costs one bucket read either way and sends
 * back the one slide that is going to be looked at.
 */
export async function GET(request: Request, { params }: Context) {
  const t = translator(await getLocale())
  const { id } = await params

  const reader = await deckReader(request, id)
  if (!reader) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const found = await readDeck(id, reader.ownerId)
  if (!found) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  const slide = found.deck.slides?.[0]
  if (!slide) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  return NextResponse.json(
    { slide },
    {
      headers: {
        // the caller busts this with the deck's `updatedAt`, the same key the stored
        // thumbnail is cached under
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    },
  )
}
