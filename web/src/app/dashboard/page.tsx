import { redirect } from "next/navigation"
import { currentUser } from "@/auth"
import { DeckGrid } from "@/components/dashboard/deck-grid"
import { UserMenu } from "@/components/dashboard/user-menu"
import { Wordmark } from "@/components/site/wordmark"
import { listDecks } from "@/lib/decks"
import { getLocale } from "@/lib/i18n/server"
import { translator } from "@/lib/i18n/translate"

export async function generateMetadata() {
  return { title: translator(await getLocale())("dashboard.metaTitle") }
}

// decks change on every autosave; a cached dashboard would show stale tiles
export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const user = await currentUser()
  if (!user) redirect("/login?next=/dashboard")

  const t = translator(await getLocale())
  const decks = await listDecks(user.id)
  const slides = decks.reduce((total, deck) => total + deck.slideCount, 0)

  return (
    <main className="flex-1 bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Wordmark href="/" />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-4 border-b border-foreground/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
              {t("dashboard.kicker")}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              {t("dashboard.heading")}
            </h1>
          </div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            {t("dashboard.counts", { decks: decks.length, slides })}
          </p>
        </div>

        <div className="mt-10">
          <DeckGrid initial={decks} />
        </div>
      </div>
    </main>
  )
}
