import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import {
  MAX_REQUEST_BYTES,
  deleteDeck,
  duplicateDeck,
  encodeDeck,
  parseDeck,
  readDeck,
  renameDeck,
  writeDeck,
} from "@/lib/decks"
import { readJsonObject } from "@/lib/http"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

type Context = { params: Promise<{ id: string }> }

/** Full document, for the editor to open. */
export async function GET(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  const found = await readDeck(id, user.id)
  if (!found) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })

  return NextResponse.json(found)
}

/**
 * Autosave from the editor: the whole document, replacing what is stored.
 *
 * `baseVersion` is required rather than optional. Making it optional would mean the way to
 * overwrite whatever is there is to send nothing, which is also what an out-of-date client
 * does by accident — the unguarded write has to be the one you ask for, not the one you
 * get by omission.
 */
export async function PUT(request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const body = await readJsonObject(request, MAX_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? NextResponse.json({ error: t("api.deckTooLarge") }, { status: 413 })
      : NextResponse.json({ error: t("api.badJson") }, { status: 400 })
  }

  const baseVersion = body.value.baseVersion
  if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 1) {
    return NextResponse.json({ error: t("api.baseVersionRequired") }, { status: 400 })
  }

  const deck = parseDeck(body.value.deck)
  if (!deck) return NextResponse.json({ error: t("api.badDeck") }, { status: 400 })

  const encoded = encodeDeck(deck)
  if (!encoded) return NextResponse.json({ error: t("api.deckTooLarge") }, { status: 413 })

  const { id } = await params
  const result = await writeDeck(id, user.id, deck, baseVersion, encoded)
  if (result.ok) return NextResponse.json({ deck: result.summary })
  if (result.reason === "not-found") {
    return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
  }

  // the current version travels with the refusal so the client can say how far behind it
  // is; the document does not, because the usual answer to a conflict is to keep the local
  // one and fetching the slides to support the other answer is a second request away
  return NextResponse.json(
    { error: t("api.deckConflict"), version: result.version },
    { status: 409 },
  )
}

/** Rename, or duplicate — the two things the dashboard does without opening a deck. */
export async function PATCH(request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  // no document travels in a PATCH, so the ceiling here is a title rather than a deck
  const body = await readJsonObject(request, 64 * 1024)
  if (!body.ok) return NextResponse.json({ error: t("api.badJson") }, { status: 400 })
  const { id } = await params

  if (body.value.action === "duplicate") {
    const copy = await duplicateDeck(id, user.id, t("deck.copySuffix"))
    if (!copy) return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
    return NextResponse.json({ deck: copy }, { status: 201 })
  }

  const raw = body.value.title
  const title = typeof raw === "string" ? raw.trim().slice(0, 200) : ""
  if (!title) return NextResponse.json({ error: t("api.titleRequired") }, { status: 400 })

  const renamed = await renameDeck(id, user.id, title)
  if (renamed.ok) return NextResponse.json({ deck: renamed.summary })
  if (renamed.reason === "not-found") {
    return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
  }

  // a rename that lost the version race twice means something is writing the deck
  // continuously — an editor left open, most likely — and retrying is the reader's call
  return NextResponse.json(
    { error: t("api.deckBusy"), version: renamed.version },
    { status: 409 },
  )
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  if (!(await deleteDeck(id, user.id))) {
    return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
