"use client"

import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/client"
import { LOCALES, type Locale } from "@/lib/i18n/locale"

/**
 * Each language is labelled in itself — 中文 and English, never "Chinese" — because the
 * person who needs the switch is by definition the one who cannot read the current one.
 *
 * Unlike the theme control this can render its own state directly: the language came from
 * the server, so the first paint is already correct and there is nothing to correct.
 */
const LABEL: Record<Locale, string> = { zh: "中文", en: "EN" }

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, t, setLocale } = useI18n()

  return (
    <div
      role="group"
      aria-label={t("lang.group")}
      className={cn("flex items-center border border-border", className)}
    >
      {LOCALES.map((option, index) => (
        <button
          key={option}
          type="button"
          aria-label={t(option === "zh" ? "lang.zh" : "lang.en")}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
          className={cn(
            "h-7 px-2 font-mono text-[11px] tracking-wider transition-colors",
            index > 0 && "border-l border-border",
            locale === option
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          )}
        >
          {LABEL[option]}
        </button>
      ))}
    </div>
  )
}
