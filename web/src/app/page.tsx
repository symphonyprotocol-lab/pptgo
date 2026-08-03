import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { currentUser } from "@/auth"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import type { MessageKey } from "@/lib/i18n/messages"
import { signInWithGoogle } from "@/app/actions/auth"
import { GoogleButton } from "@/components/site/google-button"
import { LiveSlide } from "@/components/site/live-slide"
import { SITE_SHELL, SiteHeader } from "@/components/site/site-header"
import { Wordmark } from "@/components/site/wordmark"

/**
 * One measure for the whole page — the site's, shared with the header. The rules between
 * sections run the full width of the viewport, so any section whose content sat on a
 * different measure made those rules read as misalignment rather than as structure: the
 * wordmark, the slide and the spec rows all have to start on the same vertical line.
 */
const SHELL = SITE_SHELL

/**
 * A spec sheet rather than feature cards — this reads like the back of a manual: dense,
 * ruled, scannable, and it fits far more of what the editor actually does. Each row is a
 * label plus a body, both resolved from the message table.
 */
const SPEC: { key: string; label: MessageKey; body: MessageKey }[] = [
  { key: "elements", label: "spec.elements", body: "spec.elements.body" },
  { key: "canvas", label: "spec.canvas", body: "spec.canvas.body" },
  { key: "editing", label: "spec.editing", body: "spec.editing.body" },
  { key: "slides", label: "spec.slides", body: "spec.slides.body" },
  { key: "present", label: "spec.present", body: "spec.present.body" },
  { key: "io", label: "spec.io", body: "spec.io.body" },
  { key: "mobile", label: "spec.mobile", body: "spec.mobile.body" },
  { key: "account", label: "spec.account", body: "spec.account.body" },
]

export default async function Home() {
  const user = await currentUser()
  const t = translator(await getLocale())

  return (
    <main className="flex-1 bg-background text-foreground">
      <SiteHeader user={user} />

      {/* ── the slide is the hero: the headline is an element you can drag ──── */}
      <section className="relative">
        <div className="stage-glow pointer-events-none absolute inset-0" />
        <div className="hairline-grid pointer-events-none absolute inset-0" />

        <div className={`relative pt-8 pb-12 lg:pt-10 ${SHELL}`}>
          {/* a 16:9 sheet at full width is 648px tall on a wide screen, which would push
              everything else off a laptop display — so it is also capped by the height
              left over, the same fit the editor's own canvas does */}
          <LiveSlide style={{ maxWidth: "calc((100dvh - 19rem) * 16 / 9)" }} />

          <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {user ? (
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center gap-2 border border-primary bg-primary px-6 text-base font-medium text-primary-foreground transition-all hover:-translate-y-px hover:shadow-[0_0_32px_-4px_var(--volt)]"
                >
                  {t("site.openMyDecks")}
                  <ArrowRight className="size-4" />
                </Link>
              ) : (
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value="/dashboard" />
                  <GoogleButton size="large" className="w-full px-6 sm:w-auto" />
                </form>
              )}
              <Link
                href="/editor"
                className="inline-flex h-12 items-center justify-center gap-2 border border-border px-6 text-base font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
              >
                {t("site.startWithoutSignIn")}
              </Link>
            </div>

            <p className="max-w-sm font-mono text-[11px] leading-relaxed text-muted-foreground">
              {t("site.storageNote")}
            </p>
          </div>
        </div>
      </section>

      {/* ── spec sheet ───────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className={SHELL}>
          <div className="flex items-baseline justify-between gap-4 py-6">
            <h2 className="text-lg font-bold tracking-tight">{t("spec.heading")}</h2>
            <span className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
              {t("spec.kicker")}
            </span>
          </div>

          <dl className="divide-y divide-border border-y border-border">
            {SPEC.map((row) => (
              <div
                key={row.key}
                className="group grid gap-1.5 py-5 transition-colors hover:bg-card sm:grid-cols-[9rem_1fr] sm:gap-8"
              >
                <dt className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase sm:pt-1">
                  {t(row.label)}
                </dt>
                <dd className="text-sm leading-[1.95] text-muted-foreground">{t(row.body)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── self-hosting ─────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className={`grid gap-8 py-14 lg:grid-cols-[1fr_1.1fr] lg:gap-16 ${SHELL}`}>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{t("host.heading")}</h2>
            <p className="mt-4 text-sm leading-[1.9] text-muted-foreground">
              {t("host.body")}
            </p>
            <a
              href="https://github.com/pipipi-pikachu/PPTist"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 border-b border-border pb-0.5 text-sm transition-colors hover:border-primary hover:text-primary"
            >
              {t("host.reference")}
              <ArrowRight className="size-3.5" />
            </a>
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary" />
              {t("host.terminal")}
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-[1.9] text-foreground">
              <code>
                <span className="text-muted-foreground">$ </span>cp .env.example .env
                {"\n"}
                <span className="text-muted-foreground">$ </span>docker compose up -d
                {"\n\n"}
                <span className="text-muted-foreground">
                  {"# web       → :3000\n"}
                  {"# postgres  → :5433\n"}
                  {"# rustfs    → :9100 / :9101"}
                </span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div
          className={`flex flex-col gap-3 py-8 font-mono text-[11px] tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${SHELL}`}
        >
          <Wordmark />
          <p>{t("site.footerNote")}</p>
        </div>
      </footer>
    </main>
  )
}
