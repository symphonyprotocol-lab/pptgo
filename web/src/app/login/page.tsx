import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { currentUser } from "@/auth"
import { signInWithGoogle } from "@/app/actions/auth"
import { GoogleButton } from "@/components/site/google-button"
import { Wordmark } from "@/components/site/wordmark"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import type { MessageKey } from "@/lib/i18n/messages"

export async function generateMetadata() {
  return { title: translator(await getLocale())("login.metaTitle") }
}

/** Auth.js appends `?error=…` on a failed callback; these are the ones worth naming. */
const ERRORS: Record<string, MessageKey> = {
  OAuthAccountNotLinked: "login.error.OAuthAccountNotLinked",
  AccessDenied: "login.error.AccessDenied",
  Configuration: "login.error.Configuration",
  Verification: "login.error.Verification",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const t = translator(await getLocale())
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"

  if (await currentUser()) redirect(target)

  return (
    <main className="relative flex flex-1 flex-col bg-background text-foreground">
      <div className="stage-glow pointer-events-none absolute inset-0" />
      <div className="hairline-grid pointer-events-none absolute inset-0" />

      <header className="relative z-10 flex h-16 items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          {t("login.back")}
        </Link>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="relative w-full max-w-md">
          {/* registration marks — the card sits on the plate, not in a rounded box */}
          {[
            "-top-4 -left-4",
            "-top-4 -right-4",
            "-bottom-4 -left-4",
            "-bottom-4 -right-4",
          ].map((position) => (
            <span key={position} className={`absolute size-4 ${position}`}>
              <span className="absolute top-1/2 left-0 h-px w-full bg-primary/70" />
              <span className="absolute top-0 left-1/2 h-full w-px bg-primary/70" />
            </span>
          ))}

          <div className="rise border border-border bg-card p-8 shadow-[var(--sheet-shadow)] sm:p-10">
            <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
              {t("login.kicker")}
            </p>
            <h1 className="mt-5 text-3xl leading-tight font-black tracking-[-0.03em]">
              {t("login.headingLine1")}
              <br />
              {t("login.headingLine2")}
            </h1>
            <p className="mt-4 text-sm leading-[1.85] text-muted-foreground">
              {t("login.body")}
            </p>

            {error && (
              <p className="mt-6 border-l-2 border-destructive bg-destructive/12 px-4 py-3 text-sm leading-relaxed text-foreground">
                {ERRORS[error]
                  ? t(ERRORS[error])
                  : t("login.error.generic", { code: error })}
              </p>
            )}

            <form action={signInWithGoogle} className="mt-8">
              <input type="hidden" name="next" value={target} />
              <GoogleButton size="large" />
            </form>

            <div className="mt-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
                {t("login.or")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Link
              href="/editor"
              className="mt-6 flex h-12 items-center justify-center border border-border text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
            >
              {t("login.localEditor")}
            </Link>

            <p className="mt-8 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground/80">
              {t("login.scopeNote")}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
