import { useRef, useState } from "react"
import { ChapterShell } from "@/landing/ChapterShell"
import { OrbitScene } from "@/landing/OrbitScene"
import { HopRail } from "@/components/story/HopRail"
import { SqlRibbon } from "@/components/story/SqlRibbon"
import { usePinnedScrub, useReveal } from "@/landing/usePinnedScrub"

/**
 * 04 / NO STATION IN VIEW. The orbit scene returns as a second instance,
 * camera pushed toward SAT-A3: no ground station below, so PKT#0412 hops
 * A3 → A2 → B2 along sky-blue ISL chords while the HopRail tracks it.
 */
export function NoStationChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const progress = useRef(0)
  const [active, setActive] = useState(0)

  useReveal(rootRef)
  usePinnedScrub(rootRef, (p) => {
    progress.current = p
    const hop = p < 0.3 ? 0 : p < 0.55 ? 1 : p < 0.8 ? 2 : 3
    setActive((prev) => (prev === hop ? prev : hop))
  })

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="04"
        title="No station in view"
        sectionId="no-station"
        status="ROUTED"
        headline="No station below. So the packet walks the sky."
        copy={[
          "SAT-A3 is over open ocean with no downlink in view. The router asks Contact Graph Routing for the earliest arrival over the time-varying contact graph — and gets a path through space, not ground.",
          "A3 hands to A2, A2 hands to B2 near the pole. Each hop waits for its window, rides 9,600 bps, and the bottleneck score of 78 decides the pace.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--navy-800)]">
              <OrbitScene mode="route" progressRef={progress} height={440} />
            </div>
            <HopRail
              nodes={[
                { id: "SAT-A3", kind: "SAT" },
                { id: "SAT-A2", kind: "SAT" },
                { id: "SAT-B2", kind: "SAT" },
                { id: "GS-BOM", kind: "GROUND" },
              ]}
              active={active}
            />
            <SqlRibbon
              sql={`WITH RECURSIVE hops AS (
  SELECT origin, t0, ARRAY[origin] AS path
  UNION
  SELECT nxt.to_node, GREATEST(nxt.start_ts, cur.arrival) + tx,
         cur.path || nxt.to_node
    FROM hops AS cur
    JOIN LATERAL (SELECT DISTINCT ON (to_node) *
                    FROM contact
                   WHERE from_node = cur.node ...) AS nxt ON TRUE
) CYCLE node SET is_cycle USING visited ...`}
              caption="Exp 6 · recursive CTE — abbreviated from cgr_routes in db/04_functions.sql"
            />
          </div>
        }
      />
    </div>
  )
}
