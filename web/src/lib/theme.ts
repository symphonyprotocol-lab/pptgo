/**
 * Theme preference, shared by the inline boot script and the toggle.
 *
 * Three states, not two: "system" is a real choice, and it is the default — the page
 * follows `prefers-color-scheme` until the user says otherwise, and keeps following it
 * afterwards if they pick "system" again.
 *
 * The resolved theme lands on `<html>` as the `dark` class (which is what the shadcn
 * palette and every `dark:` branch keys off) and the raw preference lands as
 * `data-theme-pref` (which is what the toggle's own highlight keys off, so the control
 * needs no client state and cannot render the wrong segment before hydration).
 */

export const THEME_STORAGE_KEY = "pptgo-theme"

export type ThemePref = "system" | "light" | "dark"

export const THEME_PREFS = ["system", "light", "dark"] as const

export const DEFAULT_THEME_PREF: ThemePref = "system"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function isThemePref(value: unknown): value is ThemePref {
  return value === "system" || value === "light" || value === "dark"
}

/** What the user last chose, or "system" if they never chose or storage is walled off. */
export function readThemePref(): ThemePref {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePref(stored) ? stored : DEFAULT_THEME_PREF
  } catch {
    return DEFAULT_THEME_PREF
  }
}

/** Persist a choice and paint it. */
export function setThemePref(pref: ThemePref) {
  try {
    if (pref === DEFAULT_THEME_PREF) window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // private mode, storage disabled — the choice just won't outlive the tab
  }
  applyThemePref(pref)
}

/** Write a preference onto `<html>`. Mirrors what the boot script does. */
export function applyThemePref(pref: ThemePref) {
  const root = document.documentElement
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(DARK_QUERY).matches)
  root.classList.toggle("dark", dark)
  root.dataset.themePref = pref
}

/**
 * Runs synchronously in `<head>`, before the browser paints, so a dark-mode visitor
 * never sees a white flash. It also keeps the `system` case live for the lifetime of
 * the document, which means every page gets system-following for free — the toggle
 * component only has to exist where we want the control itself.
 *
 * Kept to plain ES5 in one statement: it ships as-is, unbundled and untranspiled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement,m=window.matchMedia("${DARK_QUERY}");function a(){var p="${DEFAULT_THEME_PREF}";try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");if(s==="light"||s==="dark"||s==="system")p=s}catch(e){}r.classList.toggle("dark",p==="dark"||(p==="system"&&m.matches));r.dataset.themePref=p}a();m.addEventListener("change",a)}catch(e){}})()`
