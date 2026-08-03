import { cn } from "@/lib/utils"

/**
 * The mark is the turn: a sheet, and the next one already swinging in beside it.
 *
 * It is solid rather than outlined on purpose. An outlined rectangle with something in
 * one corner is what every slide tool draws, and at wordmark size an outline is a
 * hairline that gives the lockup nothing to stand on — the mass here is what lets a 22px
 * mark hold its own next to a serif of the same height.
 *
 * Every measurement is doing work. The pair fills a 24 × 13.5 field, which is 16:9 to
 * the pixel — the constant the whole app is built on — so it reads as slides and not as
 * two generic blocks. Both cuts run at the same angle and the channel between them is a
 * constant 1.6 wide at every height, because a gap that pinches is what turns two shapes
 * into one smudge at favicon size. The accent is spent on the incoming sheet alone: the
 * next slide is the thing the product is for, and it is the "go" in the name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 13.5"
      aria-hidden
      className={cn("h-[1.1em] w-auto shrink-0", className)}
    >
      {/* the sheet you are on — square on the left, cut on the right */}
      <path d="M0 0h14.4L10.4 13.5H0z" fill="currentColor" />
      {/* the one coming in, leaning at the same angle so the channel stays parallel */}
      <path d="M16 0h8l-4 13.5h-8z" fill="var(--volt)" />
    </svg>
  )
}
