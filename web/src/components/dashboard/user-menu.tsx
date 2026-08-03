"use client"

import { LogOut, Presentation } from "lucide-react"
import Link from "next/link"
import { signOutEverywhere } from "@/app/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/lib/i18n/client"
import type { SessionUser } from "@/auth"

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useT()
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-none border border-transparent p-1 pr-2.5 transition-colors hover:border-border hover:bg-muted">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatars come from Google's CDN, not the app
            <img
              src={user.image}
              alt=""
              width={28}
              height={28}
              className="size-7 border border-border object-cover"
            />
          ) : (
            /* an avatar is not an action — the accent stays reserved for things you press */
            <span className="grid size-7 place-items-center border border-border bg-muted text-xs font-semibold">
              {initial}
            </span>
          )}
          <span className="hidden max-w-32 truncate text-sm sm:block">
            {user.name ?? user.email}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/editor">
            <Presentation className="size-4" />
            {t("dashboard.localEditor")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* a server action, so signing out invalidates the session row itself */}
        <form action={signOutEverywhere}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut className="size-4" />
              {t("dashboard.signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
