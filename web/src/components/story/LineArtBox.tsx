import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Bordered line-art box: the landing's repeating visual frame. A 1 px
 * --line square-ish box on transparent ground holding a white/ice SVG or
 * canvas drawing, with a 12 px caption under it in --text-2.
 */
export function LineArtBox({
  caption,
  children,
  className,
}: {
  caption: string
  children: ReactNode
  className?: string
}) {
  return (
    <figure className={cn("w-full", className)}>
      <div className="border border-[var(--line)] bg-transparent p-4">
        {children}
      </div>
      <figcaption className="mt-2 text-[12px] leading-snug text-[var(--text-2)]">
        {caption}
      </figcaption>
    </figure>
  )
}
