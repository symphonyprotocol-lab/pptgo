"use client"

import { useActionState } from "react"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/client"
import { unlockShare, type UnlockState } from "./actions"

/** The whole page for a locked link: there is nothing else to show until it opens. */
export function UnlockForm({ token }: { token: string }) {
  const t = useT()
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockShare, {})

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <form action={action} className="w-full max-w-sm space-y-5">
        <input type="hidden" name="token" value={token} />

        <div className="space-y-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.24em] text-primary uppercase">
            <Lock className="size-3" />
            {t("share.lockedBadge")}
          </span>
          <h1 className="font-heading text-xl font-medium">{t("share.lockedTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("share.lockedBody")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="share-password">{t("share.password")}</Label>
          <Input
            id="share-password"
            name="password"
            type="password"
            autoFocus
            autoComplete="off"
            maxLength={100}
          />
        </div>

        {state.error && <p className="text-xs text-destructive">{state.error}</p>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("share.unlocking") : t("share.unlock")}
        </Button>
      </form>
    </div>
  )
}
