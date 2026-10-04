import { Navigate, useParams } from "react-router-dom";
import { LabShell } from "@/features/labs/common";
import { TxLab } from "@/features/labs/TxLab";
import { SecurityLab } from "@/features/labs/SecurityLab";
import { IndexLab } from "@/features/labs/IndexLab";
import { NormLab } from "@/features/labs/NormLab";
import { SchemaLab } from "@/features/labs/SchemaLab";
import { SqlLab } from "@/features/labs/SqlLab";

const META: Record<string, { title: string; chips: string[]; notice: string[] }> = {
  transactions: {
    title: "Transactions",
    chips: ["Exp 9", "CO1", "CO4"],
    notice: [
      "Session B waits on Session A's row lock — the lock table and wait-for arrows prove it.",
      "SERIALIZABLE write-skew ends in 40001; the deadlock script ends in 40P01 with one victim.",
      "SKIP LOCKED dispatch claims disjoint packet id sets for the two router workers.",
    ],
  },
  security: {
    title: "Security",
    chips: ["Exp 7", "CO2"],
    notice: [
      "The heatmap's denied cells are real has_*_privilege answers, not hard-coded.",
      "RLS: each station operator's downlink count covers only their own to_node.",
      "The audit log refuses non-directors with a genuine 42501 from Postgres.",
    ],
  },
  indexing: {
    title: "Indexing",
    chips: ["Exp 8", "CO3"],
    notice: [
      "Before/after bars show the scan node flip: Seq Scan → Bitmap/Index Scan.",
      "BRIN stays tiny on append-only ts; the partial index only covers QUEUED.",
      "A low-selectivity 7-day range correctly keeps the seq scan — planner is right.",
    ],
  },
  normalization: {
    title: "Normalization",
    chips: ["CO3", "UNF → BCNF"],
    notice: [
      "Highlighted columns are the duplicated facts that each normal form removes.",
      "FD arrows name the exact form they violate and the fix applied next.",
      "Every decomposition step in the lossless proof rejoins with 0 missing/spurious.",
    ],
  },
  schema: {
    title: "Schema",
    chips: ["Exp 1–3", "CO1", "CO2"],
    notice: [
      "Ice d-circles are the disjoint EER splits: node and packet hierarchies.",
      "Double borders are weak entities; ▤ is the RANGE-partitioned telemetry.",
      "Click any table for its comment, columns and constraint list.",
    ],
  },
  sql: {
    title: "SQL console",
    chips: ["Exp 4–6", "CO1"],
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
    <LabShell title={meta.title} chips={meta.chips} notice={meta.notice}>
      {lab === "transactions" && <TxLab />}
      {lab === "security" && <SecurityLab />}
      {lab === "indexing" && <IndexLab />}
      {lab === "normalization" && <NormLab />}
      {lab === "schema" && <SchemaLab initialTab={initialTab} />}
      {lab === "sql" && <SqlLab presetName={preset} />}
    </LabShell>
  );
}
