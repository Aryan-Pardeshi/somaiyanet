import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { Card, DataGrid, OfflineOrEmpty, PlanTree, SqlBlock } from "./common";
import type { ConsolePreset, ConsoleResult } from "./types";

export function SqlLab({ presetName }: { presetName?: string }) {
  const [presets, setPresets] = useState<ConsolePreset[]>([]);
  const [bootError, setBootError] = useState<unknown>(null);
  const [query, setQuery] = useState("SELECT * FROM v_constellation_status;");
  const [explain, setExplain] = useState(false);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [role, setRole] = useState("");

  const loadPresets = useCallback(async () => {
    try {
      const r = await apiFetch<ConsolePreset[]>("/api/console/presets");
      setPresets(r.data);
      setBootError(null);
      if (presetName) {
        const hit = r.data.find((p) => p.name.toLowerCase().includes(presetName.toLowerCase()));
        if (hit) setQuery(hit.sql);
      }
    } catch (e) {
      setBootError(e);
    }
  }, [presetName]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const runQuery = useCallback(
    async (sql: string, withExplain: boolean) => {
      if (sql.trim() === "") return;
      setRunning(true);
      setError(null);
      try {
        const r = await apiFetch<ConsoleResult>("/api/console", {
          method: "POST",
          body: JSON.stringify({ query: sql, explain: withExplain }),
        });
        setResult(r.data);
        setRole(r.role);
      } catch (e) {
        const err = e as { message?: string; sqlstate?: string };
        setResult(null);
        setError(`${err.sqlstate ? `${err.sqlstate}: ` : ""}${err.message ?? "failed"}`);
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const grouped = groupPresets(presets);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--mute)]">
          Presets · Exp 4/5/6/7/8/9
        </p>
        {bootError !== null && presets.length === 0 ? (
          <div className="mt-2">
            <OfflineOrEmpty error={bootError} onRetry={() => void loadPresets()} hint="GET /api/console/presets" />
          </div>
        ) : (
          <div className="mt-2 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {(Object.keys(grouped).length > 0 ? Object.entries(grouped) : Object.entries(groupFallback())).map(([g, list]) => (
              <div key={g}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--amber)]">{g}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {(list as ConsolePreset[]).map((p) => (
                    <li key={p.name}>
                      <button
                        onClick={() => { setQuery(p.sql); void runQuery(p.sql, explain); }}
                        className="w-full rounded-lg border border-[var(--rule)] bg-[var(--ink-2)] px-2.5 py-1.5 text-left text-[12px] text-[var(--cream-dim)] hover:border-[var(--somaiya)] hover:text-[var(--cream)]"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <Card
          title="Console"
          kicker={`role ${role || "…"}`}
          aside={
            <label className="font-mono flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--cream-dim)]">
              <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} className="accent-[#d7263d]" />
              explain
            </label>
          }
        >
          <p className="mb-2 rounded-lg border border-dashed border-[var(--amber)]/50 bg-[var(--ink)] p-2.5 text-[12px] leading-relaxed text-[var(--cream-dim)]">
            Statements run inside BEGIN READ ONLY with a 5 s timeout — writes fail with 25006 even for the
            director. That is intentional; the write labs live on the other pages.
          </p>
          <label htmlFor="sql-editor" className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--mute)]">
            Editor · ctrl+enter runs
          </label>
          <textarea
            id="sql-editor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void runQuery(query, explain);
              }
            }}
            rows={6}
            spellCheck={false}
            className="font-mono mt-1 min-h-[140px] w-full rounded-lg border border-[var(--rule)] bg-[var(--ink)] p-3 text-[12.5px] leading-relaxed text-[var(--cream)]"
          />
          <div className="mt-2">
            <button
              onClick={() => void runQuery(query, explain)}
              disabled={running || query.trim() === ""}
              className="font-mono rounded-full bg-[var(--somaiya)] px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white hover:scale-105 disabled:opacity-40"
            >
              {running ? "running…" : "run"}
            </button>
          </div>
          {error !== null && (
            <div role="alert" className="mt-3 rounded-lg border border-[var(--somaiya)] bg-[var(--ink)] p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--somaiya)]">PostgreSQL refused</p>
              <p className="font-mono mt-1 text-[11.5px] text-[var(--cream)]">{error}</p>
            </div>
          )}
          {result !== null && (
            <div className="mt-3 flex flex-col gap-3">
              {explain && result.plan !== undefined && result.plan !== null ? (
                <PlanTree plan={result.plan} />
              ) : (
                <>
                  <p className="font-mono text-[10.5px] text-[var(--mute)]">
                    {result.rowcount} rows{result.rows.length === 500 ? " (capped at 500)" : ""} · NULL dimmed
                  </p>
                  <DataGrid rows={result.rows} limit={500} />
                </>
              )}
            </div>
          )}
        </Card>
        <SqlBlock label="statement sent" sql={query} />
      </div>
    </div>
  );
}

function groupPresets(presets: ConsolePreset[]): Record<string, ConsolePreset[]> {
  const out: Record<string, ConsolePreset[]> = {};
  for (const p of presets) {
    const g = p.group || "Other";
    (out[g] ??= []).push(p);
  }
  return out;
}

function groupFallback(): Record<string, ConsolePreset[]> {
  const list: ConsolePreset[] = [
    { group: "Exp 4 - DML", name: "Queued packets by sat", sql: "SELECT origin_sat, mode, status, COUNT(*) FROM packet GROUP BY origin_sat, mode, status ORDER BY origin_sat LIMIT 50" },
    { group: "Exp 5 - Aggregates", name: "Low power sats (HAVING)", sql: "SELECT * FROM v_low_power" },
    { group: "Exp 6 - CGR", name: "CGR from SAT-A1", sql: "SELECT * FROM cgr_routes('SAT-A1', now())" },
    { group: "Exp 7 - DCL", name: "Privilege matrix", sql: "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('mission_director','station_operator_bom','student_analyst','ai_router') ORDER BY grantee, table_name LIMIT 50" },
  ];
  return groupPresets(list);
}
