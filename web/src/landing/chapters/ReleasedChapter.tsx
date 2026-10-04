import { useRef } from "react"
import { ChapterShell } from "@/landing/ChapterShell"
import { SqlRibbon } from "@/components/story/SqlRibbon"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

const SIGNALS = ["SEPARATION_SWITCH", "RELEASE_TIMER", "RF_BEACON"] as const

/**
 * 02 / RELEASED. Flashback to deployment: the SomaiyaPod box (real envelope
 * 127.4 x 57.9 x 57.2 mm) ejects the PocketQube as you scroll. Three signal
 * lamps light in turn with a "2 of 3 confirmed" counter. Copy is about ACID
 * and TCL: COMMIT on success, ROLLBACK still leaves a log row behind.
 */
export function ReleasedChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const satRef = useRef<SVGRectElement | null>(null)
  const springRef = useRef<SVGRectElement | null>(null)
  const lampRefs = useRef<Array<SVGCircleElement | null>>([])
  const countRef = useRef<HTMLSpanElement | null>(null)

  useReveal(rootRef)
  usePinnedScrub(rootRef, (p) => {
    if (satRef.current) {
      satRef.current.setAttribute(
        "transform",
        `translate(${p * 150} ${-p * 26})`
      )
      satRef.current.setAttribute("opacity", p > 0.85 ? String(1 - (p - 0.85) / 0.15) : "1")
    }
    if (springRef.current) {
      springRef.current.setAttribute("transform", `scale(${1 - p * 0.45} 1)`)
    }
    const lit = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.72 ? 2 : 3
    lampRefs.current.forEach((lamp, i) => {
      if (!lamp) return
      lamp.setAttribute("fill", i < lit ? "#3ecf8e" : "#0f2147")
      lamp.setAttribute("stroke", i < lit ? "#3ecf8e" : "#1b2d55")
    })
    if (countRef.current) {
      countRef.current.textContent = `${Math.min(lit, 2)} of 3 confirmed`
    }
  })

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="02"
        title="Released"
        sectionId="released"
        status="CLAIMED"
        headline="Before the packet, the spring."
        copy={[
          "SAT-A3 rode to orbit inside SomaiyaPod POD-A3 — a 127.4 × 57.9 × 57.2 mm box. Three independent signals confirm the release: separation switch, release timer, RF beacon. Two of three must agree.",
          "confirm_deployment is a transaction in the TCL sense: all updates COMMIT together, or everything ROLLBACKs. And the attempt is still logged — deployment_log has no foreign keys, so its row survives in its own transaction.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
              <svg
                viewBox="0 0 460 240"
                className="h-auto w-full"
                role="img"
                aria-label="SomaiyaPod deployer ejecting the PocketQube"
              >
                {/* pod tube */}
                <rect
                  x="40"
                  y="80"
                  width="200"
                  height="90"
                  rx="6"
                  fill="none"
                  stroke="#93a3c4"
                  strokeWidth="2"
                />
                {/* spring plate, compresses on scroll */}
                <rect
                  ref={springRef}
                  x="48"
                  y="92"
                  width="36"
                  height="66"
                  fill="#7fb2ff"
                  opacity="0.85"
                  style={{ transformOrigin: "48px 125px" }}
                />
                {/* pocketqube, ejects on scroll */}
                <rect
                  ref={satRef}
                  x="96"
                  y="104"
                  width="66"
                  height="42"
                  rx="3"
                  fill="#e6ecf8"
                  stroke="#02040a"
                  strokeWidth="2"
                />
                <text x="104" y="129" fontSize="11" fill="#02040a" fontFamily="Geist Mono, monospace">
                  SAT-A3
                </text>
                {/* dimension annotations */}
                <line x1="40" y1="196" x2="240" y2="196" stroke="#5f6f93" strokeWidth="1" />
                <text x="140" y="212" fontSize="10" fill="#5f6f93" textAnchor="middle" fontFamily="Geist Mono, monospace">
                  127.4 mm
                </text>
                <line x1="262" y1="80" x2="262" y2="170" stroke="#5f6f93" strokeWidth="1" />
                <text x="272" y="130" fontSize="10" fill="#5f6f93" fontFamily="Geist Mono, monospace">
                  57.9
                </text>
                <text x="272" y="142" fontSize="10" fill="#5f6f93" fontFamily="Geist Mono, monospace">
                  × 57.2
                </text>
                {/* escaping packet dot */}
                <circle cx="330" cy="100" r="5" fill="#7fb2ff" opacity="0.9">
                  <animate attributeName="r" values="4;6;4" dur="1.6s" repeatCount="indefinite" />
                </circle>
              </svg>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {SIGNALS.map((s, i) => (
                  <span
                    key={s}
                    className="font-mono flex items-center gap-2 text-[11px] tracking-[0.1em] text-[var(--text-2)]"
                  >
                    <svg width="14" height="14" aria-hidden="true">
                      <circle
                        ref={(c) => {
                          lampRefs.current[i] = c
                        }}
                        cx="7"
                        cy="7"
                        r="5.5"
                        fill="#0f2147"
                        stroke="#1b2d55"
                        strokeWidth="1.5"
                      />
                    </svg>
                    {s}
                  </span>
                ))}
                <span
                  ref={countRef}
                  className="font-mono ml-auto text-[11px] tracking-[0.1em] text-[var(--warn)]"
                >
                  0 of 3 confirmed
                </span>
              </div>
            </div>
            <SqlRibbon
              sql={`CALL confirm_deployment('POD-A3');
-- 3 signals ok, 2 of 3 required -> COMMIT;`}
              caption="Exp 9 · TCL — COMMIT on success"
            />
            <div className="rounded-xl border border-dashed border-[var(--line)] p-4 opacity-60">
              <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[var(--text-3)]">
                {`CALL confirm_deployment('POD-B4', p_simulate_failure => TRUE);
-- ROLLBACK — but deployment_log keeps the row.`}
              </pre>
            </div>
          </div>
        }
      />
    </div>
  )
}
