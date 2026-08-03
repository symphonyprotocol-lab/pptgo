import { NextResponse } from "next/server"
import { readThumbnail, writeThumbnail } from "@/lib/decks"
import { deckReader } from "@/lib/deck-access"
import { readBytes } from "@/lib/http"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

type Context = { params: Promise<{ id: string }> }

/** 1MB is generous for a 400px-wide PNG of one slide. */
const MAX_THUMBNAIL_BYTES = 1024 * 1024

/**
 * The bucket is private, so thumbnails are served through the app rather than by a
 * presigned URL — one authorised hop instead of a URL that outlives the session.
 */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params
  const reader = await deckReader(request, id)
  if (!reader) return new NextResponse(null, { status: 401 })

  const png = await readThumbnail(id, reader.ownerId)
  if (!png) return new NextResponse(null, { status: 404 })

  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      // the dashboard busts this with the deck's updatedAt, so it can be cached hard
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  })
}

/** The editor uploads a render of the first slide after each save. */
export async function PUT(request: Request, { params }: Context) {
  const t = translator(await getLocale())
  const { id } = await params

  // an edit-mode share link saves thumbnails too: the tile the owner sees in their
  // dashboard should follow the deck, whoever did the editing
  const reader = await deckReader(request, id)
  if (!reader) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })
  if (!reader.canWrite) {
    return NextResponse.json({ error: t("api.readOnlyLink") }, { status: 403 })
  }

  // the cap is enforced while reading rather than after: `arrayBuffer()` would have
  // buffered the whole upload before anyone could object to its size
  const body = await readBytes(request, MAX_THUMBNAIL_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? NextResponse.json({ error: t("api.thumbnailTooLarge") }, { status: 413 })
      : NextResponse.json({ error: t("api.thumbnailEmpty") }, { status: 400 })
  }

  const bytes = body.value
  if (!bytes.byteLength) {
    return NextResponse.json({ error: t("api.thumbnailEmpty") }, { status: 400 })
  }
  if (!isPng(bytes)) {
    return NextResponse.json({ error: t("api.thumbnailNotPng") }, { status: 415 })
  }

  if (!(await writeThumbnail(id, reader.ownerId, bytes))) {
    return NextResponse.json({ error: t("api.deckNotFound") }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((byte, index) => bytes[index] === byte)
}
