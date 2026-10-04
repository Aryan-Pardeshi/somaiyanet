// adapted from lakshyamody/dbmsproj (landing)
import { Link } from "react-router-dom"
import { SectionLabel } from "@/components/brand/Brand"

/**
 * [ THE DATABASE IS MISSION CONTROL ] — 9 cards, one per DBMS experiment,
 * each linking to /labs/<slug>.
 */
const CARDS = [
  { n: "01", slug: "eer", title: "EER generalization", body: "network_node → satellite | ground_station, packet → TTC/SSTV/voice. Disjoint, total, enforced by trigger." },
  { n: "02", slug: "mapping", title: "Relational mapping", body: "Class-table inheritance, weak-entity keys, M:N contact and route_hop bridges." },
  { n: "03", slug: "ddl", title: "DDL with EXCLUDE and partitions", body: "Domains, enums, gist exclusion on contacts, daily telemetry partitions." },
  { n: "04", slug: "dml", title: "DML / UPSERT", body: "Seed loads, simulator inserts, TLE upserts with ON CONFLICT." },
  { n: "05", slug: "aggregates", title: "Aggregates and set ops", body: "GROUP BY workloads, HAVING low-power, UNION / INTERSECT / EXCEPT over passes." },
  { n: "06", slug: "routing", title: "Recursive CTE routing and views", body: "Contact-graph routes, constellation views, materialized KPIs." },
  { n: "07", slug: "security", title: "Roles + RLS", body: "Director, operators, analyst, router. Column privileges and row-level policies." },
  { n: "08", slug: "indexing", title: "BRIN / GIN / partial indexes", body: "Time-series BRIN, JSONB GIN, queued-packet partial, covering INCLUDE." },
  { n: "09", slug: "transactions", title: "Isolation, deadlocks, SKIP LOCKED", body: "Deploy COMMIT/ROLLBACK, SAVEPOINT passes, concurrent claim lab." },
]

export function DatabaseIsMissionControl() {
  return (
    <section id="database" data-glitch className="relative border-t border-white/[0.12] py-24 md:py-32">
      <div className="shell">
        <SectionLabel>The database is mission control</SectionLabel>
        <h2 className="mt-8 max-w-[22ch] font-semibold leading-[1.06] tracking-[-0.03em]" style={{ fontSize: "clamp(34px, 5vw, 72px)" }}>
          Every decision lives in PostgreSQL.
        </h2>
        <p className="mt-6 max-w-[68ch] text-[15px] leading-[1.8] text-[#8a8a93]">
          Permissions, routes, AI votes, audit trails — Python and React only call SQL and render the results.
        </p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <Link key={c.slug} to={`/labs/${c.slug}`} className="glass group rounded-[12px] p-6 transition-colors hover:border-[#3d6bff]/60">
              <p className="mono-label text-[#3d6bff]">[ EXP {c.n} ]</p>
              <h3 className="mt-3 font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.7] text-[#8a8a93]">{c.body}</p>
              <p className="mono-label mt-5 text-[#8a8a93] group-hover:text-white">/labs/{c.slug} →</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
