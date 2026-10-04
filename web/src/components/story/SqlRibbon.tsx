import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ScrollTrigger } from "@/lib/gsap"
import { cn } from "@/lib/utils"

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "CALL", "COMMIT",
  "ROLLBACK", "SAVEPOINT", "WITH", "RECURSIVE", "AS", "CYCLE", "SET",
  "USING", "JOIN", "LATERAL", "DISTINCT", "ON", "ORDER", "BY", "LIMIT",
  "UPDATE", "AND", "OR", "NOT", "NULL", "PROCEDURE", "EXCEPTION",
  "UNION", "ALL", "LEAST", "GREATEST",
])

function highlight(slice: string): ReactNode[] {
  const parts = slice.split(/(\s+|[(),;])/g)
  return parts.map((tok, i) => {
    if (KEYWORDS.has(tok.toUpperCase())) {
      return (
        <span key={i} className="text-[var(--ice)]">
          {tok}
        </span>
      )
    }
    if (/^'.*'$/.test(tok) || /^".*"$/.test(tok)) {
      return (
        <span key={i} className="text-[var(--ok)]">
          {tok}
        </span>
      )
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(tok)) {
      return (
        <span key={i} className="text-[var(--warn)]">
          {tok}
        </span>
      )
    }
    return <span key={i}>{tok}</span>
  })
}

/**
 * A strip of real SQL in mono, typed out with a caret. Keywords render ice,
 * identifiers in primary text. Typing starts when scrolled into view (ScrollTrigger,
 * once) and the full text shows immediately under reduced motion.
 */
export function SqlRibbon({
  sql,
  caption,
  className,
}: {
  sql: string
  caption?: string
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const full = useMemo(() => sql.trim(), [sql])
  const [typed, setTyped] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? full.length
      : 0
  )

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }
    const el = boxRef.current
    if (!el) return
    let timer: number | undefined
    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        let n = 0
        timer = window.setInterval(() => {
          n += 3
          if (n >= full.length) {
            n = full.length
            if (timer !== undefined) window.clearInterval(timer)
          }
          setTyped(n)
        }, 16)
      },
    })
    return () => {
      st.kill()
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [full])

  const slice = full.slice(0, typed)
  const done = typed >= full.length

  return (
    <figure className={cn("w-full", className)}>
      <div
        ref={boxRef}
        className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--space)] p-4"
      >
        <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[var(--text)]">
          {highlight(slice)}
          {!done && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] motion-safe:animate-pulse bg-[var(--ice)]"
            />
          )}
        </pre>
      </div>
      {caption && (
        <figcaption className="font-mono mt-2 text-[11px] tracking-wide text-[var(--text-3)]">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
