import Link from "next/link"
import { cn } from "@/lib/utils"
import { LogoMark } from "./logo"

/**
 * Mark plus wordmark. The mark is sized in `em`, so the lockup holds together at any
 * font size instead of needing a second set of numbers per placement.
 */
export function Wordmark({
  href = "/",
  className,
}: {
  href?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 text-xl leading-none text-foreground transition-opacity hover:opacity-80",
        className,
      )}
    >
      <LogoMark />
      {/* the serif carries the identity — the Chinese copy can only fall back to a sans */}
      <span className="font-display font-semibold tracking-[-0.015em]">PPTGO</span>
    </Link>
  )
}
