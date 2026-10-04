import type { ReactNode } from "react"
import { ChapterLabel } from "@/components/story/ChapterLabel"

/**
 * The story's repeating two-column spread: a sticky left rail carrying the
 * chapter label, headline and copy, and a right column carrying the visual.
 * On mobile the columns stack and nothing pins.
 */
export function ChapterShell({
  index,
  title,
  headline,
  copy,
  visual,
  sectionId,
  status,
}: {
  index: string
  title: string
  headline: string
  copy: string[]
  visual: ReactNode
  sectionId: string
  status: string
}) {
  return (
    <section
      id={sectionId}
      data-status={status}
      className="grid-paper relative border-t border-[var(--rule)]"
    >
      <div className="shell grid gap-10 py-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-0 md:pt-24">
        <div className="self-start md:sticky md:top-24 md:pb-32">
          <ChapterLabel index={index} title={title} />
          <h2 className="font-display text-balance mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-[var(--cream)] md:text-5xl">
            {headline}
          </h2>
          {copy.map((p, i) => (
            <p
              key={i}
              className="reveal mt-5 max-w-[52ch] text-[15px] leading-[1.75] text-[var(--cream-dim)]"
            >
              {p}
            </p>
          ))}
        </div>
        <div className="min-w-0 md:pb-32">{visual}</div>
      </div>
    </section>
  )
}
