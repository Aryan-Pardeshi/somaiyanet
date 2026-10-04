import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { Locked } from "@/app/access";
import { Card, DataGrid, OfflineOrEmpty, Panel, PlanTree, RefusalCard, SqlBlock, StatusBadge } from "./common";
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
  const [error, setError] = useState<ApiError | null>(null);
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

  const run = async (overrideIndexKey?: string) => {
    const ik = overrideIndexKey || indexKey;
    if (!queryKey || !ik) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const r = await apiFetch<IndexRunResult>("/api/labs/index/run", {
        method: "POST",
        body: JSON.stringify({ query_key: queryKey, index_key: ik }),
      });
      setResult(r.data);
      await load();
    } catch (e) {
      setResult(null);
      setError(e as ApiError);
    } finally {
      setRunning(false);
    }
  };

  const bulk = async () => {
    setBulkMsg("Loading…");
    setError(null);
    try {
      const r = await apiFetch<{ inserted?: number; rows?: number }>("/api/labs/index/bulk", {
        method: "POST",
        body: JSON.stringify({ rows: 50000 }),
      });
      setBulkMsg(`Inserted ${r.data.inserted ?? r.data.rows ?? 50000} rows.`);
      await load();
    } catch (e) {
      const err = e as ApiError;
      setError(err);
      setBulkMsg(null);
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
  const speedup = msB !== null && msA !== null && msA > 0 ? (msB / msA).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Index Types as Panels with size in big light number */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
              bench_index_catalog() · Exp 8 · CO3
            </span>
            <span className="text-[#5f6f93] text-[10px]">·</span>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
              Index storage architecture & footprint
            </h2>
          </div>
          <span className="font-mono text-[10px] text-[#5f6f93]">
            {shownCatalog.length} index types
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shownCatalog.map((c) => {
            const sizeVal = result ? sizeFor(result, c.key) : c.size ?? "run to measure";
            return (
              <Panel key={c.key} cut={8} className="w-full">
                <div className="p-3.5 sm:p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <StatusBadge
                      status={c.kind.includes("brin") ? "nominal" : "info"}
                      label={c.kind.toUpperCase()}
                    />
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-mono text-[13px] font-bold text-white tracking-wide block">
                        {c.key}
                      </span>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#8b96b0]">
                        {c.purpose}
                      </p>
                    </div>
                  </div>

                  {/* Size in big light number (Geist Sans weight 300) */}
                  <div className="border border-white/5 bg-black/40 p-2.5 rounded-[2px] flex flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8b96b0]">
                      Index footprint
                    </span>
                    <div className="font-sans text-[28px] sm:text-[32px] font-light text-white tracking-tight leading-none">
                      {sizeVal}
                    </div>
                  </div>

                  <SqlBlock sql={c.ddl} />

                  <div className="pt-1 flex items-center justify-between">
                    <Locked
                      action="bench_index"
                      onTry={() => {
                        setIndexKey(c.key);
                        void run(c.key);
                      }}
                    >
                      <button
                        onClick={() => {
                          setIndexKey(c.key);
                          void run(c.key);
                        }}
                        disabled={running}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 border border-[#3d5bff]/40 text-[#7fb2ff] hover:bg-[#3d5bff]/10 rounded-[2px] transition-colors cursor-pointer"
                      >
                        Benchmark index
                      </button>
                    </Locked>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        {sizes.length > 0 && (
          <div className="mt-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0] block mb-1">
              Live index sizes (pg_relation_size)
            </span>
            <DataGrid rows={sizes} limit={20} />
          </div>
        )}
      </div>

      {/* 2. Benchmark Runner & Timing Comparison as Horizontal Bars */}
      <Panel cut={8} className="w-full">
        <div className="p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                Drop → EXPLAIN → Apply → EXPLAIN
              </span>
              <span className="text-[#5f6f93] text-[10px]">·</span>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
                Live benchmark runner
              </h2>
            </div>
            <Locked action="bench_index" onTry={() => void bulk()}>
              <button
                onClick={() => void bulk()}
                title="Director only: bench_bulk_telemetry(50000)"
                className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-1 border border-[#f5a524]/40 text-[#f5a524] hover:bg-[#f5a524]/10 rounded-[2px] transition-colors cursor-pointer"
              >
                Bulk load 50,000 rows
              </button>
            </Locked>
          </div>

          {bulkMsg !== null && (
            <p className="font-mono text-[11px] text-[#f5a524] bg-[#f5a524]/10 border border-[#f5a524]/30 px-3 py-1.5 rounded-[2px]">
              {bulkMsg}
            </p>
          )}

          {error !== null && (
            <div className="mt-1">
              <RefusalCard error={error} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <label
                htmlFor="idx-q"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
              >
                Query
              </label>
              <select
                id="idx-q"
                value={qk}
                onChange={(e) => {
                  setQueryKey(e.target.value);
                  const q = shownQueries.find((x) => x.key === e.target.value);
                  if (q) setIndexKey(q.best_index);
                }}
                className="font-mono border border-white/10 bg-[#05070d] px-3 py-1.5 text-[12px] text-[#dfe6f5] focus:border-[#3d5bff] focus:outline-none rounded-[2px]"
              >
                {shownQueries.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <label
                htmlFor="idx-i"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
              >
                Index
              </label>
              <select
                id="idx-i"
                value={indexKey || activeQuery?.best_index}
                onChange={(e) => setIndexKey(e.target.value)}
                className="font-mono border border-white/10 bg-[#05070d] px-3 py-1.5 text-[12px] text-[#dfe6f5] focus:border-[#3d5bff] focus:outline-none rounded-[2px]"
              >
                {shownCatalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key} ({c.kind})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Locked action="bench_index" onTry={() => void run()}>
                <button
                  onClick={() => void run()}
                  disabled={running}
                  className="font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] cursor-pointer"
                >
                  Reset indexes
                </button>
              </Locked>
              <Locked action="bench_index" onTry={() => void run()}>
                <button
                  onClick={() => void run()}
                  disabled={running}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-1.5 bg-[#3d5bff] hover:bg-[#324dd8] text-white rounded-[2px] font-semibold transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] disabled:opacity-40 cursor-pointer"
                >
                  {running ? "Benchmarking…" : "Run benchmark"}
                </button>
              </Locked>
            </div>
          </div>

          {activeQuery !== undefined && (
            <div className="mt-1">
              <SqlBlock label="Active benchmark SQL" sql={activeQuery.sql} />
            </div>
          )}

          {/* Timing Comparison as horizontal bars (royal blue vs muted) */}
          {result !== null && (
            <div className="mt-4 flex flex-col gap-4">
              <div className="border border-white/10 bg-[#05070d] p-3.5 rounded-[2px] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                    Execution latency comparison · EXPLAIN ANALYZE
                  </span>
                  {speedup && (
                    <StatusBadge
                      status="ok"
                      label={`${speedup}x faster with ${indexKey}`}
                    />
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* Before: Muted bar */}
                  <div className="border border-white/5 bg-black/40 p-3 rounded-[2px] flex flex-col gap-2">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#8b96b0]">Before (no index)</span>
                      <span className="text-[#f5a524] uppercase font-semibold">
                        {before ?? "SEQ SCAN"}
                      </span>
                    </div>
                    {/* Horizontal muted bar */}
                    <div className="h-3 w-full bg-white/[0.06] rounded-[1px] overflow-hidden">
                      <div
                        className="h-full bg-[#5f6f93] transition-all"
                        style={{
                          width: `${msB !== null ? Math.max(4, (msB / maxMs) * 100) : 4}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="font-sans text-[20px] font-light text-[#dfe6f5]">
                        {msB !== null ? `${msB.toFixed(2)} ms` : "n/a"}
                      </span>
                      <span className="text-[10.5px] text-[#5f6f93]">
                        {result.nodes_before?.join(" → ") ?? before}
                      </span>
                    </div>
                  </div>

                  {/* After: Royal blue bar */}
                  <div className="border border-[#3d5bff]/30 bg-[#3d5bff]/5 p-3 rounded-[2px] flex flex-col gap-2 shadow-[0_0_12px_rgba(61,91,255,0.15)]">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#7fb2ff] font-semibold">
                        After (using {indexKey})
                      </span>
                      <span className="text-[#7ee2b8] uppercase font-semibold">
                        {after ?? "INDEX SCAN"}
                      </span>
                    </div>
                    {/* Horizontal royal blue bar */}
                    <div className="h-3 w-full bg-white/[0.06] rounded-[1px] overflow-hidden">
                      <div
                        className="h-full bg-[#3d5bff] shadow-[0_0_8px_rgba(61,91,255,0.8)] transition-all"
                        style={{
                          width: `${msA !== null ? Math.max(4, (msA / maxMs) * 100) : 4}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="font-sans text-[20px] font-light text-white">
                        {msA !== null ? `${msA.toFixed(2)} ms` : "n/a"}
                      </span>
                      <span className="text-[10.5px] text-[#7ee2b8]">
                        {result.nodes_after?.join(" → ") ?? after}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPLAIN ANALYZE Output in Code Style */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                    EXPLAIN ANALYZE plan · Without index
                  </span>
                  <div className="border border-white/10 bg-[#05070d] p-3 rounded-[2px]">
                    <PlanTree plan={result.plan_before} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                    EXPLAIN ANALYZE plan · With {indexKey}
                  </span>
                  <div className="border border-white/10 bg-[#05070d] p-3 rounded-[2px]">
                    <PlanTree plan={result.plan_after} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* 3. Partition Pruning Panel */}
      <Card title="Telemetry partition pruning" kicker="telemetry_YYYYMMDD">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed text-[#dfe6f5]">
            Queries bounded by short time windows touch only the relevant daily partitions. The planner prunes
            non-matching ranges during query optimization, avoiding scanning millions of historical rows.
          </p>
          <SqlBlock
            label="Partition-pruned range query"
            sql="SELECT count(*) FROM telemetry WHERE ts >= now() - interval '6 hours';"
          />
        </div>
      </Card>

      {/* 4. Lesson / What to look for */}
      <Card title="What to look for" kicker="Index selection strategy">
        <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-[#dfe6f5]">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3d5bff]" />
            <span>
              <strong className="text-white font-mono">BRIN:</strong> Block Range Index requires mere kilobytes for append-only timestamp telemetry columns.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3d5bff]" />
            <span>
              <strong className="text-white font-mono">GIN:</strong> Generalized Inverted Index enables accelerated JSONB containment operations on nested housekeeping payloads.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3d5bff]" />
            <span>
              <strong className="text-white font-mono">Partial Index:</strong> Filters with WHERE status = 'QUEUED' index only active dispatch rows, keeping size trivial.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#3d5bff]" />
            <span>
              <strong className="text-white font-mono">Covering (INCLUDE):</strong> Stores payload columns directly in leaf pages, bypassing table heap lookups entirely (Index-Only Scan).
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function sizeFor(result: IndexRunResult, indexKey: string): string {
  const sizes = result.sizes ?? [];
  const hit = sizes.find((s) => String(s["key"] ?? s["index"] ?? s["name"] ?? "") === indexKey);
  const size = hit ? (hit["size"] ?? hit["bytes"] ?? hit["index_size"]) : undefined;
  return size !== undefined && size !== null ? String(size) : (result.index_size ?? "n/a");
}

function fallbackCatalog(): IndexCatalogEntry[] {
  return [
    {
      key: "btree_cube_ts",
      kind: "btree",
      ddl: "CREATE INDEX ix_bench_tel_sat_ts ON telemetry (sat_id, ts);",
      purpose: "Per-satellite time-range lookups.",
      size: "48 kB",
    },
    {
      key: "brin_ts",
      kind: "brin",
      ddl: "CREATE INDEX ix_bench_tel_brin ON telemetry USING brin (ts) WITH (pages_per_range = 16);",
      purpose: "Tiny index for append-only timestamp telemetry.",
      size: "16 kB",
    },
    {
      key: "gin_housekeeping",
      kind: "gin",
      ddl: "CREATE INDEX ix_bench_tel_gin ON telemetry USING gin (housekeeping jsonb_path_ops);",
      purpose: "JSONB containment operations on subsystem telemetry.",
      size: "64 kB",
    },
    {
      key: "partial_queued",
      kind: "btree partial",
      ddl: "CREATE INDEX ix_bench_pkt_queued ON packet (origin_sat, created_at) WHERE status = 'QUEUED';",
      purpose: "Only indexes dispatchable pending queue items.",
      size: "16 kB",
    },
    {
      key: "covering_contact",
      kind: "btree covering",
      ddl: "CREATE INDEX ix_bench_contact_cov ON contact (to_node, start_ts) INCLUDE (link_score, duration_s);",
      purpose: "Index-only scan covering downlink contact windows.",
      size: "32 kB",
    },
    {
      key: "hash_callsign",
      kind: "hash",
      ddl: "CREATE INDEX ix_bench_node_callsign ON network_node USING hash (callsign);",
      purpose: "O(1) exact equality lookups on callsigns.",
      size: "32 kB",
    },
  ];
}

function fallbackQueries(): IndexQuery[] {
  return [
    {
      key: "recent_tel",
      title: "Recent telemetry per sat",
      sql: "SELECT * FROM telemetry WHERE sat_id = 'SAT-A1' AND ts >= now() - interval '1 day' ORDER BY ts DESC LIMIT 100;",
      best_index: "btree_cube_ts",
    },
    {
      key: "six_hour",
      title: "Partition pruning (6h)",
      sql: "SELECT count(*) FROM telemetry WHERE ts >= now() - interval '6 hours';",
      best_index: "brin_ts",
    },
    {
      key: "housekeeping",
      title: "JSONB containment",
      sql: "SELECT * FROM telemetry WHERE housekeeping @> '{\"sunlit\": true}' LIMIT 100;",
      best_index: "gin_housekeeping",
    },
    {
      key: "queued",
      title: "Queued dispatch",
      sql: "SELECT * FROM packet WHERE origin_sat = 'SAT-A1' AND status = 'QUEUED' ORDER BY created_at LIMIT 50;",
      best_index: "partial_queued",
    },
    {
      key: "downlinks",
      title: "Downlinks by station",
      sql: "SELECT to_node, start_ts, link_score FROM contact WHERE to_node = 'GS-BOM' AND start_ts >= now() ORDER BY start_ts LIMIT 50;",
      best_index: "covering_contact",
    },
    {
      key: "callsign",
      title: "Callsign equality",
      sql: "SELECT * FROM network_node WHERE callsign = 'VU2SA1';",
      best_index: "hash_callsign",
    },
  ];
}

