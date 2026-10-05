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

/** 9 DBMS experiments as an Apple inset-grouped list linking to /labs/<slug>. */
export function DatabaseRows() {
  return (
    <section className="sx-section border-t border-[color:var(--sx-hairline)] bg-black">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="sx-eyebrow">Database architecture</p>
            <h2 className="sx-h2 mt-3">Nine database labs. Built on live PostgreSQL.</h2>
            <p className="sx-lead mt-4">
              Every experiment runs against an operational schema with real-time telemetry, constraint verification, and recursive routing queries.
            </p>
          </div>
          <Link to="/labs/sql" className="sx-btn self-start sm:self-end">
            Open SQL console
          </Link>
        </div>

        <div className="sx-group mt-12">
          {ROWS.map((row) => (
            <Link
              key={row.slug}
              to={`/labs/${row.slug}`}
              className="sx-row group py-4 transition-colors hover:bg-[color:var(--sx-surface-2)] focus-visible:bg-[color:var(--sx-surface-2)] focus-visible:outline-none"
            >
              <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                <span className="sx-num text-[13px] text-[color:var(--sx-text-3)] shrink-0 pt-0.5 sm:pt-0 w-6">
                  {row.n}
                </span>
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6 min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-white shrink-0 sm:w-[210px]">
                    {row.title}
                  </span>
                  <span className="sx-body text-[13px] sm:text-[14px] text-[color:var(--sx-text-2)] leading-normal">
                    {row.desc}
                  </span>
                </div>
              </div>
              <span
                className="text-[15px] text-[color:var(--sx-text-3)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white shrink-0 pl-2"
                aria-hidden="true"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
