import type { RefObject } from "react"
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap"

/**
 * One pinned, scrubbed animation per chapter. `draw(p)` receives scroll
 * progress 0 → 1 and must write to refs / drive GSAP tweens only — never
 * React state, so the page holds 60 fps.
 *
 * - Desktop: the section pins for `extra` viewport lengths while scrubbing.
 * - Mobile (<768px): nothing pins; the animation plays once on entry.
 * - Reduced motion: jumps straight to the end state, no pin, no scrub.
 */
export function usePinnedScrub(
  rootRef: RefObject<HTMLElement | null>,
  draw: (p: number) => void,
  extra = "120%"
): void {
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
      if (reduced) {
        draw(1)
        return
      }
      const ctx = gsap.context(() => {
        if (window.innerWidth < 768) {
          const obj = { p: 0 }
          gsap.to(obj, {
            p: 1,
            duration: 1.4,
            ease: "power2.out",
            onUpdate: () => draw(obj.p),
            scrollTrigger: { trigger: root, start: "top 75%", once: true },
          })
          return
        }
        const obj = { p: 0 }
        gsap.to(obj, {
          p: 1,
          ease: "none",
          onUpdate: () => draw(obj.p),
          scrollTrigger: {
            trigger: root,
            start: "top top",
            end: `+=${extra}`,
            scrub: true,
            pin: true,
            anticipatePin: 1,
          },
        })
      }, root)
      return () => ctx.revert()
    },
    { scope: rootRef, dependencies: [] }
  )
}

/** Simple reveal-once helper for copy blocks (no pin, no scrub). */
export function useReveal(rootRef: RefObject<HTMLElement | null>): void {
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return
      }
      const ctx = gsap.context(() => {
        gsap.fromTo(
          ".reveal",
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: root, start: "top 78%", once: true },
          }
        )
      }, root)
      return () => ctx.revert()
    },
    { scope: rootRef, dependencies: [] }
  )
}

export { ScrollTrigger }
