"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Link2, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Translate } from "@/lib/i18n/translate"
import type { DeckSummary } from "@/types/deck"
import type { Share, ShareMode } from "@/types/share"

/**
 * Where an owner decides who else may see a deck.
 *
 * The dialog is deliberately one screen with one Save: sharing is three small decisions —
 * on or off, read or edit, password or not — and splitting them across steps would make
 * the common case (send someone a link) longer than typing the email that carries it.
 */
export function ShareDialog({
  deck,
  t,
  onClose,
  onChanged,
}: {
  deck: DeckSummary | null
  t: Translate
  onClose: () => void
  /** so the card behind can show, or stop showing, its "shared" mark */
  onChanged: (deckId: string, share: Share | null) => void
}) {
  return (
    <Dialog open={Boolean(deck)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* keyed on the deck: every field is seeded by mount rather than by an effect */}
        {deck && <ShareForm key={deck.id} deck={deck} t={t} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  )
}

function ShareForm({
  deck,
  t,
  onChanged,
}: {
  deck: DeckSummary
  t: Translate
  onChanged: (deckId: string, share: Share | null) => void
}) {
  const [share, setShare] = useState<Share | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [mode, setMode] = useState<ShareMode>("read")
  /** Empty means "leave the password alone", which is not the same as "remove it". */
  const [password, setPassword] = useState("")
  const [clearPassword, setClearPassword] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/decks/${deck.id}/share`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((body: { share: Share | null }) => {
        if (cancelled) return
        setShare(body.share)
        if (body.share) setMode(body.share.mode)
      })
      .catch(() => !cancelled && setError(t("api.requestFailed", { status: 0 })))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [deck.id, t])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/decks/${deck.id}/share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          // three-valued on purpose: a string sets one, null removes it, and leaving the
          // field out keeps whatever is stored
          ...(clearPassword ? { password: null } : password ? { password } : {}),
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        share?: Share
        error?: string
      } | null
      if (!response.ok || !body?.share) {
        throw new Error(body?.error ?? t("api.requestFailed", { status: response.status }))
      }
      setShare(body.share)
      setPassword("")
      setClearPassword(false)
      onChanged(deck.id, body.share)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/decks/${deck.id}/share`, { method: "DELETE" })
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? t("api.requestFailed", { status: response.status }))
      }
      setShare(null)
      onChanged(deck.id, null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const url = share ? `${window.location.origin}${share.path}` : ""

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // a clipboard the browser will not hand over is not worth a banner — the link is on
      // screen and selectable
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("share.title", { title: deck.title })}</DialogTitle>
        <DialogDescription>{t("share.intro")}</DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="grid h-32 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-mode">{t("share.modeLabel")}</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as ShareMode)}>
              <SelectTrigger id="share-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">{t("share.modeRead")}</SelectItem>
                <SelectItem value="edit">{t("share.modeEdit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-password">{t("share.passwordLabel")}</Label>
            <Input
              id="share-password"
              type="password"
              autoComplete="new-password"
              maxLength={100}
              value={password}
              disabled={clearPassword}
              placeholder={t("share.passwordPlaceholder")}
              onChange={(event) => setPassword(event.target.value)}
            />
            {share?.hasPassword && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="flex items-center gap-1 font-mono text-[11px] tracking-wider text-muted-foreground">
                  <Lock className="size-3" />
                  {t("share.passwordSet")} · {t("share.passwordKeep")}
                </span>
                <button
                  type="button"
                  onClick={() => setClearPassword((on) => !on)}
                  className="shrink-0 text-xs underline underline-offset-3 hover:text-foreground"
                >
                  {clearPassword ? t("share.close") : t("share.passwordClear")}
                </button>
              </div>
            )}
          </div>

          {share && (
            <div className="space-y-1.5">
              <Label>{t("share.linkLabel")}</Label>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {url}
                </code>
                <Button variant="secondary" size="sm" onClick={() => void copy()}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? t("share.copied") : t("share.copy")}
                </Button>
              </div>
              <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
                {t("share.revokeHint")}
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      <DialogFooter>
        {share && (
          <Button variant="outline" disabled={busy} onClick={() => void revoke()}>
            {t("share.revoke")}
          </Button>
        )}
        <Button disabled={busy || loading} onClick={() => void save()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {share ? t("share.save") : t("share.on")}
        </Button>
      </DialogFooter>
    </>
  )
}

/** The mark on a card that already has a link out in the world. */
export function ShareBadge({ share, t }: { share: Share; t: Translate }) {
  return (
    <span className="flex items-center gap-1 border border-border bg-background/90 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
      {share.hasPassword ? <Lock className="size-3" /> : <Link2 className="size-3" />}
      {share.hasPassword
        ? t("share.badgeLocked")
        : share.mode === "edit"
          ? t("share.badgeEdit")
          : t("share.badge")}
    </span>
  )
}
