import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import { readThumbnail, writeThumbnail } from "@/lib/decks"

type Context = { params: Promise<{ id: string }> }

/** 1MB is generous for a 400px-wide PNG of one slide. */
const MAX_THUMBNAIL_BYTES = 1024 * 1024

/**
 * The bucket is private, so thumbnails are served through the app rather than by a
 * presigned URL — one authorised hop instead of a URL that outlives the session.
 */
export async function GET(_request: Request, { params }: Context) {
  const user = await currentUser()
  if (!user) return new NextResponse(null, { status: 401 })

  const { id } = await params
  const png = await readThumbnail(id, user.id)
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
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (!bytes.byteLength) {
    return NextResponse.json({ error: "缩略图为空" }, { status: 400 })
  }
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: "缩略图过大" }, { status: 413 })
  }
  if (!isPng(bytes)) {
    return NextResponse.json({ error: "缩略图必须是 PNG" }, { status: 415 })
  }

  const { id } = await params
  if (!(await writeThumbnail(id, user.id, bytes))) {
    return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(bytes: Uint8Array): boolean {
  return PNG_MAGIC.every((byte, index) => bytes[index] === byte)
}
