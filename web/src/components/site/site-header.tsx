import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { signInWithGoogle } from "@/app/actions/auth"
import { GithubLink } from "@/components/site/github-link"
import { GoogleButton } from "@/components/site/google-button"
import { LanguageToggle } from "@/components/site/language-toggle"
import { ThemeToggle } from "@/components/site/theme-toggle"
import { Wordmark } from "@/components/site/wordmark"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"
import type { SessionUser } from "@/auth"

/**
 * One measure for the site's chrome. The bar keeps it whatever the page below is set in:
 * the guide reads better at a narrower measure, but a header that narrows with it starts
 * wrapping its own tagline and button while the landing page's stays on one line, which is
 * the opposite of one header.
 */
export const SITE_SHELL = "mx-auto w-full max-w-6xl px-5 sm:px-8"

/**
 * The bar across the top of the public pages. It is the app's own chrome height, not a
 * marketing header.
 *
 * One component rather than a copy per page: the landing page and the MCP guide had two
 * of these, and the second one had already drifted — it was missing the tagline, the
 * editor link and the sign-in button, so arriving at the guide felt like leaving the site.
 *
 * `user` is passed in rather than read here so a page that already knows who is signed in
 * does not pay for a second session lookup.
 */
export async function SiteHeader({ user }: { user: SessionUser | null }) {
  const t = translator(await getLocale())

  return (
    <header className="border-b border-border">
      <div className={`flex h-14 items-center justify-between gap-4 ${SITE_SHELL}`}>
        <div className="flex items-baseline gap-4">
          <Wordmark />
          <span className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
            {t("site.tagline")}
          </span>
        </div>
        <nav className="flex items-center gap-3 sm:gap-5">
          {/* the two icon controls share a size and a rule, so they read as one cluster */}
          <div className="flex items-center gap-2">
            <GithubLink />
            <LanguageToggle />
            <ThemeToggle />
          </div>
          {/* one breakpoint later than the rest of the bar: at `sm` the mark, the tagline,
              three controls, a link and a filled button already fill the row, and this is
              the item a visitor is least likely to be looking for on a small screen */}
          <Link
            href="/mcp"
            className="hidden font-mono text-[11px] tracking-[0.2em] whitespace-nowrap text-muted-foreground uppercase transition-colors hover:text-primary lg:block"
          >
            {t("mcp.navLink")}
          </Link>
          <Link
            href="/editor"
            className="hidden font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-primary sm:block"
          >
            {t("site.openEditor")}
          </Link>
          {/* on a phone the bar cannot hold the mark, the controls and a filled button
              without wrapping — and the same call to action is one screen down at full
              width, so this copy of it is the one that goes */}
          <div className="hidden sm:block">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center gap-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:shadow-[0_0_24px_-4px_var(--volt)]"
              >
                {t("site.myDecks")}
                <ArrowRight className="size-3" />
              </Link>
            ) : (
              <form action={signInWithGoogle}>
                <input type="hidden" name="next" value="/dashboard" />
                <GoogleButton className="h-8 w-auto gap-2 px-3 text-xs" />
              </form>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
