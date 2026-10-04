// adapted from lakshyamody/dbmsproj (landing)
/** [ THE CHALLENGE ] â€” three full-width rows with separators that draw in. */
import { useRef } from "react"

import { SectionLabel } from "@/components/brand/Brand"
import { Separator } from "@/components/ui/separator"
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap"

const ROWS = [
  {
    n: "01",
    title: "Minutes-long ground passes",
    body: "Each satellite clears a ground station for minutes a day. Whatever is not sent in that window waits an orbit — or hops over an inter-satellite link toward the satellite that meets Earth first.",
  },
  {
    n: "02",
    title: "A power budget under 1 W",
    body: "Average compute and radio spend stays under a watt. SSTV is the hungriest mode, so when the battery sags the router sheds images first, voice next, and never sheds housekeeping.",
  },
  {
    n: "03",
    title: "The AI must never drop housekeeping",
    body: "TT&C always flies first. A decision-tree router proposes each downlink and a SQL watchdog overrides anything unsafe — low battery, no contact, or a weak link — back to a safe action.",
  },
]

export function Challenge() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return

      gsap.utils.toArray<HTMLElement>(".challenge-row").forEach((row) => {
        const line = row.querySelector(".challenge-line")
        gsap.fromTo(
          line,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 1.5,
            ease: "power3.inOut",
            scrollTrigger: { trigger: row, start: "top 88%" },
          }
        )
        gsap.from(row.querySelectorAll(".challenge-fade"), {
          opacity: 0,
          y: 26,
          duration: 1.4,
          stagger: 0.14,
          ease: "power2.out",
          scrollTrigger: { trigger: row, start: "top 88%" },
        })
      })
    },
    { scope: root }
  )

  return (
    <section
      ref={root}
      id="challenge"
      data-glitch
      className="relative border-t border-white/[0.12] py-24 md:py-32"
    >
      <div className="shell">
        <SectionLabel>The challenge</SectionLabel>

        <div className="mt-14">
          {ROWS.map((r) => (
            <article key={r.n} className="challenge-row group">
              <Separator className="challenge-line origin-left" />
              <div className="grid gap-6 py-12 md:grid-cols-[auto_1fr_1.1fr] md:items-start md:gap-12 md:py-16">
                <span className="challenge-fade mono-label pt-2 text-[#3d6bff]">
                  [{r.n}]
                </span>
                <h3
                  className="challenge-fade font-semibold leading-[1.1] tracking-[-0.025em] transition-colors duration-500 group-hover:text-white"
                  style={{ fontSize: "clamp(28px, 3.6vw, 52px)" }}
                >
                  {r.title}
                </h3>
                <p className="challenge-fade max-w-[58ch] text-[15px] leading-[1.8] text-[#8a8f98]">
                  {r.body}
                </p>
              </div>
            </article>
          ))}
          <Separator className="challenge-line origin-left" />
        </div>
      </div>
    </section>
  )
}
