"use client"

import { useEffect, useState } from "react"

/**
 * Starts as `false` on the first render so the markup matches whatever the server produced,
 * then settles once the browser can answer.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [query])

  return matches
}

/** Tailwind's `lg` breakpoint — below it the editor folds its side panels away. */
export const useIsCompact = () => useMediaQuery("(max-width: 1023px)")
