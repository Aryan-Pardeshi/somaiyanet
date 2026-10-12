import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { LABS, LabShell } from "@/features/labs/common";
import { SecurityLab } from "@/features/labs/SecurityLab";
import { SchemaLab } from "@/features/labs/SchemaLab";
import { SqlLab } from "@/features/labs/SqlLab";
import { canVisit, homeFor, useRole } from "@/app/access";

const META: Record<
  string,
  { title: string; description: string; chips: string[]; notice: string[]; roleNote: string }
> = {
  security: {
    title: "Security",
    description:
      "Who can see and change what. Every answer on this page comes from PostgreSQL itself.",
    chips: [],
    roleNote: "Each check logs in as the person you pick and is undone afterwards, so nothing is saved.",
    notice: [
      "Pick a person: Yes and No are real attempts by that PostgreSQL user (GRANT and column privileges).",
      "Row-level security: the same query shows each station only its own passes.",
      "Only the Mission Director can read the change history.",
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
      "The EXPLAIN toggle draws the query plan as a tree.",
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
    const fallback = visibleLabs[0]?.slug ?? "security";
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
        {lab === "security" && <SecurityLab />}
        {lab === "schema" && <SchemaLab initialTab={initialTab} />}
        {lab === "sql" && <SqlLab presetName={preset} />}
      </LabShell>
    </div>
  );
}

