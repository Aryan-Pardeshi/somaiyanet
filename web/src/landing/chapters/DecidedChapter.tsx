import { useRef } from "react"
import type { ReactNode } from "react"
import { ChapterShell } from "@/landing/ChapterShell"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

/** Bundled fixture shaped like dt_node rows (used if /api/ai/models/1/tree is down). */
interface TreeNode {
  id: number
  x: number
  y: number
  feature: string | null
  threshold: string | null
  leaf: string | null
  left: number | null
  right: number | null
}

const TREE: TreeNode[] = [
  { id: 0, x: 320, y: 28, feature: "battery_v", threshold: "7.05", leaf: null, left: 1, right: 2 },
  { id: 1, x: 160, y: 108, feature: "contact_s", threshold: "30", leaf: null, left: 3, right: 4 },
  { id: 2, x: 480, y: 108, feature: "link_score", threshold: "40", leaf: null, left: 5, right: 6 },
  { id: 3, x: 60, y: 196, feature: null, threshold: null, leaf: "SAFE_TTC_ONLY", left: null, right: null },
  { id: 4, x: 200, y: 196, feature: "isl_available", threshold: "1", leaf: null, left: 7, right: 8 },
  { id: 5, x: 420, y: 196, feature: "isl_available", threshold: "1", leaf: null, left: 9, right: 10 },
  { id: 6, x: 570, y: 196, feature: "battery_v", threshold: "7.2", leaf: null, left: 11, right: 12 },
  { id: 7, x: 150, y: 286, feature: null, threshold: null, leaf: "RELAY_VIA_ISL", left: null, right: null },
  { id: 8, x: 250, y: 286, feature: null, threshold: null, leaf: "HOLD", left: null, right: null },
  { id: 9, x: 370, y: 286, feature: null, threshold: null, leaf: "RELAY_VIA_ISL", left: null, right: null },
  { id: 10, x: 470, y: 286, feature: null, threshold: null, leaf: "SAFE_TTC_ONLY", left: null, right: null },
  { id: 11, x: 545, y: 286, feature: null, threshold: null, leaf: "TTC_VOICE", left: null, right: null },
  { id: 12, x: 610, y: 286, feature: "sunlit", threshold: "1", leaf: null, left: 13, right: 14 },
  { id: 13, x: 585, y: 366, feature: null, threshold: null, leaf: "FULL_DOWNLINK", left: null, right: null },
  { id: 14, x: 650, y: 366, feature: null, threshold: null, leaf: "FULL_DOWNLINK", left: null, right: null },
]

/** The lit path for SAT-A3 right now: 0 → 2 → 5 → 9. */
const PATH = [0, 2, 5, 9]
const PATH_NOTES = [
  "battery_v = 7.40 ≤ 7.05? → right",
  "link_score = 0 ≤ 40? → left",
  "isl_available = 1? → left",
  "leaf: RELAY_VIA_ISL",
]

const WATCHDOG = [
  "battery_v < 6.8 forces SAFE_TTC_ONLY",
  "no contact forbids FULL_DOWNLINK and TTC_VOICE",
  "link_score < 40 forbids FULL_DOWNLINK",
  "battery_v < 7.2 forbids FULL_DOWNLINK (SSTV power)",
  "RELAY_VIA_ISL needs isl_available = 1",
]

/**
 * 03 / DECIDED. The decision tree is rows in dt_node, walked by a recursive
 * CTE — explainable by construction. Scroll lights the path node by node in
 * ice blue; the watchdog then checks its 5 invariants with ticks.
 */
export function DecidedChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Array<SVGGElement | null>>([])
  const edgeRefs = useRef<Array<SVGLineElement | null>>([])
  const tickRefs = useRef<Array<HTMLSpanElement | null>>([])
  const noteRef = useRef<HTMLParagraphElement | null>(null)

  useReveal(rootRef)
  usePinnedScrub(rootRef, (p) => {
    const steps = PATH.length
    const litCount =
      p < 0.15 ? 0 : Math.min(steps, 1 + Math.floor(((p - 0.15) / 0.55) * steps))
    PATH.forEach((id, order) => {
      const g = nodeRefs.current[id]
      if (g) g.setAttribute("opacity", order < litCount ? "1" : "0.28")
    })
    edgeRefs.current.forEach((e, i) => {
      if (e) e.setAttribute("stroke", i < litCount - 1 ? "#7fb2ff" : "#1b2d55")
    })
    if (noteRef.current) {
      noteRef.current.textContent =
        litCount === 0 ? "walking dt_node from node 0…" : PATH_NOTES[litCount - 1]
    }
    tickRefs.current.forEach((t, i) => {
      if (t) t.style.opacity = p > 0.55 + i * 0.07 ? "1" : "0"
    })
  })

  const byId = new Map(TREE.map((n) => [n.id, n]))

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="03"
        title="Decided"
        sectionId="decided"
        status="CLAIMED"
        headline="The model is rows. The walk is SQL."
        copy={[
          "The decision tree lives in dt_node — one row per node, children as self-referencing keys. ai_decide walks it from node 0 with a recursive CTE, recording every step so the decision explains itself.",
          "Then the watchdog checks 5 invariants. If the AI ever suggests something unsafe, the final action falls back to the rule — fail-safe by construction, matching the governance table.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
              <p className="font-mono mb-2 text-[11px] tracking-[0.18em] text-[var(--text-2)]">
                ai_model 1 · DecisionTree · walking for SAT-A3
              </p>
              <svg
                viewBox="0 0 700 400"
                className="h-auto w-full"
                role="img"
                aria-label="Decision tree with the path to RELAY_VIA_ISL highlighted"
              >
                {TREE.flatMap((n) => {
                  const lines: ReactNode[] = []
                  const push = (child: number | null, idx: number) => {
                    if (child === null) return
                    const c = byId.get(child)
                    if (!c) return
                    const onPath =
                      PATH.includes(n.id) &&
                      PATH[PATH.indexOf(n.id) + 1] === child
                    lines.push(
                      <line
                        key={`${n.id}-${child}`}
                        ref={(l) => {
                          if (onPath) edgeRefs.current[PATH.indexOf(n.id)] = l
                        }}
                        x1={n.x}
                        y1={n.y + 14}
                        x2={c.x}
                        y2={c.y - 14}
                        stroke="#1b2d55"
                        strokeWidth={onPath ? 2.5 : 1.5}
                      />
                    )
                    void idx
                  }
                  push(n.left, 0)
                  push(n.right, 1)
                  return lines
                })}
                {TREE.map((n) => (
                  <g
                    key={n.id}
                    ref={(g) => {
                      nodeRefs.current[n.id] = g
                    }}
                    opacity={PATH.includes(n.id) ? 0.28 : 0.55}
                  >
                    {n.leaf ? (
                      <rect
                        x={n.x - 52}
                        y={n.y - 13}
                        width="104"
                        height="26"
                        rx="6"
                        fill={n.id === 9 ? "#7fb2ff22" : "none"}
                        stroke={n.id === 9 ? "#7fb2ff" : "#1b2d55"}
                        strokeWidth={n.id === 9 ? 2 : 1.5}
                      />
                    ) : (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r="14"
                        fill="#0f2147"
                        stroke={PATH.includes(n.id) ? "#7fb2ff" : "#7fb2ff"}
                        strokeWidth="2"
                      />
                    )}
                    <text
                      x={n.x}
                      y={n.leaf ? n.y + 4 : n.y - 20}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={n.id === 9 ? "#e6ecf8" : "#93a3c4"}
                      fontFamily="Geist Mono, monospace"
                    >
                      {n.leaf ?? `${n.feature} ≤ ${n.threshold}?`}
                    </text>
                  </g>
                ))}
              </svg>
              <p
                ref={noteRef}
                className="font-mono mt-2 min-h-[1.5em] text-[12px] text-[var(--warn)]"
              >
                walking dt_node from node 0…
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
              <p className="font-mono mb-3 text-[11px] tracking-[0.18em] text-[var(--text-2)]">
                watchdog · 5 invariants
              </p>
              <ul className="flex flex-col gap-2">
                {WATCHDOG.map((w, i) => (
                  <li
                    key={w}
                    className="font-mono flex items-center gap-3 text-[12px] text-[var(--text-2)]"
                  >
                    <span
                      ref={(s) => {
                        tickRefs.current[i] = s
                      }}
                      className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--ok)] text-[11px] text-[#02040a] transition-opacity duration-300"
                      style={{ opacity: 0 }}
                    >
                      ✓
                    </span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-[var(--ice)]/50 bg-[var(--navy-800)] p-4">
              <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--text-3)]">
                second scenario · watchdog override
              </p>
              <p className="font-mono mt-2 text-[13px]">
                <span className="text-[var(--text-3)] line-through">
                  FULL_DOWNLINK
                </span>
                <span className="mx-2 text-[var(--text-2)]">→</span>
                <span className="text-[var(--warn)]">TTC_VOICE</span>
              </p>
              <p className="font-mono mt-1 text-[11px] text-[var(--text-3)]">
                battery 7.10 V below 7.2 V — SSTV is the most power-hungry mode
              </p>
              <span className="font-mono absolute right-4 top-4 -rotate-6 rounded border-2 border-[var(--ice)] px-2 py-0.5 text-[11px] tracking-[0.2em] text-[var(--ice)]">
                OVERRIDE
              </span>
            </div>
          </div>
        }
      />
    </div>
  )
}
