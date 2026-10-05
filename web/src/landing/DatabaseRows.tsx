import { Link } from "react-router-dom";

type LabRow = {
  n: string;
  title: string;
  desc: string;
  slug: string;
};

const ROWS: LabRow[] = [
  {
    n: "01",
    title: "Entity generalization",
    desc: "Base network nodes specialise into satellites and ground stations; packet supertypes specialise into payload telemetry.",
    slug: "eer",
  },
  {
    n: "02",
    title: "Relational mapping",
    desc: "Composite foreign keys, weak entity sets, and database triggers enforcing total specialization.",
    slug: "mapping",
  },
  {
    n: "03",
    title: "Schema definition",
    desc: "Custom domains, enumerated types, range partitions, and spatial exclusion constraints.",
    slug: "ddl",
  },
  {
    n: "04",
    title: "Data manipulation",
    desc: "Real-time telemetry ingestion, pass contact recording, and automated routing executions.",
    slug: "dml",
  },
  {
    n: "05",
    title: "Workload aggregation",
    desc: "Power budget summaries, transmission queue distribution, and materialized views for operational metrics.",
    slug: "aggregates",
  },
  {
    n: "06",
    title: "Graph routing in SQL",
    desc: "Recursive common table expressions, link quality scoring, and contact graph pass execution.",
    slug: "routing",
  },
  {
    n: "07",
    title: "Security & permissions",
    desc: "Role-based privilege separation, row-level security policies, and cryptographic command verification.",
    slug: "security",
  },
  {
    n: "08",
    title: "Index benchmarking",
    desc: "Performance comparison of B-tree, BRIN, and GiST indexes across high-volume telemetry tables.",
    slug: "indexing",
  },
  {
    n: "09",
    title: "Transaction control",
    desc: "Atomic deployment procedures, savepoints for telemetry batches, and concurrent queue processing with skip locked.",
    slug: "transactions",
  },
];

/** 9 DBMS experiments as numbered hairline rows linking to /labs/<slug>. */
export function DatabaseRows() {
  return (
    <section className="border-t border-white/10 py-28" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2
            className="max-w-[18ch] font-light text-white"
            style={{ fontSize: "clamp(30px, 3.4vw, 46px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Nine database labs. Built on live PostgreSQL.
          </h2>
        </div>
        <div className="mt-12 border-t border-white/10">
          {ROWS.map((row) => (
            <Link
              key={row.slug}
              to={`/labs/${row.slug}`}
              className="group grid items-center gap-3 border-b border-white/10 py-6 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3d5bff] md:grid-cols-[70px_1.1fr_1.6fr_40px]"
            >
              <span className="font-mono text-[12px]" style={{ color: "#3d5bff", letterSpacing: "0.08em" }}>
                [{row.n}]
              </span>
              <span className="text-[18px] font-light text-white transition-colors group-hover:text-white">
                {row.title}
              </span>
              <span className="text-[14px] leading-relaxed text-[#9aa3b8]">
                {row.desc}
              </span>
              <span className="text-right font-mono text-[16px] text-white opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
