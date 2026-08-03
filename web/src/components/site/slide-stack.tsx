import { cn } from "@/lib/utils"

/**
 * Everything inside the slide is deliberately hard-coded rather than themed. The slide
 * is white because a slide is white — it is the user's document sitting on the app's
 * chrome, not a surface the theme owns — so its contents use fixed dark neutrals, and
 * its selection marks use the same blue the real canvas draws (`canvas.tsx`). The volt
 * accent stays outside the frame, where the app's own UI lives.
 */
const SELECT = "#2563eb"

/** One selection handle, the same eight the canvas draws around a picked element. */
function Handle({ className }: { className: string }) {
  return (
    <span
      style={{ borderColor: SELECT }}
      className={cn("absolute size-2 border bg-white", className)}
    />
  )
}

export function SlideStack({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {/* two slides waiting underneath, rotated as if dealt onto a desk */}
      <div className="absolute inset-0 translate-x-5 translate-y-6 rotate-[1.6deg] border border-white/10 bg-white/[0.04]" />
      <div className="absolute inset-0 translate-x-2.5 translate-y-3 rotate-[0.8deg] border border-white/15 bg-white/[0.08]" />

      {/* the lit surface: a hard shadow would vanish on graphite, so the slide is
          lifted with depth and a faint rim instead */}
      <div className="relative aspect-video bg-white shadow-[0_28px_70px_-16px_rgb(0_0_0/0.75)] ring-1 ring-white/25">
        <div className="absolute inset-0 flex flex-col gap-[4.5%] p-[7%]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-[7px]">
              <div className="h-2.5 w-40 bg-neutral-900 sm:w-52" />
              <div className="h-1.5 w-24 bg-neutral-900/25 sm:w-32" />
            </div>
            <div className="font-mono text-[9px] tracking-widest text-neutral-900/35">
              01 / 12
            </div>
          </div>

          <div className="h-px w-full bg-neutral-900/12" />

          <div className="grid flex-1 grid-cols-5 gap-[5%]">
            <div className="col-span-3 space-y-2 pt-1">
              <div className="h-1.5 w-full bg-neutral-900/18" />
              <div className="h-1.5 w-[92%] bg-neutral-900/18" />
              <div className="h-1.5 w-[78%] bg-neutral-900/18" />
              <div className="h-1.5 w-[86%] bg-neutral-900/18" />
              {/* the bars are percentages, so the row needs a definite height */}
              <div className="mt-5 flex h-16 items-end gap-1.5">
                {[38, 62, 30, 84, 52].map((height, index) => (
                  <div
                    key={height}
                    style={{
                      height: `${height}%`,
                      background: index === 3 ? SELECT : "rgb(23 23 23 / 0.22)",
                    }}
                    className="w-3 sm:w-4"
                  />
                ))}
              </div>
            </div>

            {/* the picked element: a shape with its own handles */}
            <div className="relative col-span-2">
              <div
                style={{ background: `${SELECT}1f`, boxShadow: `inset 0 0 0 1px ${SELECT}` }}
                className="size-full"
              />
              <Handle className="-top-1 -left-1" />
              <Handle className="-top-1 left-1/2 -translate-x-1/2" />
              <Handle className="-top-1 -right-1" />
              <Handle className="top-1/2 -left-1 -translate-y-1/2" />
              <Handle className="top-1/2 -right-1 -translate-y-1/2" />
              <Handle className="-bottom-1 -left-1" />
              <Handle className="-bottom-1 left-1/2 -translate-x-1/2" />
              <Handle className="-bottom-1 -right-1" />
              {/* rotation grip */}
              <span
                style={{ background: SELECT }}
                className="absolute -top-6 left-1/2 h-5 w-px -translate-x-1/2"
              />
              <span
                style={{ borderColor: SELECT }}
                className="absolute -top-8 left-1/2 size-2 -translate-x-1/2 rounded-full border bg-white"
              />
            </div>
          </div>
        </div>

        {/* snap guide, as it appears mid-drag */}
        <div
          style={{ background: `${SELECT}73` }}
          className="absolute inset-y-0 left-[59%] w-px"
        />

        {/* pointer */}
        <svg
          viewBox="0 0 12 18"
          aria-hidden
          className="absolute top-[54%] left-[63%] w-3.5 drop-shadow-[1px_2px_0_rgb(0_0_0/0.25)]"
        >
          <path d="M0 0l12 11.5H6.2L3.4 18 0 0z" fill="#171717" />
        </svg>
      </div>

      {/* alignment mark, bottom-right — app chrome, so it wears the accent */}
      <div className="absolute -right-3 -bottom-3 hidden size-6 sm:block">
        <span className="absolute top-1/2 left-0 h-px w-full bg-primary" />
        <span className="absolute top-0 left-1/2 h-full w-px bg-primary" />
        <span className="absolute inset-1.5 rounded-full border border-primary" />
      </div>
    </div>
  )
}
