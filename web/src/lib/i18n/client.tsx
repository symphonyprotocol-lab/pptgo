"use client"

import { createContext, useCallback, useContext, useMemo } from "react"
import { useRouter } from "next/navigation"
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./locale"
import { translator, type Translate } from "./translate"

interface I18n {
  locale: Locale
  t: Translate
  setLocale: (next: Locale) => void
}

const Context = createContext<I18n | null>(null)

/**
 * Carries the language the server already resolved down to client components, so both
 * halves of a page agree on the first render and nothing has to be corrected afterwards.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()

  const setLocale = useCallback(
    (next: Locale) => {
      // a cookie rather than component state, because the pages that need it most are
      // server-rendered; `refresh` re-runs them with the new value
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en"
      router.refresh()
    },
    [router],
  )

  const value = useMemo<I18n>(
    () => ({ locale, t: translator(locale), setLocale }),
    [locale, setLocale],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useI18n(): I18n {
  const value = useContext(Context)
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>")
  return value
}

/** Shorthand for the common case of only needing the lookup. */
export function useT(): Translate {
  return useI18n().t
}
