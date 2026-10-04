// adapted from lakshyamody/dbmsproj (landing)
import { useMemo, useRef, useState } from "react"
import { SectionLabel } from "@/components/brand/Brand"
import { gsap, useGSAP, ScrollTrigger, prefersReducedMotion } from "@/lib/gsap"

/**
 * [ THE CONSTELLATION ROUTES ITSELF ] — 8 sats in 2 planes as animated SVG.
 * GSAP ScrollTrigger steps through 3 states: born over ocean, ISL hops,
 * lands at GS-HEL. Caption notes Contact Graph Routing in SQL (recursive CTE).
 */
const SATS = [
  { id: "SAT-A1", plane: "A", x: 120 },
  { id: "SAT-A2", plane: "A", x: 260 },
  { id: "SAT-A3", plane: "A", x: 400 },
  { id: "SAT-A4", plane: "A", x: 540 },
  { id: "SAT-B1", plane: "B", x: 120 },
  { id: "SAT-B2", plane: "B", x: 260 },
  { id: "SAT-B3", plane: "B", x: 400 },
  { id: "SAT-B4", plane: "B", x: 540 },
]

const STEPS = [
  {
    n: "01",
    title: "Born over the ocean",
    body: "SAT-A1 records an SSTV frame mid-Pacific. No ground station is in view, so the packet waits — and the database looks for a path, not a prayer.",
  },
  {
    n: "02",
    title: "Hops the ISL chain",
    body: "A1 hands the packet to A2, A2 to B2 near the pole where the planes meet. Each hop is a contact row: earliest usable window, ordered by arrival, then hops, then bottleneck link score.",
  },
  {
    n: "03",
    title: "Lands at GS-HEL",
    body: "B2 meets ReOrbit Espoo and downlinks. The whole route — nodes, contacts, arrival — was chained by a recursive CTE over the contact graph.",
  },
]

export function Constellation() {
  const root = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  useGSAP(
    () => {
      if (reduced || !root.current) return
      const triggers: ScrollTrigger[] = []
      STEPS.forEach((_, i) => {
        const st = ScrollTrigger.create({
          trigger: `.const-step-${i}`,
          start: "top 70%",
          onEnter: () => setStep(i),
          onEnterBack: () => setStep(i),
        })
        triggers.push(st)
      })
      gsap.from(".const-sat", {
        opacity: 0,
        y: 18,
        duration: 1,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: ".const-svg", start: "top 85%" },
      })
      return () => triggers.forEach((s) => s.kill())
    },
    { scope: root }
  )

  const activePath = (i: number) => step >= i

  return (
    <section ref={root} id="constellation" data-glitch className="relative border-t border-white/[0.12] py-24 md:py-32">
      <div className="shell">
        <SectionLabel>The constellation routes itself</SectionLabel>
        <h2 className="mt-8 max-w-[22ch] font-semibold leading-[1.06] tracking-[-0.03em]" style={{ fontSize: "clamp(34px, 5vw, 72px)" }}>
          No station in view is not the end of the packet.
        </h2>

        <svg viewBox="0 0 660 300" className="const-svg mt-14 w-full" role="img" aria-label="Eight satellites in two planes hopping a packet to GS-HEL">
          {/* plane rails */}
          <line x1="60" y1="90" x2="600" y2="90" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 6" />
          <line x1="60" y1="210" x2="600" y2="210" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 6" />
          <text x="60" y="72" fill="#8a8a93" fontSize="11" fontFamily="monospace">PLANE A · RAAN 75°</text>
          <text x="60" y="252" fill="#8a8a93" fontSize="11" fontFamily="monospace">PLANE B · RAAN 105°</text>
          {SATS.map((s) => {
            const y = s.plane === "A" ? 90 : 210
            const hot = (step >= 1 && ["SAT-A1", "SAT-A2"].includes(s.id)) || (step >= 2 && s.id === "SAT-B2")
            return (
              <g key={s.id} className="const-sat">
                <circle cx={s.x} cy={y} r={hot ? 9 : 6} fill={hot ? "#3d6bff" : "rgba(255,255,255,0.35)"} />
                <text x={s.x} y={y + 26} fill={hot ? "#fff" : "#8a8a93"} fontSize="10" fontFamily="monospace" textAnchor="middle">{s.id}</text>
              </g>
            )
          })}
          {/* ISL hops A1->A2->B2 */}
          <line x1="120" y1="90" x2="260" y2="90" stroke="#3d6bff" strokeWidth={activePath(1) ? 2 : 1} strokeDasharray="6 5" opacity={activePath(1) ? 1 : 0.35} />
          <line x1="260" y1="90" x2="260" y2="210" stroke="#3d6bff" strokeWidth={activePath(1) ? 2 : 1} strokeDasharray="6 5" opacity={activePath(1) ? 1 : 0.35} />
          {/* downlink B2 -> GS-HEL */}
          <line x1="260" y1="210" x2="600" y2="278" stroke={step >= 2 ? "#3ddc97" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
          <circle cx="600" cy="278" r="7" fill="none" stroke={step >= 2 ? "#3ddc97" : "rgba(255,255,255,0.35)"} strokeWidth="1.5" />
          <text x="600" y="296" fill="#8a8a93" fontSize="10" fontFamily="monospace" textAnchor="middle">GS-HEL</text>
        </svg>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <article key={s.n} className={`const-step-${i} rounded-[12px] border p-5 ${step === i ? "border-[#3d6bff]/60 bg-white/[0.04]" : "border-white/[0.12]"}`}>
              <p className="mono-label text-[#3d6bff]">[{s.n}]</p>
              <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.7] text-[#8a8a93]">{s.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a8a93]">
          Contact Graph Routing computed in SQL (recursive CTE) — earliest arrival wins.
        </p>
      </div>
    </section>
  )
}
