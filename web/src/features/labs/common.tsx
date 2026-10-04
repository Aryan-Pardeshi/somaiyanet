import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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
  slug,
  title,
  chips,
  notice,
  children,
}: {
  slug: string;
  title: string;
  chips: string[];
  notice: string[];
  children: ReactNode;
}) {
  return (
    <div className="shell grid gap-6 py-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Labs" className="lg:sticky lg:top-20 lg:self-start">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mute)]">
          Labs
        </p>
        <ul className="mt-2 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {LABS.map((l) => (
            <li key={l.slug} className="shrink-0">
              <Link
                to={`/labs/${l.slug}`}
                aria-current={l.slug === slug ? "page" : undefined}
                className={`font-mono block rounded-lg border px-3 py-2 text-[11px] uppercase tracking-[0.14em] ${
                  l.slug === slug
                    ? "border-[var(--somaiya)] bg-[var(--somaiya-soft)] text-[var(--cream)]"
                    : "border-[var(--rule)] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]">
          <span className="text-[var(--somaiya)]">Lab</span>
          <span className="mx-2 text-[var(--mute)]">/</span>
          <span className="text-[var(--cream-dim)]">{title}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="font-mono rounded-full bg-[var(--somaiya-soft)] px-2.5 py-0.5 text-[10px] tracking-[0.1em] text-[var(--cream)]"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--amber)]">
            What the examiner should notice
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-[var(--cream-dim)]">
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
    <section className="min-w-0 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {kicker !== undefined && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
            {kicker}
          </span>
        )}
        <h2 className="font-display text-[16px] font-bold">{title}</h2>
        {aside !== undefined && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SqlBlock({ label, sql }: { label?: string; sql: string }) {
  return (
    <div className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-2.5">
      {label !== undefined && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
          {label}
        </p>
      )}
      <pre className="font-mono mt-1 overflow-x-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--cream)]">
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
      <p className="font-mono text-[11px] text-[var(--mute)]">0 rows.</p>
    );
  const cols = Object.keys(rows[0] ?? {});
  const shown = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--rule)]">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-[var(--ink-3)]">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="font-mono border-b border-[var(--rule)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--cream-dim)]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="odd:bg-[var(--ink)] even:bg-[var(--ink-2)]">
              {cols.map((c) => {
                const v = r[c];
                const s = v === null || v === undefined ? "NULL" : String(v);
                const isNull = v === null || v === undefined;
                return (
                  <td
                    key={c}
                    className={`font-mono max-w-[320px] truncate px-2.5 py-1.5 text-[11.5px] ${
                      isNull ? "text-[var(--mute)]" : "text-[var(--cream)]"
                    }`}
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
        <p className="font-mono border-t border-[var(--rule)] px-2.5 py-1.5 text-[10px] text-[var(--mute)]">
          showing {shown.length} of {rows.length} rows
        </p>
      )}
    </div>
  );
}

export function RefusalCard({ error }: { error: ApiError }) {
  return (
    <div role="alert" className="rounded-xl border border-[var(--somaiya)] bg-[var(--ink-2)] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--somaiya)]">
        PostgreSQL refused {error.sqlstate ?? error.status}
      </p>
      <p className="mt-1.5 text-[13px] text-[var(--cream)]">{error.message}</p>
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
    <div className="rounded-xl border border-dashed border-[var(--rule)] bg-[var(--ink-2)] p-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--cream-dim)]">
        Lab backend pending
      </p>
      <p className="font-mono mt-2 text-[11px] text-[var(--mute)]">{hint}</p>
      <button
        onClick={onRetry}
        className="font-mono mt-3 rounded-full border border-[var(--rule)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
      >
        retry
      </button>
    </div>
  );
}

/** EXPLAIN JSON → collapsible plan tree (shared by indexing + SQL console). */
export function PlanTree({ plan }: { plan: unknown }) {
  if (plan === null || plan === undefined)
    return <p className="font-mono text-[11px] text-[var(--mute)]">No plan.</p>;
  let root: Record<string, unknown> | null = null;
  try {
    const p = plan as unknown;
    const arr = Array.isArray(p) ? p : [p];
    const first = arr[0] as Record<string, unknown>;
    root = (first["Plan"] as Record<string, unknown>) ?? first;
  } catch {
    return <pre className="font-mono text-[11px] text-[var(--cream-dim)]">{String(plan).slice(0, 2000)}</pre>;
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
      className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-2.5"
      style={{ marginLeft: depth > 0 ? 14 : 0 }}
    >
      <p className="font-mono text-[11.5px]">
        <span className={hot ? "text-[var(--signal)]" : "text-[var(--amber)]"}>{type}</span>
        {rel !== null && <span className="text-[var(--cream)]"> on {rel}</span>}
        {idx !== null && <span className="text-[var(--sky)]"> using {idx}</span>}
      </p>
      <p className="font-mono mt-1 text-[10.5px] text-[var(--mute)]">
        rows {actual ?? rows}{est !== null && actual !== null ? ` (est ${est})` : ""}
        {time !== null ? ` · ${time} ms/cost` : ""}
        {buffers !== null ? ` · buf ${buffers}` : ""}
      </p>
      {kids.length > 0 && (
        <details className="mt-2" open={depth < 2}>
          <summary className="font-mono cursor-pointer text-[10px] uppercase tracking-[0.14em] text-[var(--cream-dim)]">
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
