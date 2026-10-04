import { cn } from "@/lib/utils"

/** Section label written `01 / CAPTURED` in Plex Mono — never bracketed. */
export function ChapterLabel({
  index,
  title,
  className,
}: {
  index: string
  title: string
  className?: string
}) {
  return (
    <p className={cn("font-mono text-[11px] uppercase tracking-[0.22em]", className)}>
      <span className="text-[var(--somaiya)]">{index}</span>
      <span className="mx-2 text-[var(--mute)]">/</span>
      <span className="text-[var(--cream-dim)]">{title}</span>
    </p>
  )
}
