"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Copy, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createDeck } from "@/lib/factory"
import type { DeckSummary } from "@/types/deck"

export function DeckGrid({ initial }: { initial: DeckSummary[] }) {
  const router = useRouter()
  const [decks, setDecks] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<DeckSummary | null>(null)
  const [deleting, setDeleting] = useState<DeckSummary | null>(null)
  const [, startTransition] = useTransition()

  async function call<T>(input: string, init: RequestInit): Promise<T | null> {
    const response = await fetch(input, init)
    if (response.status === 204) return null
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error((body as { error?: string })?.error ?? `请求失败（${response.status}）`)
    }
    return body as T
  }

  async function onCreate() {
    setCreating(true)
    setError(null)
    try {
      // the starter deck is built here rather than on the server: its text runs go
      // through sanitizeHtml, which needs a DOM
      const body = await call<{ deck: DeckSummary }>("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck: createDeck() }),
      })
      if (body) router.push(`/editor/${body.deck.id}`)
    } catch (e) {
      setError((e as Error).message)
      setCreating(false)
    }
  }

  async function onRename(deck: DeckSummary, title: string) {
    setError(null)
    try {
      const body = await call<{ deck: DeckSummary }>(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      if (body) {
        setDecks((list) => list.map((d) => (d.id === deck.id ? body.deck : d)))
      }
      setRenaming(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function onDuplicate(deck: DeckSummary) {
    setError(null)
    try {
      const body = await call<{ deck: DeckSummary }>(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" }),
      })
      if (body) setDecks((list) => [body.deck, ...list])
      startTransition(() => router.refresh())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function onDelete(deck: DeckSummary) {
    setError(null)
    try {
      await call(`/api/decks/${deck.id}`, { method: "DELETE" })
      setDecks((list) => list.filter((d) => d.id !== deck.id))
      setDeleting(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      {error && (
        <p className="mb-6 border-l-2 border-destructive bg-destructive/12 px-4 py-3 text-sm text-foreground">
          {error}
        </p>
      )}

      {/* spaced cells rather than a gap-px bed: a partly filled last row would show the
          bed colour as grey blocks where no card sits */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <button
          onClick={onCreate}
          disabled={creating}
          className="group flex flex-col border border-border bg-card text-left transition-colors hover:bg-muted disabled:opacity-60"
        >
          <span className="flex aspect-video w-full items-center justify-center border-b border-border">
            <span className="grid size-12 place-items-center border border-dashed border-foreground/30 transition-colors group-hover:border-primary group-hover:bg-primary/8">
              {creating ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <Plus className="size-5 text-foreground/60 transition-colors group-hover:text-primary" />
              )}
            </span>
          </span>
          <span className="px-5 pt-4 pb-5">
            <span className="block text-base font-bold tracking-[-0.02em]">
              {creating ? "正在创建…" : "新建演示文稿"}
            </span>
            <span className="mt-1.5 block font-mono text-[11px] tracking-wider text-muted-foreground">
              16 : 9 · 空白稿
            </span>
          </span>
        </button>

        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            onRename={() => setRenaming(deck)}
            onDuplicate={() => onDuplicate(deck)}
            onDelete={() => setDeleting(deck)}
          />
        ))}
      </div>

      {!decks.length && (
        <p className="mt-8 font-mono text-xs tracking-wider text-muted-foreground">
          还没有演示文稿——从上面那块虚线方框开始。
        </p>
      )}

      <RenameDialog
        deck={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={onRename}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除《{deleting?.title}》？</DialogTitle>
            <DialogDescription>
              演示文稿正文和缩略图会一并从对象存储里删除，无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && onDelete(deleting)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DeckCard({
  deck,
  onRename,
  onDuplicate,
  onDelete,
}: {
  deck: DeckSummary
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <article className="group relative border border-border bg-card transition-colors hover:bg-muted">
      <Link href={`/editor/${deck.id}`} className="block">
        <div className="relative aspect-video overflow-hidden border-b border-border bg-white">
          {deck.hasThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by an authorised API route, not a static asset
            <img
              src={`/api/decks/${deck.id}/thumbnail?v=${encodeURIComponent(deck.updatedAt)}`}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted">
              <span className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
                no preview
              </span>
            </div>
          )}
          <span className="absolute inset-0 ring-1 ring-transparent transition-all group-hover:ring-primary ring-inset" />
        </div>

        <div className="px-5 pt-4 pb-5">
          <h3 className="truncate pr-8 text-base font-bold tracking-[-0.02em]">
            {deck.title}
          </h3>
          <p
            suppressHydrationWarning
            className="mt-1.5 font-mono text-[11px] tracking-wider text-muted-foreground"
          >
            {deck.slideCount} 页 · {formatSize(deck.byteSize)} · {formatTime(deck.updatedAt)}
          </p>
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="更多操作"
            className="absolute right-3 bottom-4 grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="size-4" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="size-4" />
            创建副本
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 className="size-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}

function RenameDialog({
  deck,
  onClose,
  onSubmit,
}: {
  deck: DeckSummary | null
  onClose: () => void
  onSubmit: (deck: DeckSummary, title: string) => void
}) {
  return (
    <Dialog open={Boolean(deck)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名演示文稿</DialogTitle>
          <DialogDescription>标题同时会写进演示文稿本身。</DialogDescription>
        </DialogHeader>
        {/* keyed on the deck so the field is seeded by mount rather than by an effect */}
        {deck && (
          <RenameForm key={deck.id} deck={deck} onClose={onClose} onSubmit={onSubmit} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  deck,
  onClose,
  onSubmit,
}: {
  deck: DeckSummary
  onClose: () => void
  onSubmit: (deck: DeckSummary, title: string) => void
}) {
  const [title, setTitle] = useState(deck.title)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const next = title.trim()
        if (next) onSubmit(deck, next)
      }}
      className="grid gap-4"
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        autoFocus
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={!title.trim()}>
          保存
        </Button>
      </DialogFooter>
    </form>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Rendered on the server too, where "now" and the timezone differ from the browser's —
 * hence `suppressHydrationWarning` on the element that shows it.
 */
function formatTime(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / 60 / 24)} 天前`
  return then.toLocaleDateString("zh-CN")
}
