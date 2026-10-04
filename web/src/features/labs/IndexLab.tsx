import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { Card, DataGrid, OfflineOrEmpty, PlanTree, SqlBlock } from "./common";
import type { IndexCatalogEntry, IndexQuery, IndexRunResult } from "./types";

interface CatalogResp {
  catalog: IndexCatalogEntry[];
  sizes?: Array<Record<string, unknown>>;
  queries: IndexQuery[];
}

function topNode(plan: unknown): string {
  try {
    const arr = Array.isArray(plan) ? plan : [plan];
    const first = arr[0] as Record<string, unknown>;
    const node = (first["Plan"] as Record<string, unknown>) ?? first;
    return String(node["Node Type"] ?? "?");
  } catch {
    return "?";
  }
}

function totalMs(plan: unknown): number | null {
  try {
    const arr = Array.isArray(plan) ? plan : [plan];
    const first = arr[0] as Record<string, unknown>;
    const node = (first["Plan"] as Record<string, unknown>) ?? first;
    const t = node["Actual Total Time"];
    return typeof t === "number" ? t : null;
  } catch {
    return null;
  }
}

export function IndexLab() {
  const [catalog, setCatalog] = useState<IndexCatalogEntry[]>([]);
  const [sizes, setSizes] = useState<Array<Record<string, unknown>>>([]);
  const [queries, setQueries] = useState<IndexQuery[]>([]);
  const [bootError, setBootError] = useState<unknown>(null);
  const [queryKey, setQueryKey] = useState("");
  const [indexKey, setIndexKey] = useState("");
  const [result, setResult] = useState<IndexRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<CatalogResp>("/api/labs/index/catalog");
      setCatalog(r.data.catalog ?? []);
      setSizes(r.data.sizes ?? []);
      setQueries(r.data.queries ?? []);
      if (r.data.queries.length > 0) {
        setQueryKey((k) => k || r.data.queries[0].key);
        setIndexKey((k) => k || r.data.queries[0].best_index);
      }
      setBootError(null);
    } catch (e) {
      setBootError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!queryKey || !indexKey) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await apiFetch<IndexRunResult>("/api/labs/index/run", {
        method: "POST",
        body: JSON.stringify({ query_key: queryKey, index_key: indexKey }),
      });
      setResult(r.data);
      await load();
    } catch {
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const bulk = async () => {
    setBulkMsg("loading…");
    try {
      const r = await apiFetch<{ rows: number }>("/api/labs/index/bulk", {
        method: "POST",
        body: JSON.stringify({ rows: 500000 }),
      });
      setBulkMsg(`inserted ${r.data.rows ?? 500000} rows (director only)`);
      await load();
    } catch (e) {
      const err = e as { message?: string; sqlstate?: string };
      setBulkMsg(`refused ${err.sqlstate ?? ""}: ${err.message ?? "denied"}`);
    }
  };

  if (bootError !== null && catalog.length === 0) {
    return (
      <OfflineOrEmpty
        error={bootError}
        onRetry={() => void load()}
        hint="GET /api/labs/index/catalog — lab backend (brief 10a) still being built in parallel."
      />
    );
  }

  const shownCatalog = catalog.length > 0 ? catalog : fallbackCatalog();
  const shownQueries = queries.length > 0 ? queries : fallbackQueries();
  const qk = queryKey || shownQueries[0]?.key;
  const activeQuery = shownQueries.find((q) => q.key === qk);

  const before = result ? topNode(result.plan_before) : null;
  const after = result ? topNode(result.plan_after) : null;
  const msB = result ? (result.ms_before ?? totalMs(result.plan_before)) : null;
  const msA = result ? (result.ms_after ?? totalMs(result.plan_after)) : null;
  const maxMs = Math.max(msB ?? 0, msA ?? 0, 1);

  return (
    <div className="flex flex-col gap-6">
      <Card title="Index catalog" kicker="bench_index_catalog() · Exp 8">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shownCatalog.map((c) => (
            <div key={c.key} className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--amber)]">{c.kind}</p>
              <p className="font-mono mt-1 text-[12.5px] font-bold text-[var(--cream)]">{c.key}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--cream-dim)]">{c.purpose}</p>
              <SqlBlock sql={c.ddl} />
              {c.size !== undefined && c.size !== null && (
                <p className="font-mono mt-1.5 text-[10.5px] text-[var(--mute)]">size {c.size}</p>
              )}
            </div>
          ))}
        </div>
        {sizes.length > 0 && (
          <div className="mt-3">
            <DataGrid rows={sizes} limit={20} />
          </div>
        )}
      </Card>

      <Card
        title="Benchmark runner"
        kicker="drop → EXPLAIN → apply → EXPLAIN"
        aside={
          <button
            onClick={() => void bulk()}
            title="Director only: bench_bulk_telemetry(500000)"
            className="font-mono rounded-full border border-[var(--amber)]/60 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--amber)] hover:scale-105"
          >
            bulk load 500k rows
          </button>
        }
      >
        {bulkMsg !== null && (
          <p className="font-mono mb-2 text-[11px] text-[var(--cream-dim)]">{bulkMsg}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="idx-q" className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">Query</label>
          <select
            id="idx-q"
            value={qk}
            onChange={(e) => {
              setQueryKey(e.target.value);
              const q = shownQueries.find((x) => x.key === e.target.value);
              if (q) setIndexKey(q.best_index);
            }}
            className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-1.5 text-[12px] text-[var(--cream)]"
          >
            {shownQueries.map((q) => (
              <option key={q.key} value={q.key}>{q.title}</option>
            ))}
          </select>
          <label htmlFor="idx-i" className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">Index</label>
          <select
            id="idx-i"
            value={indexKey || activeQuery?.best_index}
            onChange={(e) => setIndexKey(e.target.value)}
            className="font-mono rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-2.5 py-1.5 text-[12px] text-[var(--cream)]"
          >
            {shownCatalog.map((c) => (
              <option key={c.key} value={c.key}>{c.key}</option>
            ))}
          </select>
          <button
            onClick={() => void run()}
            disabled={running}
            className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-105 disabled:opacity-40"
          >
            {running ? "running…" : "run"}
          </button>
        </div>
        {activeQuery !== undefined && <div className="mt-2"><SqlBlock label="query" sql={activeQuery.sql} /></div>}
        {result !== null && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              {[{ t: `before · ${before ?? "?"}`, ms: msB, node: before }, { t: `after · ${after ?? "?"}`, ms: msA, node: after }].map((b, i) => (
                <div key={i} className="rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3">
                  <p className="font-mono text-[11px] text-[var(--cream)]">{b.t}</p>
                  <div className="mt-2 h-2.5 rounded bg-[var(--ink-3)]">
                    <div
                      className={`h-2.5 rounded ${i === 0 ? "bg-[var(--amber)]" : "bg-[var(--signal)]"}`}
                      style={{ width: `${b.ms !== null && b.ms !== undefined ? Math.max(3, ((b.ms as number) / maxMs) * 100) : 3}%` }}
                    />
                  </div>
                  <p className="font-mono mt-1.5 text-[11px] text-[var(--cream-dim)]">
                    {b.ms !== null && b.ms !== undefined ? `${(b.ms as number).toFixed(2)} ms` : "timing n/a"}
                    {result.buffers_before !== undefined && i === 0 && result.buffers_before !== null ? ` · buffers ${result.buffers_before}` : ""}
                    {result.buffers_after !== undefined && i === 1 && result.buffers_after !== null ? ` · buffers ${result.buffers_after}` : ""}
                  </p>
                  <p className="font-mono mt-0.5 text-[10.5px] text-[var(--mute)]">
                    scan {b.node ?? "?"} · index size {result.index_size ?? "n/a"}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-mono mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">plan before</p>
                <PlanTree plan={result.plan_before} />
              </div>
              <div>
                <p className="font-mono mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">plan after</p>
                <PlanTree plan={result.plan_after} />
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Partition pruning" kicker="telemetry_YYYYMMDD">
        <p className="text-[13px] leading-relaxed text-[var(--cream-dim)]">
          The 6-hour query (SELECT count(*) FROM telemetry WHERE ts ≥ now() − 6h) should touch only 1–2 daily
          partitions. Run it below; the plan lists exactly which telemetry_YYYYMMDD children were scanned.
        </p>
        <div className="mt-2">
          <SqlBlock sql="SELECT count(*) FROM telemetry WHERE ts >= now() - interval '6 hours';" />
        </div>
      </Card>

      <Card title="Lesson" kicker="read this at viva">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-[var(--cream-dim)]">
          <li>BRIN is tiny and ideal for append-only time series like ts.</li>
          <li>GIN suits JSONB containment on housekeeping.</li>
          <li>The partial index covers only QUEUED packets, so dispatch stays small.</li>
          <li>INCLUDE makes a covering index for index-only scans on (to_node, start_ts).</li>
          <li>A low-selectivity 7-day range correctly stays a seq scan — the planner is right.</li>
        </ul>
      </Card>
    </div>
  );
}

function fallbackCatalog(): IndexCatalogEntry[] {
  return [
    { key: "btree_cube_ts", kind: "btree", ddl: "CREATE INDEX ix_bench_tel_sat_ts ON telemetry (sat_id, ts)", purpose: "Per-sat time-range lookups." },
    { key: "brin_ts", kind: "brin", ddl: "CREATE INDEX ix_bench_tel_brin ON telemetry USING brin (ts) WITH (pages_per_range = 16)", purpose: "Tiny index for append-only ts." },
    { key: "gin_housekeeping", kind: "gin", ddl: "CREATE INDEX ix_bench_tel_gin ON telemetry USING gin (housekeeping jsonb_path_ops)", purpose: "JSONB containment on housekeeping." },
    { key: "partial_queued", kind: "btree partial", ddl: "CREATE INDEX ix_bench_pkt_queued ON packet (origin_sat, created_at) WHERE status = 'QUEUED'", purpose: "Only the dispatchable queue." },
    { key: "covering_contact", kind: "btree covering", ddl: "CREATE INDEX ix_bench_contact_cov ON contact (to_node, start_ts) INCLUDE (link_score, duration_s)", purpose: "Index-only scans of downlink windows." },
    { key: "hash_callsign", kind: "hash", ddl: "CREATE INDEX ix_bench_node_callsign ON network_node USING hash (callsign)", purpose: "Equality lookups on callsigns." },
  ];
}

function fallbackQueries(): IndexQuery[] {
  return [
    { key: "recent_tel", title: "Recent telemetry per sat", sql: "SELECT * FROM telemetry WHERE sat_id = 'SAT-A1' AND ts >= now() - interval '1 day' ORDER BY ts DESC LIMIT 100", best_index: "btree_cube_ts" },
    { key: "six_hour", title: "Partition pruning (6h)", sql: "SELECT count(*) FROM telemetry WHERE ts >= now() - interval '6 hours'", best_index: "brin_ts" },
    { key: "housekeeping", title: "JSONB containment", sql: "SELECT * FROM telemetry WHERE housekeeping @> '{\"sunlit\": true}' LIMIT 100", best_index: "gin_housekeeping" },
    { key: "queued", title: "Queued dispatch", sql: "SELECT * FROM packet WHERE origin_sat = 'SAT-A1' AND status = 'QUEUED' ORDER BY created_at LIMIT 50", best_index: "partial_queued" },
    { key: "downlinks", title: "Downlinks by station", sql: "SELECT to_node, start_ts, link_score FROM contact WHERE to_node = 'GS-BOM' AND start_ts >= now() ORDER BY start_ts LIMIT 50", best_index: "covering_contact" },
    { key: "callsign", title: "Callsign equality", sql: "SELECT * FROM network_node WHERE callsign = 'VU2SA1'", best_index: "hash_callsign" },
  ];
}
