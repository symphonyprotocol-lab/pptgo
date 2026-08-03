import { NextResponse } from "next/server"
import { currentUser } from "@/auth"
import { deleteToken } from "@/lib/api-token"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

type Context = { params: Promise<{ id: string }> }

/** Revoking takes effect at once: the row is the credential, so deleting it is the end. */
export async function DELETE(_request: Request, { params }: Context) {
  const user = await currentUser()
  const t = translator(await getLocale())
  if (!user) return NextResponse.json({ error: t("api.unauthorized") }, { status: 401 })

  const { id } = await params
  if (!(await deleteToken(id, user.id))) {
    return NextResponse.json({ error: t("api.tokenNotFound") }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
