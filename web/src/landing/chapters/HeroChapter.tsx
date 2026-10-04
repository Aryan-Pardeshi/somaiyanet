import { useRef } from "react"
import { OrbitScene } from "@/landing/OrbitScene"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

/**
 * Hero. Wireframe Earth offset to the right half, 8 small white sats and
 * one red packet dot riding SAT-A3. The section pins while the headline
 * drifts up and fades.
 */
export function HeroChapter() {
  const rootRef = useRef<HTMLElement | null>(null)
  const textRef = useRef<HTMLDivElement>(null)

  useReveal(rootRef)
  usePinnedScrub(
    rootRef,
    (p) => {
      const el = textRef.current
      if (!el) return
      el.style.transform = `translateY(${-p * 120}px)`
      el.style.opacity = String(1 - p * 0.85)
    },
    "80%"
  )

  return (
    <section
      id="hero"
      data-status="QUEUED"
      ref={rootRef}
      className="relative flex min-h-svh flex-col overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 md:left-1/2 md:w-1/2">
        <OrbitScene mode="hero" height={900} />
      </div>

      <div
        ref={textRef}
        className="shell relative z-10 flex flex-1 flex-col justify-end pb-28 pt-36"
      >
        <p className="text-[13px] font-medium text-[var(--text-2)]">
          Life of a packet
        </p>
        <h1 className="text-balance mt-6 max-w-[16ch] text-[48px] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--text)] md:text-[72px]">
          Every packet has a story. This is how a PocketQube constellation
          decides which ones reach Earth.
        </h1>
        <p className="reveal mt-6 text-[16px] text-[var(--text-2)]">
          SomaiyaNet, KJS-SRS-01, DBMS mini project
        </p>
        <p className="reveal mt-10 flex items-center gap-3 text-[13px] text-[var(--text-3)]">
          <span className="inline-block h-8 w-px animate-pulse bg-[var(--ice)]" />
          Scroll to follow PKT 0412
        </p>
      </div>
    </section>
  )
}
