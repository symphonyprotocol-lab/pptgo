import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import {
  MAX_DECK_BYTES,
  blankDeck,
  createDeck,
  listDecks,
  parseDeck,
} from "@/lib/decks"

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  return NextResponse.json({ decks: await listDecks(user.id) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 })
  }

  const { deck: raw, title } = body as { deck?: unknown; title?: unknown }
  const deck = raw === undefined
    ? blankDeck(typeof title === "string" && title.trim() ? title.trim() : "未命名演示文稿")
    : parseDeck(raw)

  if (!deck) return NextResponse.json({ error: "演示文稿格式不正确" }, { status: 400 })
  if (JSON.stringify(deck).length > MAX_DECK_BYTES) {
    return NextResponse.json({ error: "演示文稿超过 25MB 上限" }, { status: 413 })
  }

  return NextResponse.json({ deck: await createDeck(user.id, deck) }, { status: 201 })
}
