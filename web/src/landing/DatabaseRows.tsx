import { Link } from "react-router-dom";
import { SectionLabel } from "./SectionLabel";

const ROWS: Array<[string, string, string, string]> = [
  ["01", "EER generalization", "network_node → satellite / ground_station, packet → subtypes", "eer"],
  ["02", "Mapping & keys", "composite FKs, weak entities, totality triggers", "mapping"],
  ["03", "DDL", "domains, enums, partitions, exclusion constraints", "ddl"],
  ["04", "DML", "contacts, telemetry, packets, CGR routing runs", "dml"],
  ["05", "Aggregates", "workload, low-power, queue mix, KPI materialized view", "aggregates"],
  ["06", "Routing", "link_score, recursive CTE, dispatch, execute_pass", "routing"],
  ["07", "Security", "roles, column privs, forced RLS, HMAC telecommands", "security"],
  ["08", "Indexing", "index lab: what the bench proves", "indexing"],
  ["09", "Transactions", "deploy TCL, savepoints, SKIP LOCKED dispatch", "transactions"],
];

/** 9 DBMS experiments as numbered hairline rows linking to /labs/<slug>. */
export function DatabaseRows() {
  return (
    <section className="border-t border-white/10 bg-black py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <SectionLabel>THE DATABASE IS MISSION CONTROL</SectionLabel>
        <div className="mt-8 border-t border-white/10">
          {ROWS.map(([n, title, desc, slug]) => (
            <Link
              key={slug}
              to={`/labs/${slug}`}
              className="group grid gap-2 border-b border-white/10 py-6 transition-colors hover:bg-white/[0.03] md:grid-cols-[80px_1fr_1.4fr_40px]"
            >
              <span className="font-mono text-[12px]" style={{ color: "var(--royal)", letterSpacing: "0.08em" }}>
                [{n}]
              </span>
              <span className="text-[18px] font-light text-white">{title}</span>
              <span className="text-[14px]" style={{ color: "#9aa3b8" }}>{desc}</span>
              <span className="text-white opacity-0 transition-opacity group-hover:opacity-100">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
