import type { ReactNode } from "react";
import { highlightSql } from "@/app/sql";
import { BackendOffline } from "@/app/SqlDrawer";
import { ApiError } from "@/app/api";
import { Panel } from "@/components/cc/Panel";
import { RoleHeader } from "@/app/access";

export { Panel };

export const LABS = [
  { slug: "security", label: "Security" },
  { slug: "schema", label: "Schema" },
  { slug: "sql", label: "SQL console" },
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
  const tone =
    status === "ok" || status === "nominal"
      ? "ok"
      : status === "warn"
        ? "warn"
        : status === "critical"
          ? "critical"
          : undefined;

  return (
    <span className={`sx-status ${className}`} data-tone={tone}>
      {label}
    </span>
  );
}

export function LabShell({
  title,
  description,
  chips,
  notice,
  roleNote,
  children,
}: {
  title: string;
  description?: string;
  chips: string[];
  notice: string[];
  roleNote?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full text-[#dfe6f5] flex flex-col gap-6">
      {/* Title row */}
      <div className="flex flex-col gap-2 border-b border-[var(--sx-hairline)] pb-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="sx-h1">{title}</h1>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span
                  key={c}
                  className="sx-eyebrow text-[var(--sx-text-3)]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {description && (
          <p className="sx-lead">
            {description}
          </p>
        )}
        <RoleHeader note={roleNote} />
      </div>

      {/* Examiner Verification / Notice Panel */}
      {notice.length > 0 && (
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
              <span className="sx-eyebrow">What to look for</span>
              <StatusBadge status="nominal" label="Criteria" />
            </div>
            <ul className="flex flex-col gap-2 pt-1">
              {notice.map((n, i) => (
                <li key={i} className="flex items-start gap-2.5 sx-body text-[14px]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sx-text-3)]" />
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
  void cut;
  return (
    <Panel selected={selected} className={`w-full ${className}`}>
      <div className="p-4 flex flex-col gap-3">
        {(title || kicker || aside) && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {kicker && (
                <span className="sx-eyebrow text-[var(--sx-text-3)]">
                  {kicker}
                </span>
              )}
              {kicker && title && <span className="text-[var(--sx-text-3)] text-[11px]">·</span>}
              <h2 className="sx-h3 truncate">
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
    <div className="flex flex-col gap-1.5">
      {label !== undefined && (
        <span className="sx-eyebrow">
          {label}
        </span>
      )}
      <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
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
      <div className="sx-group p-6 text-center">
        <p className="sx-caption text-[var(--sx-text-3)]">0 rows returned.</p>
      </div>
    );
  const cols = Object.keys(rows[0] ?? {});
  const shown = rows.slice(0, limit);
  return (
    <div className="sx-group overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--sx-hairline)]">
            {cols.map((c) => (
              <th
                key={c}
                className="sx-eyebrow px-4 py-3 font-normal text-[var(--sx-text-2)]"
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
              className="border-b border-[var(--sx-hairline)] last:border-b-0 hover:bg-[var(--sx-surface-2)] transition-colors h-[48px]"
            >
              {cols.map((c) => {
                const v = r[c];
                const s = v === null || v === undefined ? "NULL" : String(v);
                const isNull = v === null || v === undefined;
                const numeric = !isNull && s !== "" && !Number.isNaN(Number(s));
                return (
                  <td
                    key={c}
                    className={`max-w-[320px] truncate px-4 py-3 font-mono text-[13px] ${
                      numeric ? "text-right tabular-nums text-white" : ""
                    } ${isNull ? "text-[var(--sx-text-3)] italic" : "text-white"}`}
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
        <div className="border-t border-[var(--sx-hairline)] px-4 py-2">
          <p className="sx-caption text-[var(--sx-text-3)]">
            Showing <span className="sx-num">{shown.length}</span> of <span className="sx-num">{rows.length}</span> rows
          </p>
        </div>
      )}
    </div>
  );
}

export function RefusalCard({
  error,
}: {
  error: ApiError | { message?: string; sqlstate?: string; status?: number };
}) {
  const code = String(error.sqlstate ?? error.status ?? "42501");
  const is42501 = error.sqlstate === "42501" || String(error.message ?? "").includes("42501");
  return (
    <Panel className="w-full">
      <div role="alert" className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--sx-hairline)] pb-2">
          <span className="sx-status" data-tone="critical">
            {is42501 ? "Permission denied by PostgreSQL" : "PostgreSQL refused"}
          </span>
          <span className="font-mono text-[13px] font-semibold text-[var(--sx-red)]">
            {code}
          </span>
        </div>
        <p className="font-mono text-[13px] text-[var(--sx-text)] leading-relaxed whitespace-pre-wrap">
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
    <Panel className="w-full">
      <div className="p-6 text-center flex flex-col items-center gap-2">
        <span className="sx-eyebrow text-[var(--sx-text-3)]">
          Database lab pending
        </span>
        <p className="sx-body text-[var(--sx-text-2)] max-w-lg">{hint}</p>
        <button
          onClick={onRetry}
          className="sx-btn sx-btn--sm mt-2"
        >
          Retry connection
        </button>
      </div>
    </Panel>
  );
}

/** EXPLAIN JSON → collapsible plan tree with Apple/SpaceX styling (used by the SQL console). */
export function PlanTree({ plan }: { plan: unknown }) {
  if (plan === null || plan === undefined)
    return <p className="sx-caption text-[var(--sx-text-3)]">No plan.</p>;
  let root: Record<string, unknown> | null = null;
  try {
    const p = plan as unknown;
    const arr = Array.isArray(p) ? p : [p];
    const first = arr[0] as Record<string, unknown>;
    root = (first["Plan"] as Record<string, unknown>) ?? first;
  } catch {
    return (
      <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
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
      className="p-3 my-1.5 rounded-[10px] bg-[var(--sx-night)] border border-[var(--sx-hairline)]"
      style={{ marginLeft: depth > 0 ? 14 : 0 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="font-mono text-[13px]">
          <span className="font-semibold text-white">
            {type}
          </span>
          {rel !== null && <span className="text-[var(--sx-text-2)]"> on {rel}</span>}
          {idx !== null && <span className="text-white/80"> using {idx}</span>}
        </p>
        <span
          className="sx-status"
          data-tone={hot ? "ok" : "warn"}
        >
          {hot ? "Index scan" : "Seq scan"}
        </span>
      </div>
      <p className="font-mono mt-1 text-[11px] text-[var(--sx-text-3)]">
        rows <span className="sx-num text-[var(--sx-text-2)]">{actual ?? rows}</span>
        {est !== null && actual !== null ? (
          <> (est <span className="sx-num text-[var(--sx-text-2)]">{est}</span>)</>
        ) : ""}
        {time !== null ? (
          <> · <span className="sx-num text-[var(--sx-text-2)]">{time}</span> ms/cost</>
        ) : ""}
        {buffers !== null ? (
          <> · buf <span className="sx-num text-[var(--sx-text-2)]">{buffers}</span></>
        ) : ""}
      </p>
      {kids.length > 0 && (
        <details className="mt-2" open={depth < 2}>
          <summary className="sx-eyebrow cursor-pointer text-[var(--sx-text-3)] hover:text-white transition-colors">
            {kids.length} child{kids.length > 1 ? "ren" : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 pl-2 border-l border-[var(--sx-hairline)]">
            {kids.map((k, i) => (
              <PlanNode key={i} node={k} depth={depth + 1} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
