"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import {
  GRANT_TTL_DAYS,
  grantCookie,
  passwordMatches,
  shareByToken,
  signGrant,
} from "@/lib/shares"

export interface UnlockState {
  error?: string
}

/**
 * The passphrase gate on a share link.
 *
 * A server action rather than a route handler because it is a form's own submit target,
 * and because setting a cookie is something only actions and handlers may do — a page
 * cannot, which is why an open link never sets one at all.
 *
 * There is no attempt counter. The rate limit is the hash: PBKDF2 at 210k rounds costs
 * about a tenth of a second per guess, which makes an online dictionary run against a
 * decent passphrase pointless, and a counter that lives in one server's memory would not
 * survive compose restarting anyway. A shared link is not a login.
 */
export async function unlockShare(
  _previous: UnlockState,
  form: FormData,
): Promise<UnlockState> {
  const t = translator(await getLocale())

  const token = String(form.get("token") ?? "")
  const password = String(form.get("password") ?? "")

  const share = await shareByToken(token)
  if (!share) return { error: t("share.linkGone") }
  if (!share.passwordHash) redirect(`/s/${token}`)

  if (!(await passwordMatches(share, password))) {
    return { error: t("share.wrongPassword") }
  }

  ;(await cookies()).set(grantCookie(share.id), await signGrant(share), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GRANT_TTL_DAYS * 24 * 60 * 60,
  })

  redirect(`/s/${token}`)
}
