"use client"

import { useSyncExternalStore } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { readThemePref, setThemePref, type ThemePref } from "@/lib/theme"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/messages"

const OPTIONS: { pref: ThemePref; label: MessageKey; Icon: typeof Sun }[] = [
  { pref: "system", label: "theme.system", Icon: Monitor },
  { pref: "light", label: "theme.light", Icon: Sun },
  { pref: "dark", label: "theme.dark", Icon: Moon },
]

/**
 * The preference lives in `localStorage`, which is an external store rather than React
 * state — so it is read as one. `getServerSnapshot` returns null because the server
 * genuinely does not know the answer; React uses it for the hydrating render and then
 * swaps in the real value, which is exactly the behaviour we want and the reason this
 * is not a hydration mismatch.
 */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // another tab switching theme should move this control too
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

/**
 * Three segments rather than a two-state switch, because "follow the system" is a
 * distinct answer from either colour and it is the one most people want.
 *
 * The visible selection comes from CSS keyed on `<html data-theme-pref>` (see
 * globals.css), which the boot script sets before the first paint — so the right
 * segment is lit even on a cold load, well before this component hydrates. The value
 * read here only has to keep `aria-pressed` honest for screen readers.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT()
  const pref = useSyncExternalStore(
    subscribe,
    readThemePref,
    () => null,
  )

  return (
    <div
      role="group"
      aria-label={t("theme.group")}
      className={cn("flex items-center border border-border", className)}
    >
      {OPTIONS.map(({ pref: option, label, Icon }, index) => (
        <button
          key={option}
          type="button"
          data-theme-option={option}
          aria-label={t(label)}
          title={t(label)}
          aria-pressed={pref === null ? undefined : pref === option}
          onClick={() => {
            setThemePref(option)
            listeners.forEach((notify) => notify())
          }}
          className={cn(
            "grid size-7 place-items-center text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
            index > 0 && "border-l border-border",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
