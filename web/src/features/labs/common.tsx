import type { ReactNode } from "react";
import { highlightSql } from "@/app/sql";
import { BackendOffline } from "@/app/SqlDrawer";
import { ApiError } from "@/app/api";
import { Panel } from "@/components/cc/Panel";

export { Panel };

export const LABS = [
  { slug: "transactions", label: "Transactions", exp: "Exp 9", co: "CO1/CO4" },
  { slug: "security", label: "Security", exp: "Exp 7", co: "CO2" },
  { slug: "indexing", label: "Indexing", exp: "Exp 8", co: "CO3" },
  { slug: "normalization", label: "Normalization", exp: "—", co: "CO3" },
  { slug: "schema", label: "Schema", exp: "Exp 1–3", co: "CO1/CO2" },
  { slug: "sql", label: "SQL console", exp: "Exp 4–6", co: "CO1" },
] as const;

export function StatusBadge({
  status = "info",
  label,
  className = "",
}: {
  status?: "ok" | "nominal" | "warn" | "critical" | "info";
  label: string;
  className?: string;
}) {
  let color = "#3d5bff";
  let textColor = "#7fb2ff";
  if (status === "ok" || status === "nominal") {
    color = "#7ee2b8";
    textColor = "#7ee2b8";
  } else if (status === "warn") {
    color = "#f5a524";
    textColor = "#f5a524";
  } else if (status === "critical") {
    color = "#ff3b4f";
    textColor = "#ff3b4f";
  }

  return (
    <span
      className={`inline-flex items-center font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border ${className}`}
      style={{
        color: textColor,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function LabShell({
  title,
  description,
  chips,
  notice,
  children,
}: {
  title: string;
  description?: string;
  chips: string[];
  notice: string[];
  children: ReactNode;
}) {
  return (
    <div className="w-full text-[#dfe6f5] flex flex-col gap-5">
      {/* Title row: light 28-34px title, muted one-line description, experiment/CO badges */}
      <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-sans text-[28px] sm:text-[32px] font-light text-white tracking-tight leading-none">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-[2px] border border-[#3d5bff]/40 text-[#7fb2ff] bg-[#3d5bff]/10"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
        {description && (
          <p className="text-[13px] text-[#8b96b0] max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {/* Examiner Verification / Notice Panel */}
      {notice.length > 0 && (
        <Panel cut={8} className="w-full">
          <div className="p-3.5 sm:p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Examiner verification · What to notice
              </span>
              <StatusBadge status="nominal" label="Criteria" />
            </div>
            <ul className="flex flex-col gap-1.5 pt-1">
              {notice.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-[#dfe6f5]">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3d5bff]" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {/* Lab content */}
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}

export function Card({
  title,
  kicker,
  children,
  aside,
  selected = false,
  cut = 8,
  className = "",
}: {
  title: string;
  kicker?: string;
  aside?: ReactNode;
  children: ReactNode;
  selected?: boolean;
  cut?: number;
  className?: string;
}) {
  return (
    <Panel cut={cut} selected={selected} className={`w-full ${className}`}>
      <div className="p-3.5 sm:p-4 flex flex-col gap-3">
        {(title || kicker || aside) && (
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {kicker && (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                  {kicker}
                </span>
              )}
              {kicker && title && <span className="text-[#5f6f93] text-[10px]">·</span>}
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0] truncate">
                {title}
              </h2>
            </div>
            {aside && <div className="ml-auto shrink-0">{aside}</div>}
          </div>
        )}
        <div className="min-w-0">{children}</div>
      </div>
    </Panel>
  );
}

export function SqlBlock({ label, sql }: { label?: string; sql: string }) {
  return (
    <div className="border border-white/10 bg-[#05070d] p-3 text-left">
      {label !== undefined && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] mb-1.5">
          {label}
        </p>
      )}
      <pre className="font-mono overflow-x-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#dfe6f5]">
        {highlightSql(sql)}
      </pre>
    </div>
  );
}

export function DataGrid({
  rows,
  limit = 50,
}: {
  rows: Array<Record<string, unknown>>;
  limit?: number;
}) {
  if (rows.length === 0)
    return (
      <div className="border border-white/10 bg-[#05070d] p-4 text-center">
        <p className="font-mono text-[11px] text-[#5f6f93]">0 rows returned.</p>
      </div>
    );
  const cols = Object.keys(rows[0] ?? {});
  const shown = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto border border-white/10 bg-[#05070d]/60">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/[0.08] bg-[#05070d]">
            {cols.map((c) => (
              <th
                key={c}
                className="font-mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] font-normal"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr
              key={i}
              className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
            >
              {cols.map((c) => {
                const v = r[c];
                const s = v === null || v === undefined ? "NULL" : String(v);
                const isNull = v === null || v === undefined;
                const numeric = !isNull && s !== "" && !Number.isNaN(Number(s));
                return (
                  <td
                    key={c}
                    className={`max-w-[320px] truncate px-3 py-2 font-mono text-[12px] ${
                      numeric ? "text-right tabular-nums text-[#dfe6f5]" : ""
                    } ${isNull ? "text-[#5f6f93] italic" : "text-[#dfe6f5]"}`}
                    title={s}
                  >
                    {s}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <div className="border-t border-white/[0.06] bg-[#05070d] px-3 py-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#8b96b0]">
            Showing {shown.length} of {rows.length} rows
          </p>
        </div>
      )}
    </div>
  );
}

export function RefusalCard({ error }: { error: ApiError }) {
  return (
    <Panel
      cut={8}
      borderColor="rgba(255, 59, 79, 0.45)"
      glowColor="rgba(255, 59, 79, 0.15)"
      className="w-full"
    >
      <div role="alert" className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ff3b4f] font-semibold">
            PostgreSQL refused
          </span>
          <StatusBadge
            status="critical"
            label={String(error.sqlstate ?? error.status ?? "42501")}
          />
        </div>
        <p className="text-[13px] text-[#dfe6f5] leading-relaxed">
          {error.message}
        </p>
      </div>
    </Panel>
  );
}

export function OfflineOrEmpty({
  error,
  onRetry,
  hint,
}: {
  error: unknown;
  onRetry: () => void;
  hint: string;
}) {
  const e = error as { status?: number } | null;
  if (e?.status === 0 || e?.status === 404) return <BackendOffline onRetry={onRetry} />;
  return (
    <Panel cut={8} className="w-full">
      <div className="border border-dashed border-white/15 p-6 text-center flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#8b96b0]">
          Lab backend pending
        </span>
        <p className="font-mono text-[11px] text-[#5f6f93] max-w-lg">{hint}</p>
        <button
          onClick={onRetry}
          className="font-mono mt-2 text-[11px] uppercase tracking-[0.1em] px-3.5 py-1.5 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] cursor-pointer"
        >
          RETRY CONNECTION
        </button>
      </div>
    </Panel>
  );
}

/** EXPLAIN JSON → collapsible plan tree with chamfered boxes (shared by indexing + SQL console). */
export function PlanTree({ plan }: { plan: unknown }) {
  if (plan === null || plan === undefined)
    return <p className="font-mono text-[11px] text-[#5f6f93]">No plan.</p>;
  let root: Record<string, unknown> | null = null;
  try {
    const p = plan as unknown;
    const arr = Array.isArray(p) ? p : [p];
    const first = arr[0] as Record<string, unknown>;
    root = (first["Plan"] as Record<string, unknown>) ?? first;
  } catch {
    return (
      <pre className="font-mono text-[11.5px] text-[#dfe6f5] border border-white/10 bg-[#05070d] p-3">
        {String(plan).slice(0, 2000)}
      </pre>
    );
  }
  if (root === null) return null;
  return <PlanNode node={root} depth={0} />;
}

function planField(n: Record<string, unknown>, k: string): string | null {
  const v = n[k];
  return v === undefined || v === null ? null : String(v);
}

function PlanNode({ node, depth }: { node: Record<string, unknown>; depth: number }) {
  const type = planField(node, "Node Type") ?? "Node";
  const rel = planField(node, "Relation Name");
  const idx = planField(node, "Index Name");
  const rows = planField(node, "Actual Rows") ?? planField(node, "Plan Rows") ?? "?";
  const est = planField(node, "Plan Rows");
  const actual = planField(node, "Actual Rows");
  const time = planField(node, "Actual Total Time") ?? planField(node, "Total Cost");
  const buffers = planField(node, "Shared Hit Blocks") ?? planField(node, "Actual Loops");
  const hot = /index|bitmap/i.test(type) || idx !== null;
  const kids = (node["Plans"] as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div
      className="border border-white/10 bg-[#05070d] p-2.5 my-1"
      style={{
        marginLeft: depth > 0 ? 14 : 0,
        clipPath: "polygon(4px 0%, calc(100% - 4px) 0%, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0% calc(100% - 4px), 0% 4px)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="font-mono text-[11.5px]">
          <span className={hot ? "text-[#7ee2b8] font-semibold" : "text-[#f5a524] font-semibold"}>
            {type}
          </span>
          {rel !== null && <span className="text-[#dfe6f5]"> on {rel}</span>}
          {idx !== null && <span className="text-[#7fb2ff]"> using {idx}</span>}
        </p>
        <span
          className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-[1px] border"
          style={{
            color: hot ? "#7ee2b8" : "#f5a524",
            borderColor: hot ? "rgba(126,226,184,0.3)" : "rgba(245,165,36,0.3)",
          }}
        >
          {hot ? "INDEX SCAN" : "SEQ SCAN"}
        </span>
      </div>
      <p className="font-mono mt-1 text-[10.5px] text-[#8b96b0]">
        rows {actual ?? rows}{est !== null && actual !== null ? ` (est ${est})` : ""}
        {time !== null ? ` · ${time} ms/cost` : ""}
        {buffers !== null ? ` · buf ${buffers}` : ""}
      </p>
      {kids.length > 0 && (
        <details className="mt-2" open={depth < 2}>
          <summary className="font-mono cursor-pointer text-[10px] tracking-[0.14em] uppercase text-[#8b96b0] hover:text-[#dfe6f5]">
            {kids.length} child{kids.length > 1 ? "ren" : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 pl-2 border-l border-white/[0.08]">
            {kids.map((k, i) => (
              <PlanNode key={i} node={k} depth={depth + 1} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

