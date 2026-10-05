import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { LABS, LabShell } from "@/features/labs/common";
import { TxLab } from "@/features/labs/TxLab";
import { SecurityLab } from "@/features/labs/SecurityLab";
import { IndexLab } from "@/features/labs/IndexLab";
import { NormLab } from "@/features/labs/NormLab";
import { SchemaLab } from "@/features/labs/SchemaLab";
import { SqlLab } from "@/features/labs/SqlLab";
import { canVisit, homeFor, useRole } from "@/app/access";

const META: Record<
  string,
  { title: string; description: string; chips: string[]; notice: string[]; roleNote: string }
> = {
  transactions: {
    title: "Transactions",
    description:
      "Two-session concurrency workbench — row lock contention, SERIALIZABLE write-skew (40001), deadlock aborts (40P01), and MVCC tuple versions.",
    chips: [],
    roleNote: "Sessions A and B connect to PostgreSQL as the role you picked; resets run as the database owner.",
    notice: [
      "Session B waits on Session A's row lock — the lock table and wait-for arrows prove it.",
      "SERIALIZABLE write-skew ends in 40001; the deadlock script ends in 40P01 with one victim.",
      "SKIP LOCKED dispatch claims disjoint packet id sets for the two router workers.",
    ],
  },
  security: {
    title: "Security",
    description:
      "Role privilege matrix, column-level secrets, station-isolated row-level security (RLS), and Postgres 42501 audit verification.",
    chips: [],
    roleNote: "Every check below runs as the role you picked, against real GRANTs.",
    notice: [
      "The heatmap's denied cells are real has_*_privilege answers, not hard-coded.",
      "RLS: each station operator's downlink count covers only their own to_node.",
      "The audit log refuses non-directors with a genuine 42501 from Postgres.",
    ],
  },
  indexing: {
    title: "Indexing",
    description:
      "B-Tree, BRIN, GIN, Partial and Covering index benchmarks with live EXPLAIN scan node comparisons.",
    chips: [],
    roleNote: "Catalog reads run as the role you picked; index creation, drops, and benchmarks run as the database owner (mission_director).",
    notice: [
      "Before/after bars show the scan node flip: Seq Scan → Bitmap/Index Scan.",
      "BRIN stays tiny on append-only ts; the partial index only covers QUEUED.",
      "A low-selectivity 7-day range correctly keeps the seq scan — planner is right.",
    ],
  },
  normalization: {
    title: "Normalization",
    description:
      "Lossless join decomposition from UNF to BCNF, functional dependencies, and anomaly isolation.",
    chips: ["UNF → BCNF"],
    roleNote: "All normalization queries and anomaly demonstrations run as the role you picked.",
    notice: [
      "Highlighted columns are the duplicated facts that each normal form removes.",
      "FD arrows name the exact form they violate and the fix applied next.",
      "Every decomposition step in the lossless proof rejoins with 0 missing/spurious.",
    ],
  },
  schema: {
    title: "Schema",
    description:
      "Relational EER model with table inheritance hierarchies, foreign keys, partition sets, and check constraints.",
    chips: [],
    roleNote: "Catalog queries for tables, columns, and constraints run as the role you picked.",
    notice: [
      "The d-circles are the disjoint EER splits: node and packet hierarchies.",
      "Double borders are weak entities; ▤ is the RANGE-partitioned telemetry.",
      "Click any table for its comment, columns and constraint list.",
    ],
  },
  sql: {
    title: "SQL console",
    description:
      "Read-only interactive SQL command console with transaction safeguards, query plan inspection, and catalog presets.",
    chips: [],
    roleNote: "Your query runs as the picked role inside a read-only transaction.",
    notice: [
      "Presets cover DML, aggregates, set ops, CGR, views and LIKE in one sidebar.",
      "EXPLAIN toggle renders the shared plan-tree visualizer used by indexing.",
      "Writes fail with 25006 by design — this console is BEGIN READ ONLY.",
    ],
  },
};

export default function Lab() {
  const { lab = "" } = useParams();
  const { role } = useRole();
  const [search] = useSearchParams();

  const visibleLabs = LABS.filter((item) => canVisit(role, `/labs/${item.slug}`));

  // Landing aliases: eer/mapping/ddl → schema, dml/aggregates → sql, routing → /routing.
  if (lab === "routing") return <Navigate to="/routing" replace />;
  if (lab === "eer" || lab === "mapping" || lab === "ddl") {
    const tab = lab === "mapping" ? "mapping" : lab === "ddl" ? "constraints" : "diagram";
    return <Navigate to={`/labs/schema?tab=${tab}`} replace />;
  }
  if (lab === "dml" || lab === "aggregates") {
    return <Navigate to={`/labs/sql?preset=${lab}`} replace />;
  }

  // Ensure role has access to current lab; if not, redirect to first allowed lab or role home.
  if (lab && !canVisit(role, `/labs/${lab}`)) {
    const fallback = visibleLabs[0]?.slug;
    return <Navigate to={fallback ? `/labs/${fallback}` : homeFor(role)} replace />;
  }

  const meta = META[lab];
  if (!meta) {
    const fallback = visibleLabs[0]?.slug ?? "transactions";
    return <Navigate to={`/labs/${fallback}`} replace />;
  }

  const schemaTab = search.get("tab");
  const preset = search.get("preset") ?? undefined;
  const initialTab = schemaTab === "mapping" || schemaTab === "constraints" ? schemaTab : "diagram";

  const dynamicRoleNote =
    lab === "sql"
      ? `Your query runs as ${role ?? "your role"} inside a read-only transaction.`
      : meta.roleNote;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top Console Lab Navigation Bar (filtered to tabs the role can visit) */}
      <nav
        aria-label="Database labs"
        className="inline-flex p-1 bg-[var(--sx-surface)] rounded-[10px] gap-1 overflow-x-auto max-w-full scrollbar-none border border-[var(--sx-hairline)]"
      >
        {visibleLabs.map((item) => {
          const active = lab === item.slug;
          return (
            <Link
              key={item.slug}
              to={`/labs/${item.slug}`}
              className={`font-[var(--font-display)] text-[12px] capitalize font-semibold px-4 py-2 rounded-[8px] transition-colors whitespace-nowrap ${
 active
 ? "bg-[var(--sx-surface-2)] text-white shadow-none"
 : "text-white/60 hover:text-white"
 }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <LabShell
        title={meta.title}
        description={meta.description}
        chips={meta.chips}
        notice={meta.notice}
        roleNote={dynamicRoleNote}
      >
        {lab === "transactions" && <TxLab />}
        {lab === "security" && <SecurityLab />}
        {lab === "indexing" && <IndexLab />}
        {lab === "normalization" && <NormLab />}
        {lab === "schema" && <SchemaLab initialTab={initialTab} />}
        {lab === "sql" && <SqlLab presetName={preset} />}
      </LabShell>
    </div>
  );
}

