import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { useRole } from "@/app/access";
import { DataGrid, OfflineOrEmpty, Panel, PlanTree, SqlBlock, StatusBadge } from "./common";
import type { ConsolePreset, ConsoleResult } from "./types";

const ROLES = [
  "mission_director",
  "station_operator_bom",
  "station_operator_hel",
  "student_analyst",
  "ai_router",
];

function shortRole(r: string): string {
  return r.replace("mission_", "").replace("station_operator_", "").replace("student_", "");
}

export function SqlLab({ presetName }: { presetName?: string }) {
  const { role: currentRole } = useRole();
  const [presets, setPresets] = useState<ConsolePreset[]>([]);
  const [bootError, setBootError] = useState<unknown>(null);
  const [query, setQuery] = useState("SELECT * FROM v_constellation_status;");
  const [explain, setExplain] = useState(false);
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [error, setError] = useState<{ message: string; sqlstate?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [role, setRole] = useState(currentRole ?? "mission_director");

  useEffect(() => {
    if (currentRole) {
      setRole(currentRole);
    }
  }, [currentRole]);

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
        if (r.role) setRole(r.role);
      } catch (e) {
        const err = e as { message?: string; sqlstate?: string };
        setResult(null);
        setError({
          message: err.message ?? "Query execution failed",
          sqlstate: err.sqlstate,
        });
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  // Queries run as the session's Postgres role, so switching here switches
  // the whole console session; reload so the shell's menu and header follow.
  const handleRoleChange = async (newRole: string) => {
    try {
      await apiFetch("/api/session", {
        method: "POST",
        body: JSON.stringify({ role: newRole }),
      });
      setRole(newRole);
      window.location.reload();
    } catch (e) {
      const err = e as { message?: string; sqlstate?: string };
      setError({ message: err.message ?? "Could not switch role", sqlstate: err.sqlstate });
    }
  };

  const grouped = groupPresets(presets);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* 1. Presets as a list in a Panel */}
      <Panel cut={8} className="w-full lg:sticky lg:top-16 lg:self-start">
        <div className="p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
              Presets catalog
            </span>
            <span className="font-mono text-[10px] text-[#5f6f93]">
              Exp 4–9
            </span>
          </div>

          {bootError !== null && presets.length === 0 ? (
            <OfflineOrEmpty
              error={bootError}
              onRetry={() => void loadPresets()}
              hint="GET /api/console/presets"
            />
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto scrollbar-none">
              {(Object.keys(grouped).length > 0 ? Object.entries(grouped) : Object.entries(groupFallback())).map(
                ([g, list]) => (
                  <div key={g} className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[#8b96b0] font-semibold">
                      {g}
                    </span>
                    <div className="flex flex-col gap-1">
                      {(list as ConsolePreset[]).map((p) => (
                        <button
                          key={p.name}
                          onClick={() => {
                            setQuery(p.sql);
                            void runQuery(p.sql, explain);
                          }}
                          className="border border-white/5 bg-[#05070d] p-2 text-left font-mono text-[11px] text-[#8b96b0] hover:text-white hover:border-white/20 hover:bg-white/[0.04] transition-all rounded-[2px] cursor-pointer"
                        >
                          <span className="block truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* 2. Editor & Results in Panels */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* Editor Panel */}
        <Panel cut={8} className="w-full">
          <div className="p-3.5 sm:p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
                  Interactive SQL
                </span>
                <span className="text-[#5f6f93] text-[10px]">·</span>
                <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  Command editor
                </h2>
              </div>

              {/* Role selector as chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#5f6f93] mr-1">
                  Role:
                </span>
                {ROLES.map((r) => {
                  const activeRole = (role || "mission_director") === r;
                  return (
                    <button
                      key={r}
                      onClick={() => void handleRoleChange(r)}
                      aria-pressed={activeRole}
                      className={`font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[1px] transition-all cursor-pointer ${
                        activeRole
                          ? "bg-[#3d5bff] text-white font-semibold shadow-[0_0_8px_rgba(61,91,255,0.4)]"
                          : "bg-white/[0.03] text-[#8b96b0] hover:text-[#dfe6f5] border border-white/10"
                      }`}
                    >
                      {shortRole(r)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-dashed border-white/10 bg-[#05070d] p-2.5 text-[12px] leading-relaxed text-[#8b96b0] font-mono flex items-center justify-between gap-2">
              <span>
                Safety constraint: queries execute within BEGIN READ ONLY with a 5s timeout. Writes fail with 25006.
              </span>
              <label className="font-mono flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase text-[#dfe6f5] cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={explain}
                  onChange={(e) => setExplain(e.target.checked)}
                  className="accent-[#3d5bff]"
                />
                Explain plan
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="sql-editor"
                className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]"
              >
                SQL statement · Ctrl+Enter runs
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
                className="font-mono min-h-[140px] w-full border border-white/10 bg-[#05070d] p-3 text-[12.5px] leading-relaxed text-[#dfe6f5] focus:border-[#3d5bff] focus:outline-none rounded-[2px]"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => void runQuery(query, explain)}
                disabled={running || query.trim() === ""}
                className="font-mono text-[11px] uppercase tracking-[0.1em] px-4 py-2 bg-[#3d5bff] hover:bg-[#324dd8] text-white rounded-[2px] font-semibold transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] disabled:opacity-40 cursor-pointer"
              >
                {running ? "Executing…" : "Run query"}
              </button>
              <span className="font-mono text-[10px] text-[#5f6f93]">
                Read-only transaction (5s timeout)
              </span>
            </div>
          </div>
        </Panel>

        {/* Results Panel */}
        <Panel cut={8} className="w-full">
          <div className="p-3.5 sm:p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                Query output & execution plan
              </span>
              {result && (
                <StatusBadge
                  status="nominal"
                  label={`${result.rowcount} rows`}
                />
              )}
            </div>

            {error !== null && (
              <Panel
                cut={6}
                borderColor="rgba(255, 59, 79, 0.45)"
                glowColor="rgba(255, 59, 79, 0.15)"
                className="w-full"
              >
                <div role="alert" className="p-3 flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff3b4f] font-semibold">
                    {error.sqlstate === "42501" || error.message.includes("42501")
                      ? "Permission denied by PostgreSQL (42501)"
                      : "PostgreSQL execution refused"}
                  </span>
                  <p className="font-mono text-[12px] text-[#dfe6f5] whitespace-pre-wrap">
                    {error.message}
                  </p>
                </div>
              </Panel>
            )}

            {result !== null && (
              <div className="flex flex-col gap-3">
                {explain && result.plan !== undefined && result.plan !== null ? (
                  <div className="border border-white/10 bg-[#05070d] p-3 rounded-[2px]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b96b0] block mb-2">
                      Plan tree visualizer
                    </span>
                    <PlanTree plan={result.plan} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-[10.5px] text-[#8b96b0]">
                      {result.rowcount} rows returned {result.rows.length === 500 ? "(capped at 500)" : ""} · NULL values italicized
                    </p>
                    <DataGrid rows={result.rows} limit={500} />
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <p className="font-mono text-[11px] text-[#5f6f93] p-4 text-center border border-dashed border-white/5">
                Select a preset or enter a query to run.
              </p>
            )}
          </div>
        </Panel>

        <SqlBlock label="Active statement" sql={query} />
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
    {
      group: "Exp 4 - DML",
      name: "Queued packets by sat",
      sql: "SELECT origin_sat, mode, status, COUNT(*) FROM packet GROUP BY origin_sat, mode, status ORDER BY origin_sat LIMIT 50;",
    },
    {
      group: "Exp 5 - Aggregates",
      name: "Low power sats (HAVING)",
      sql: "SELECT * FROM v_low_power;",
    },
    {
      group: "Exp 6 - CGR",
      name: "CGR from SAT-A1",
      sql: "SELECT * FROM cgr_routes('SAT-A1', now());",
    },
    {
      group: "Exp 7 - DCL",
      name: "Privilege matrix",
      sql: "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('mission_director','station_operator_bom','student_analyst','ai_router') ORDER BY grantee, table_name LIMIT 50;",
    },
  ];
  return groupPresets(list);
}

