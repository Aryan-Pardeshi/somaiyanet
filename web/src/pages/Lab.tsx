import { Link, Navigate, useParams } from "react-router-dom";
import { LABS, LabShell } from "@/features/labs/common";
import { TxLab } from "@/features/labs/TxLab";
import { SecurityLab } from "@/features/labs/SecurityLab";
import { IndexLab } from "@/features/labs/IndexLab";
import { NormLab } from "@/features/labs/NormLab";
import { SchemaLab } from "@/features/labs/SchemaLab";
import { SqlLab } from "@/features/labs/SqlLab";

const META: Record<
  string,
  { title: string; description: string; chips: string[]; notice: string[] }
> = {
  transactions: {
    title: "Transactions",
    description:
      "Two-session concurrency workbench — row lock contention, SERIALIZABLE write-skew (40001), deadlock aborts (40P01), and MVCC tuple versions.",
    chips: ["EXP 9", "CO1", "CO4"],
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
    chips: ["EXP 7", "CO2"],
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
    chips: ["EXP 8", "CO3"],
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
    chips: ["CO3", "UNF → BCNF"],
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
    chips: ["EXP 1–3", "CO1", "CO2"],
    notice: [
      "Ice d-circles are the disjoint EER splits: node and packet hierarchies.",
      "Double borders are weak entities; ▤ is the RANGE-partitioned telemetry.",
      "Click any table for its comment, columns and constraint list.",
    ],
  },
  sql: {
    title: "SQL console",
    description:
      "Read-only interactive SQL command console with transaction safeguards, query plan inspection, and catalog presets.",
    chips: ["EXP 4–6", "CO1"],
    notice: [
      "Presets cover DML, aggregates, set ops, CGR, views and LIKE in one sidebar.",
      "EXPLAIN toggle renders the shared plan-tree visualizer used by indexing.",
      "Writes fail with 25006 by design — this console is BEGIN READ ONLY.",
    ],
  },
};

export default function Lab() {
  const { lab = "" } = useParams();

  // Landing aliases: eer/mapping/ddl → schema, dml/aggregates → sql, routing → /routing.
  if (lab === "routing") return <Navigate to="/routing" replace />;
  if (lab === "eer" || lab === "mapping" || lab === "ddl") {
    const tab = lab === "mapping" ? "mapping" : lab === "ddl" ? "constraints" : "diagram";
    return <Navigate to={`/labs/schema?tab=${tab}`} replace />;
  }
  if (lab === "dml" || lab === "aggregates") {
    return <Navigate to={`/labs/sql?preset=${lab}`} replace />;
  }

  const meta = META[lab];
  if (!meta) return <Navigate to="/labs/transactions" replace />;

  const search = new URLSearchParams(window.location.search);
  const schemaTab = search.get("tab");
  const preset = search.get("preset") ?? undefined;
  const initialTab = schemaTab === "mapping" || schemaTab === "constraints" ? schemaTab : "diagram";

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top Console Lab Navigation Bar */}
      <nav
        aria-label="Database labs"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
      >
        {LABS.map((item) => {
          const active = lab === item.slug;
          return (
            <Link
              key={item.slug}
              to={`/labs/${item.slug}`}
              className={`flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-all shrink-0 rounded-[2px] ${
                active
                  ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_10px_rgba(61,91,255,0.4)]"
                  : "bg-white/[0.03] text-[#8b96b0] hover:text-[#dfe6f5] hover:bg-white/[0.06] border border-white/10"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded-[1px] ${
                  active ? "bg-white/20 text-white" : "text-[#5f6f93]"
                }`}
              >
                {item.exp}
              </span>
            </Link>
          );
        })}
      </nav>

      <LabShell
        title={meta.title}
        description={meta.description}
        chips={meta.chips}
        notice={meta.notice}
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

