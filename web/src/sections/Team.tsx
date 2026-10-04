// adapted from lakshyamody/dbmsproj (landing)
/**
 * [ THE TEAM ] â€” one tilted orbit ring per department. Hovering speeds the ring
 * up, fills it with a faint blue wash, and opens a HoverCard describing what
 * that department owns on the mission.
 */
import { useRef, useState } from "react"

import { SectionLabel } from "@/components/brand/Brand"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap"

const DEPARTMENTS = [
  {
    id: "aryan",
    name: "Aryan — Constellation DB & routing",
    short: "Aryan",
    role: "Mission database, contact-graph routing in SQL, and the constellation/ISL pipeline. Faculty owner: Dr. Umesh Shinde (KJSIT).",
  },
  {
    id: "teammate",
    name: "Teammate — AI router & ground segment",
    short: "Teammate",
    role: "In-database decision tree, watchdog overrides, and the ground-station console. Faculty owner: Dr. Shailesh Nikam (KJSSE).",
  },
  {
    id: "shinde",
    name: "Dr. Umesh Shinde",
    short: "KJSIT",
    role: "Faculty owner, K J Somaiya Institute of Technology. Guides the mission database and its DBMS experiment mapping.",
  },
  {
    id: "nikam",
    name: "Dr. Shailesh Nikam",
    short: "KJSSE",
    role: "Faculty owner, K J Somaiya School of Engineering. Guides the spacecraft and deployer constraints behind every schema choice.",
  },
  {
    id: "reorbit",
    name: "ReOrbit, Finland",
    short: "ReOrbit",
    role: "Collaborating organization on the SomaiyaSat PocketQube mission and the Espoo ground-station partner.",
  },
]

/** A tilted ring with a body at its centre and a satellite riding it. */
function OrbitRing({ active, index }: { active: boolean; index: number }) {
  const tilt = -18 - index * 6
  return (
    <svg viewBox="0 0 220 160" className="h-full w-full" fill="none">
      <defs>
        <radialGradient id={`fill-${index}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3d6bff" stopOpacity={active ? 0.28 : 0} />
          <stop offset="100%" stopColor="#3d6bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse
        cx="110"
        cy="80"
        rx="92"
        ry="34"
        transform={`rotate(${tilt} 110 80)`}
        fill={`url(#fill-${index})`}
        stroke={active ? "rgba(61,107,255,0.85)" : "rgba(255,255,255,0.20)"}
        strokeWidth="1"
        className="transition-all duration-500"
      />
      <circle
        cx="110"
        cy="80"
        r="13"
        fill="none"
        stroke={active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)"}
        strokeWidth="1"
        className="transition-all duration-500"
      />
      <circle cx="110" cy="80" r="4" fill={active ? "#3d6bff" : "rgba(255,255,255,0.4)"} />

      {/* the satellite dot; its rotation is driven by GSAP */}
      <g className={`team-sat-${index}`} style={{ transformOrigin: "110px 80px" }}>
        <g transform={`rotate(${tilt} 110 80)`}>
          <circle cx="202" cy="80" r="4" fill="#ffffff" />
        </g>
      </g>
    </svg>
  )
}

export function Team() {
  const root = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return

      DEPARTMENTS.forEach((_, i) => {
        gsap.to(`.team-sat-${i}`, {
          rotation: 360,
          duration: 14 + i * 2,
          ease: "none",
          repeat: -1,
          transformOrigin: "110px 80px",
        })
      })

      gsap.from(".team-card", {
        opacity: 0,
        y: 42,
        duration: 1.35,
        stagger: 0.14,
        ease: "power2.out",
        scrollTrigger: { trigger: ".team-grid", start: "top 90%" },
      })
    },
    { scope: root }
  )

  // Speed the hovered ring up.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      // timeScale lives on the tween, not on the element â€” retime the spin
      // tweens directly rather than trying to tween a non-existent property.
      DEPARTMENTS.forEach((_, i) => {
        gsap
          .getTweensOf(`.team-sat-${i}`)
          .forEach((tw) => gsap.to(tw, { timeScale: hovered === i ? 3.4 : 1, duration: 0.4 }))
      })
    },
    { dependencies: [hovered], scope: root }
  )

  return (
    <section
      ref={root}
      id="team"
      data-glitch
      className="border-t border-white/[0.12] py-24 md:py-32"
    >
      <div className="shell">
        <SectionLabel>The team</SectionLabel>
        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <h2
            className="max-w-[20ch] font-semibold leading-[1.06] tracking-[-0.03em]"
            style={{ fontSize: "clamp(34px, 5vw, 72px)" }}
          >
            Two builders, one constellation.
          </h2>
          <p className="max-w-[38ch] text-sm leading-[1.8] text-[#8a8f98]">
            Hover a ring to see what that group owns. This page and the database
            behind it are the Information Technology slice.
          </p>
        </div>

        <div className="team-grid mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {DEPARTMENTS.map((d, i) => (
            <HoverCard key={d.id} openDelay={80} closeDelay={80}>
              <HoverCardTrigger asChild>
                <div
                  className="team-card glass group cursor-default rounded-[12px] p-5 transition-colors duration-500 hover:border-[#3d6bff]/60"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div className="h-[110px] w-full">
                    <OrbitRing active={hovered === i} index={i} />
                  </div>
                  <p className="mono-label mt-4 text-white">{d.short}</p>
                  <p className="mt-2 text-[12px] leading-snug text-[#8a8f98]">
                    {d.name}
                  </p>
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-80">
                <p className="mono-label text-[#3d6bff]">{d.short}</p>
                <p className="mt-2 text-sm font-medium text-white">{d.name}</p>
                <p className="mt-3 text-[13px] leading-[1.7] text-[#8a8f98]">
                  {d.role}
                </p>
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      </div>
    </section>
  )
}
