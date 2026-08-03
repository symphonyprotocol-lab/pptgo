import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import {
  MAX_DECKS_PER_OWNER,
  MAX_REQUEST_BYTES,
  blankDeck,
  countDecks,
  createDeck,
  encodeDeck,
  listDecks,
  parseDeck,
} from "@/lib/decks"
import { readJsonObject } from "@/lib/http"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

export async function GET() {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  return NextResponse.json({ decks: await listDecks(user.id) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const body = await readJsonObject(request, MAX_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? NextResponse.json({ error: t("api.deckTooLarge") }, { status: 413 })
      : NextResponse.json({ error: t("api.badJson") }, { status: 400 })
  }

  const { deck: raw, title } = body.value as { deck?: unknown; title?: unknown }
  const deck =
    raw === undefined
      ? blankDeck(typeof title === "string" && title.trim() ? title.trim() : t("deck.untitled"))
      : parseDeck(raw)

  if (!deck) return NextResponse.json({ error: t("api.badDeck") }, { status: 400 })

  const encoded = encodeDeck(deck)
  if (!encoded) return NextResponse.json({ error: t("api.deckTooLarge") }, { status: 413 })

  // an account that can create decks without limit is an account that can fill the bucket
  if ((await countDecks(user.id)) >= MAX_DECKS_PER_OWNER) {
    return NextResponse.json(
      { error: t("api.deckLimit", { limit: MAX_DECKS_PER_OWNER }) },
      { status: 409 },
    )
  }

  return NextResponse.json({ deck: await createDeck(user.id, deck, encoded) }, { status: 201 })
}
