import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import {
  MAX_TOKENS_PER_OWNER,
  MAX_TOKEN_NAME,
  countTokens,
  createToken,
  listTokens,
} from "@/lib/api-token"
import { readJsonObject } from "@/lib/http"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

/**
 * Minting and revoking are session-only, on purpose: `currentUser()` reads the Auth.js
 * cookie and nothing here consults `userFromBearer`. A token that could mint tokens would
 * be able to outlive its own revocation, so the browser is the only place credentials are
 * issued.
 */

export async function GET() {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  return NextResponse.json({ tokens: await listTokens(user.id) })
}

export async function POST(request: Request) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  // a name and a number, so the ceiling here is nowhere near a document
  const body = await readJsonObject(request, 16 * 1024)
  if (!body.ok) return NextResponse.json({ error: t("api.badJson") }, { status: 400 })

  const raw = body.value.name
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_TOKEN_NAME) : ""
  if (!name) return NextResponse.json({ error: t("api.tokenNameRequired") }, { status: 400 })

  const days = body.value.expiresInDays
  let expiresAt: Date | null = null
  if (days !== undefined && days !== null) {
    if (typeof days !== "number" || !Number.isFinite(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: t("api.tokenBadExpiry") }, { status: 400 })
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }

  if ((await countTokens(user.id)) >= MAX_TOKENS_PER_OWNER) {
    return NextResponse.json(
      { error: t("api.tokenLimit", { limit: MAX_TOKENS_PER_OWNER }) },
      { status: 400 },
    )
  }

  // the only response that will ever carry the plaintext
  const created = await createToken(user.id, name, expiresAt)
  return NextResponse.json(created, { status: 201 })
}
