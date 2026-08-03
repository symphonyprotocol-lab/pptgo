import { redirect } from "next/navigation"
import { currentUser } from "@/auth"
import { UserMenu } from "@/components/dashboard/user-menu"
import { TokenList } from "@/components/settings/token-list"
import { Wordmark } from "@/components/site/wordmark"
import { listTokens } from "@/lib/api-token"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

export async function generateMetadata() {
  return { title: translator(await getLocale())("tokens.metaTitle") }
}

// `lastUsedAt` moves whenever a token is used; a cached page would show it stale
export const dynamic = "force-dynamic"

export default async function TokensPage() {
  const user = await currentUser()
  if (!user) redirect("/login?next=/settings/tokens")

  const t = translator(await getLocale())
  const tokens = await listTokens(user.id)

  return (
    <main className="flex-1 bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Wordmark href="/dashboard" />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="border-b border-foreground/20 pb-6">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
            {t("tokens.kicker")}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            {t("tokens.heading")}
          </h1>
          <p className="mt-4 max-w-prose text-sm text-muted-foreground">{t("tokens.intro")}</p>
        </div>

        <div className="mt-10">
          <TokenList initial={tokens} />
        </div>
      </div>
    </main>
  )
}
