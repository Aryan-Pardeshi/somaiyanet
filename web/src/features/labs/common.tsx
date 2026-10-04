import type { ReactNode } from "react";
import { highlightSql } from "@/app/sql";
import { BackendOffline } from "@/app/SqlDrawer";
import { ApiError } from "@/app/api";

export const LABS = [
  { slug: "transactions", label: "Transactions", exp: "Exp 9", co: "CO1/CO4" },
  { slug: "security", label: "Security", exp: "Exp 7", co: "CO2" },
  { slug: "indexing", label: "Indexing", exp: "Exp 8", co: "CO3" },
  { slug: "normalization", label: "Normalization", exp: "—", co: "CO3" },
  { slug: "schema", label: "Schema", exp: "Exp 1–3", co: "CO1/CO2" },
  { slug: "sql", label: "SQL console", exp: "Exp 4–6", co: "CO1" },
] as const;

export function LabShell({
  title,
  chips,
  notice,
  children,
}: {
  title: string;
  chips: string[];
  notice: string[];
  children: ReactNode;
}) {
  return (
    <div className="shell grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--text-2)]">{title}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-[var(--navy-700)] px-2.5 py-0.5 text-[12px] text-[var(--ice)]"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
          <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--warn)]">
            What the examiner should notice
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-[var(--text-2)]">
            {notice.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, kicker, children, aside }: {
  title: string;
  kicker?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--navy-800)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {kicker !== undefined && (
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--text-3)]">
            {kicker}
          </span>
        )}
        <h2 className="font-sans text-[16px] font-bold">{title}</h2>
        {aside !== undefined && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SqlBlock({ label, sql }: { label?: string; sql: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-2.5">
      {label !== undefined && (
        <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--text-3)]">
          {label}
        </p>
      )}
      <pre className="font-mono mt-1 overflow-x-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--text)]">
        {highlightSql(sql)}
      </pre>
    </div>
  );
}

export function DataGrid({ rows, limit = 50 }: {
  rows: Array<Record<string, unknown>>;
  limit?: number;
}) {
  if (rows.length === 0)
    return (
      <p className="font-mono text-[11px] text-[var(--text-3)]">0 rows.</p>
    );
  const cols = Object.keys(rows[0] ?? {});
  const shown = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 bg-[var(--navy-900)]">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="border-b border-[var(--line)] px-2.5 py-2 text-[12px] font-medium text-[var(--text-2)]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-b border-[var(--line)]/60 odd:bg-[var(--space)] even:bg-[var(--navy-800)] hover:bg-[var(--navy-700)]">
              {cols.map((c) => {
                const v = r[c];
                const s = v === null || v === undefined ? "NULL" : String(v);
                const isNull = v === null || v === undefined;
                const numeric = !isNull && s !== "" && !Number.isNaN(Number(s));
                return (
                  <td
                    key={c}
                    className={`max-w-[320px] truncate px-2.5 py-2 tabular-nums ${
                      numeric ? "text-right" : ""
                    } ${isNull ? "text-[var(--text-3)]" : "text-[var(--text)]"}`}
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
        <p className="font-mono border-t border-[var(--line)] px-2.5 py-1.5 text-[10px] text-[var(--text-3)]">
          showing {shown.length} of {rows.length} rows
        </p>
      )}
    </div>
  );
}

export function RefusalCard({ error }: { error: ApiError }) {
  return (
    <div role="alert" className="rounded-xl border border-[var(--line)] border-l-4 border-l-[var(--danger)] bg-[var(--navy-800)] p-4">
      <p className="text-[13px] font-semibold text-[var(--text)]">
        PostgreSQL refused this <span className="ml-1 rounded-full bg-[var(--navy-700)] px-2 py-0.5 font-mono text-[10px] text-[var(--danger)]">{error.sqlstate ?? error.status}</span>
      </p>
      <p className="mt-1.5 text-[13px] text-[var(--text)]">{error.message}</p>
    </div>
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
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--navy-800)] p-6 text-center">
      <p className="font-mono text-[11px] tracking-[0.16em] text-[var(--text-2)]">
        Lab backend pending
      </p>
      <p className="font-mono mt-2 text-[11px] text-[var(--text-3)]">{hint}</p>
      <button
        onClick={onRetry}
        className="font-mono mt-3 rounded-full border border-[var(--line)] px-3 py-1 text-[10px] tracking-[0.14em] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)]"
      >
        retry
      </button>
    </div>
  );
}

/** EXPLAIN JSON → collapsible plan tree (shared by indexing + SQL console). */
export function PlanTree({ plan }: { plan: unknown }) {
  if (plan === null || plan === undefined)
    return <p className="font-mono text-[11px] text-[var(--text-3)]">No plan.</p>;
  let root: Record<string, unknown> | null = null;
  try {
    const p = plan as unknown;
    const arr = Array.isArray(p) ? p : [p];
    const first = arr[0] as Record<string, unknown>;
    root = (first["Plan"] as Record<string, unknown>) ?? first;
  } catch {
    return <pre className="font-mono text-[11px] text-[var(--text-2)]">{String(plan).slice(0, 2000)}</pre>;
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
      className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-2.5"
      style={{ marginLeft: depth > 0 ? 14 : 0 }}
    >
      <p className="font-mono text-[11.5px]">
        <span className={hot ? "text-[var(--ok)]" : "text-[var(--warn)]"}>{type}</span>
        {rel !== null && <span className="text-[var(--text)]"> on {rel}</span>}
        {idx !== null && <span className="text-[var(--ice)]"> using {idx}</span>}
      </p>
      <p className="font-mono mt-1 text-[10.5px] text-[var(--text-3)]">
        rows {actual ?? rows}{est !== null && actual !== null ? ` (est ${est})` : ""}
        {time !== null ? ` · ${time} ms/cost` : ""}
        {buffers !== null ? ` · buf ${buffers}` : ""}
      </p>
      {kids.length > 0 && (
        <details className="mt-2" open={depth < 2}>
          <summary className="font-mono cursor-pointer text-[10px] tracking-[0.14em] text-[var(--text-2)]">
            {kids.length} child{kids.length > 1 ? "ren" : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {kids.map((k, i) => (
              <PlanNode key={i} node={k} depth={depth + 1} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
