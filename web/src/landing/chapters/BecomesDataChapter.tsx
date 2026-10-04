import { useRef } from "react"
import { Link } from "react-router-dom"
import { ChapterShell } from "@/landing/ChapterShell"
import { useStoryStats } from "@/hooks/useStats"
import { useReveal } from "@/landing/usePinnedScrub"

const TABLES: Array<{ name: string; rows: string[]; exp: string }> = [
  {
    name: "telemetry",
    exp: "Exp 3",
    rows: [
      "SAT-B2 · 7.02 V · 24.1 °C · sunlit=true",
      "SAT-B2 · 6.99 V · 24.4 °C · sunlit=true",
      "SAT-B2 · 6.95 V · 24.8 °C · WARN raised",
    ],
  },
  {
    name: "routing_decision",
    exp: "Exp 6",
    rows: [
      "SAT-A3 · RELAY_VIA_ISL · overridden=false",
      "SAT-A4 · TTC_VOICE · overridden=true",
      "SAT-B3 · SAFE_TTC_ONLY · overridden=true",
    ],
  },
  {
    name: "audit_log",
    exp: "Exp 7",
    rows: [
      "U telecommand · row 118 · station_operator_bom",
      "I routing_decision · row 90412 · ai_router",
      "U alert · acknowledged=true · mission_director",
    ],
  },
]

const EXPERIMENTS: Array<{ n: number; slug: string; concept: string }> = [
  { n: 1, slug: "eer", concept: "EER generalization — node and packet hierarchies" },
  { n: 2, slug: "mapping", concept: "ER → relational mapping" },
  { n: 3, slug: "ddl", concept: "DDL with EXCLUDE and partitions" },
  { n: 4, slug: "dml", concept: "DML and UPSERT" },
  { n: 5, slug: "aggregates", concept: "Aggregates and set ops" },
  { n: 6, slug: "routing", concept: "Recursive CTE plus views" },
  { n: 7, slug: "security", concept: "Roles plus RLS" },
  { n: 8, slug: "indexing", concept: "BRIN, GIN and partial indexes" },
  { n: 9, slug: "transactions", concept: "Isolation, deadlock, SKIP LOCKED" },
]

/**
 * 06 / IT BECOMES DATA. The packet dissolves into rows: telemetry,
 * routing_decision, audit_log tick in as stacked table cards under a live
 * counter strip, then 9 experiment chips map the story onto the DBMS syllabus.
 */
export function BecomesDataChapter() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { stats } = useStoryStats()

  useReveal(rootRef)

  const counters: Array<[string, string]> = [
    ["sats", `${stats.sats_operational}/${stats.sats_total} operational`],
    ["telemetry rows", stats.telemetry_rows.toLocaleString("en-IN")],
    ["queued", String(stats.packets_queued)],
    ["delivered 24h", String(stats.packets_delivered_24h)],
    ["contacts 24h", String(stats.contacts_next_24h)],
    ["ISL 24h", String(stats.isl_contacts_next_24h)],
    ["AI decisions", String(stats.ai_decisions)],
    ["stations", String(stats.stations)],
  ]

  return (
    <div ref={rootRef}>
      <ChapterShell
        index="06"
        title="It becomes data"
        sectionId="becomes-data"
        status="DELIVERED"
        headline="The packet lands as rows."
        copy={[
          "Delivery is not the end — it is an INSERT. Telemetry keeps the health record, routing_decision keeps the why, audit_log keeps the who. The database is the mission control.",
          "Every number below is a query, and every chip is a lab: the whole DBMS syllabus, running on one constellation.",
        ]}
        visual={
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {counters.map(([label, value]) => (
                <div
                  key={label}
                  className="reveal rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-3"
                >
                  <p className="font-mono text-lg text-[var(--warn)]">{value}</p>
                  <p className="font-mono mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-3)]">
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {TABLES.map((t) => (
                <div
                  key={t.name}
                  className="rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4"
                >
                  <p className="font-mono flex items-center justify-between text-[11px] tracking-[0.18em] text-[var(--text-2)]">
                    {t.name}
                    <span className="rounded-full bg-[var(--navy-700)] px-2 py-0.5 text-[var(--ice)]">
                      {t.exp}
                    </span>
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {t.rows.map((r) => (
                      <li
                        key={r}
                        className="reveal font-mono rounded-md bg-[var(--navy-700)] px-3 py-1.5 text-[12px] text-[var(--warn)]"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {EXPERIMENTS.map((e) => (
                <Link
                  key={e.slug}
                  to={`/labs/${e.slug}`}
                  className="group rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-3 transition-colors hover:border-[var(--ice)]"
                >
                  <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--ice)]">
                    Exp {e.n}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-[var(--text-2)] group-hover:text-[var(--text)]">
                    {e.concept}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        }
      />
    </div>
  )
}
