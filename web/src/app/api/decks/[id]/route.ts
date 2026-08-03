import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import {
  MAX_DECK_BYTES,
  deleteDeck,
  duplicateDeck,
  parseDeck,
  readDeck,
  renameDeck,
  writeDeck,
} from "@/lib/decks"

type Context = { params: Promise<{ id: string }> }

/** Full document, for the editor to open. */
export async function GET(_request: Request, { params }: Context) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const { id } = await params
  const found = await readDeck(id, user.id)
  if (!found) return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })

  return NextResponse.json(found)
}

/** Autosave from the editor: the whole document, replacing what is stored. */
export async function PUT(request: Request, { params }: Context) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const deck = parseDeck((body as { deck?: unknown } | null)?.deck)
  if (!deck) return NextResponse.json({ error: "演示文稿格式不正确" }, { status: 400 })
  if (JSON.stringify(deck).length > MAX_DECK_BYTES) {
    return NextResponse.json({ error: "演示文稿超过 25MB 上限" }, { status: 413 })
  }

  const { id } = await params
  const summary = await writeDeck(id, user.id, deck)
  if (!summary) return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })

  return NextResponse.json({ deck: summary })
}

/** Rename, or duplicate — the two things the dashboard does without opening a deck. */
export async function PATCH(request: Request, { params }: Context) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    title?: unknown
    action?: unknown
  } | null
  const { id } = await params

  if (body?.action === "duplicate") {
    const copy = await duplicateDeck(id, user.id)
    if (!copy) return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })
    return NextResponse.json({ deck: copy }, { status: 201 })
  }

  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : ""
  if (!title) return NextResponse.json({ error: "标题不能为空" }, { status: 400 })

  const summary = await renameDeck(id, user.id, title)
  if (!summary) return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })

  return NextResponse.json({ deck: summary })
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const { id } = await params
  if (!(await deleteDeck(id, user.id))) {
    return NextResponse.json({ error: "演示文稿不存在" }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
