import { useEffect, useRef, useState } from "react"
import { ScrollTrigger } from "@/lib/gsap"
import { cn } from "@/lib/utils"

/**
 * A DB row as a key/value card that "inserts" with a slide plus a red flash
 * the first time it scrolls into view. Reduced motion shows the end state.
 */
export function RowCard({
  title,
  rows,
  className,
}: {
  title: string
  rows: Array<[string, string]>
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }
    const el = ref.current
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => setInView(true),
    })
    return () => {
      st.kill()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] transition-all duration-700",
        inView
          ? "translate-x-0 opacity-100"
          : "-translate-x-6 opacity-0",
        className
      )}
      style={
        inView
          ? { animation: "row-flash 0.9s ease-out 1" }
          : undefined
      }
    >
      <style>{`
        @keyframes row-flash {
          0% { box-shadow: inset 0 0 0 999px rgba(215, 38, 61, 0.22); }
          100% { box-shadow: inset 0 0 0 999px rgba(215, 38, 61, 0); }
        }
      `}</style>
      <p className="font-mono border-b border-[var(--rule)] px-4 py-2 text-[11px] tracking-[0.18em] text-[var(--somaiya)]">
        {title}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[12px] text-[var(--mute)]">{k}</dt>
            <dd className="font-mono text-[12px] text-[var(--amber)]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
