import { useRef } from "react"
import { ChapterShell } from "@/landing/ChapterShell"
import { RowCard } from "@/components/story/RowCard"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

/**
 * 05 / DOWNLINK. B2 rises over KJSIT Mumbai: a signal-green beam, an
 * elevation arc, link score 64. The PacketTag flips to DELIVERED and the
 * route row lands: 3 hops, 18m 40s, bottleneck 64.
 */
export function DownlinkChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const beamRef = useRef<SVGLineElement | null>(null)
  const glowRef = useRef<SVGCircleElement | null>(null)
  const scoreRef = useRef<SVGTextElement | null>(null)

  useReveal(rootRef)
  usePinnedScrub(rootRef, (p) => {
    if (beamRef.current) {
      beamRef.current.setAttribute("opacity", String(Math.min(1, p * 1.6)))
      beamRef.current.setAttribute("stroke-dashoffset", String(40 - p * 40))
    }
    if (glowRef.current) {
      glowRef.current.setAttribute("opacity", String(p > 0.5 ? (p - 0.5) * 2 : 0))
    }
    if (scoreRef.current) {
      scoreRef.current.textContent = String(Math.round(p * 64))
      scoreRef.current.setAttribute("opacity", p > 0.55 ? "1" : "0.25")
    }
  })

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="05"
        title="Downlink"
        sectionId="downlink"
        status="DELIVERED"
        headline="B2 rises over KJSIT Mumbai."
        copy={[
          "The last hop is a DOWNLINK contact: elevation clears the station's 10° mask, the link scores 64, and 41,216 bytes fall out of the sky at 9,600 bps.",
          "Route closed: 3 hops, 18 minutes 40 seconds of latency, bottleneck 64. PKT#0412 is DELIVERED — and every second of it is rows in route, route_hop and packet.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
              <svg
                viewBox="0 0 460 260"
                className="h-auto w-full"
                role="img"
                aria-label="Downlink beam from SAT-B2 to Mumbai with elevation arc"
              >
                {/* horizon */}
                <line x1="20" y1="220" x2="440" y2="220" stroke="#1b2d55" strokeWidth="2" />
                {/* station */}
                <rect x="216" y="204" width="28" height="16" rx="2" fill="#93a3c4" />
                <text x="230" y="240" textAnchor="middle" fontSize="11" fill="#93a3c4" fontFamily="Geist Mono, monospace">
                  GS-BOM · Mumbai 19.07°N
                </text>
                {/* satellite */}
                <rect x="300" y="40" width="46" height="26" rx="3" fill="#e6ecf8" />
                <text x="323" y="57" textAnchor="middle" fontSize="11" fill="#02040a" fontFamily="Geist Mono, monospace">
                  B2
                </text>
                {/* elevation arc */}
                <path
                  d="M 230 220 A 150 150 0 0 1 322 66"
                  fill="none"
                  stroke="#5f6f93"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
                <text x="150" y="130" fontSize="11" fill="#5f6f93" fontFamily="Geist Mono, monospace">
                  el 32°
                </text>
                {/* beam */}
                <line
                  ref={beamRef}
                  x1="316"
                  y1="66"
                  x2="230"
                  y2="204"
                  stroke="#3ecf8e"
                  strokeWidth="3"
                  strokeDasharray="40"
                  opacity="0"
                  style={{ filter: "drop-shadow(0 0 6px #3ecf8e)" }}
                />
                <circle
                  ref={glowRef}
                  cx="230"
                  cy="204"
                  r="12"
                  fill="#3ecf8e"
                  opacity="0"
                />
                <text
                  ref={scoreRef}
                  x="392"
                  y="160"
                  fontSize="34"
                  fill="#3ecf8e"
                  fontFamily="Geist Mono, monospace"
                  opacity="0.25"
                >
                  0
                </text>
                <text x="392" y="178" fontSize="11" fill="#5f6f93" fontFamily="Geist Mono, monospace">
                  link score
                </text>
              </svg>
            </div>
            <RowCard
              title="route"
              rows={[
                ["route_id", "871"],
                ["hops", "3"],
                ["latency_s", "1120 (18m 40s)"],
                ["bottleneck_score", "64"],
                ["destination", "GS-BOM"],
              ]}
            />
          </div>
        }
      />
    </div>
  )
}
