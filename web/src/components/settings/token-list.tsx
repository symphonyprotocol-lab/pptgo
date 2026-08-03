"use client"

import { useState } from "react"
import { Check, Copy, Loader2, Trash2 } from "lucide-react"
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
import { useI18n } from "@/lib/i18n/client"
import { formatDate, formatTime } from "@/lib/relative-time"
import type { Translate } from "@/lib/i18n/translate"
import type { ApiTokenSummary } from "@/types/token"

const EXPIRY_CHOICES = ["never", "30", "90", "365"] as const

export function TokenList({ initial }: { initial: ApiTokenSummary[] }) {
  const { t, locale } = useI18n()
  const [tokens, setTokens] = useState(initial)
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState<string>("never")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The plaintext, held only until the reader closes the dialog. */
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ApiTokenSummary | null>(null)

  async function onCreate() {
    if (!name.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        summary?: ApiTokenSummary
        token?: string
        error?: string
      } | null
      if (!response.ok || !body?.summary || !body.token) {
        throw new Error(body?.error ?? t("api.requestFailed", { status: response.status }))
      }
      setTokens((all) => [body.summary as ApiTokenSummary, ...all])
      setRevealed(body.token)
      setName("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function onRevoke(token: ApiTokenSummary) {
    setRevoking(null)
    setError(null)
    try {
      const response = await fetch(`/api/tokens/${token.id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? t("api.requestFailed", { status: response.status }))
      }
      setTokens((all) => all.filter((one) => one.id !== token.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="token-name">{t("tokens.newName")}</Label>
          <Input
            id="token-name"
            value={name}
            maxLength={100}
            placeholder={t("tokens.newNamePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void onCreate()}
          />
        </div>

        <div className="space-y-1.5 sm:w-40">
          <Label htmlFor="token-expiry">{t("tokens.expiry")}</Label>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger id="token-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_CHOICES.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {choice === "never"
                    ? t("tokens.expiryNever")
                    : t("tokens.expiryDays", { days: choice })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => void onCreate()} disabled={!name.trim() || creating}>
          {creating && <Loader2 className="size-4 animate-spin" />}
          {creating ? t("tokens.creating") : t("tokens.create")}
        </Button>
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {tokens.length ? (
        <ul className="mt-6 divide-y divide-border border border-border bg-card">
          {tokens.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              t={t}
              locale={locale}
              onRevoke={() => setRevoking(token)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-6 font-mono text-xs tracking-wider text-muted-foreground">
          {t("tokens.empty")}
        </p>
      )}

      <RevealDialog token={revealed} t={t} onClose={() => setRevealed(null)} />

      <Dialog open={Boolean(revoking)} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tokens.revokeTitle", { name: revoking?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("tokens.revokeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              {t("tokens.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => revoking && void onRevoke(revoking)}>
              {t("tokens.revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TokenRow({
  token,
  t,
  locale,
  onRevoke,
}: {
  token: ApiTokenSummary
  t: Translate
  locale: string
  onRevoke: () => void
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{token.name}</span>
          {token.expired && (
            <span className="border border-destructive/40 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-destructive uppercase">
              {t("tokens.expired")}
            </span>
          )}
        </div>
        <p
          className="mt-1 font-mono text-[11px] tracking-wider text-muted-foreground"
          suppressHydrationWarning
        >
          {token.prefix}… · {t("tokens.createdAt", { time: formatTime(token.createdAt, t, locale) })}{" "}
          ·{" "}
          {token.lastUsedAt
            ? t("tokens.lastUsed", { time: formatTime(token.lastUsedAt, t, locale) })
            : t("tokens.neverUsed")}{" "}
          ·{" "}
          {token.expiresAt
            ? t("tokens.expiresAt", { time: formatDate(token.expiresAt, locale) })
            : t("tokens.noExpiry")}
        </p>
      </div>

      <Button variant="ghost" size="sm" onClick={onRevoke} aria-label={t("tokens.revoke")}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  )
}

/**
 * The one sighting of the plaintext. There is no way back to this dialog: the server keeps
 * only a hash, so closing it really is the end of the token's readable life.
 */
function RevealDialog({
  token,
  t,
  onClose,
}: {
  token: string | null
  t: Translate
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // a clipboard the browser will not hand over is not an error worth a banner — the
      // token is on screen and selectable
    }
  }

  return (
    <Dialog
      open={Boolean(token)}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tokens.revealTitle")}</DialogTitle>
          <DialogDescription>{t("tokens.revealBody")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
            {token}
          </code>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("tokens.copied") : t("tokens.copy")}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("tokens.revealDone")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
