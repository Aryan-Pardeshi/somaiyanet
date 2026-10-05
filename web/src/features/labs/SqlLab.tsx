import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/api";
import { useRole } from "@/app/access";
import { DataGrid, OfflineOrEmpty, Panel, PlanTree, RefusalCard, SqlBlock, StatusBadge } from "./common";
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
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* 1. Presets as a quiet list in a Panel */}
      <Panel className="w-full lg:sticky lg:top-16 lg:self-start">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2">
            <span className="sx-eyebrow">
              Presets catalog
            </span>
          </div>

          {bootError !== null && presets.length === 0 ? (
            <OfflineOrEmpty
              error={bootError}
              onRetry={() => void loadPresets()}
              hint="GET /api/console/presets"
            />
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto scrollbar-none">
              {(Object.keys(grouped).length > 0 ? Object.entries(grouped) : Object.entries(groupFallback())).map(
                ([g, list]) => (
                  <div key={g} className="flex flex-col gap-1.5">
                    <span className="sx-eyebrow text-[var(--sx-text-3)]">
                      {g}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {(list as ConsolePreset[]).map((p) => (
                        <button
                          key={p.name}
                          onClick={() => {
                            setQuery(p.sql);
                            void runQuery(p.sql, explain);
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] text-[var(--sx-text-2)] hover:text-white hover:bg-[var(--sx-surface-2)] rounded-[8px] transition-colors cursor-pointer"
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
      <div className="flex min-w-0 flex-col gap-6">
        {/* Editor Panel */}
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sx-hairline)] pb-2.5">
              <h2 className="sx-h3">
                Command editor
              </h2>

              {/* Role selector as a segmented control */}
              <div className="flex items-center gap-2">
                <span className="sx-eyebrow">Role</span>
                <div
                  className="inline-flex p-0.5 bg-[var(--sx-night)] rounded-[10px] gap-0.5 border border-[var(--sx-hairline)]"
                  role="radiogroup"
                  aria-label="Database role"
                >
                  {ROLES.map((r) => {
                    const activeRole = (role || "mission_director") === r;
                    return (
                      <button
                        key={r}
                        role="radio"
                        aria-checked={activeRole}
                        onClick={() => void handleRoleChange(r)}
                        className={`font-[var(--font-display)] text-[12px] capitalize font-semibold px-2.5 py-1 rounded-[8px] transition-colors cursor-pointer ${
 activeRole
 ? "bg-[var(--sx-surface-2)] text-white"
 : "text-white/60 hover:text-white"
 }`}
                      >
                        {shortRole(r)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-3 bg-[var(--sx-night)] rounded-[10px] border border-[var(--sx-hairline)] flex flex-wrap items-center justify-between gap-2">
              <span className="sx-caption text-[var(--sx-text-2)]">
                Safety constraint: queries execute within BEGIN READ ONLY with a 5s timeout. Writes fail with 25006.
              </span>
              <label className="flex items-center gap-2 sx-eyebrow cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={explain}
                  onChange={(e) => setExplain(e.target.checked)}
                  className="accent-white cursor-pointer"
                />
                <span>Explain plan</span>
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="sql-editor"
                className="sx-eyebrow"
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
                className="font-mono min-h-[140px] w-full bg-[var(--sx-night)] text-[#f0f0fa] p-3.5 rounded-[10px] border border-[var(--sx-hairline)] text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-white transition-all"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => void runQuery(query, explain)}
                disabled={running || query.trim() === ""}
                className="sx-btn sx-btn--filled"
              >
                {running ? "Running…" : "Run"}
              </button>
              <span className="sx-caption text-[var(--sx-text-3)]">
                Read-only transaction (5s timeout)
              </span>
            </div>
          </div>
        </Panel>

        {/* Results Panel */}
        <Panel className="w-full">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[var(--sx-hairline)] pb-2.5">
              <h2 className="sx-h3">
                Query output & execution plan
              </h2>
              {result && (
                <StatusBadge
                  status="nominal"
                  label={`${result.rowcount} rows`}
                />
              )}
            </div>

            {error !== null && (
              <RefusalCard error={error} />
            )}

            {result !== null && (
              <div className="flex flex-col gap-4">
                {explain && result.plan !== undefined && result.plan !== null ? (
                  <div className="flex flex-col gap-2">
                    <span className="sx-eyebrow">
                      Plan tree visualizer
                    </span>
                    <PlanTree plan={result.plan} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="sx-caption text-[var(--sx-text-3)]">
                      <span className="sx-num">{result.rowcount}</span> rows returned {result.rows.length === 500 ? "(capped at 500)" : ""} · NULL values italicized
                    </p>
                    <DataGrid rows={result.rows} limit={500} />
                  </div>
                )}
              </div>
            )}

            {!result && !error && (
              <p className="sx-caption text-[var(--sx-text-3)] p-6 text-center">
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
    const g = (p.group || "Other").replace(/^Exp \d+\s*-\s*/i, "");
    (out[g] ??= []).push(p);
  }
  return out;
}

function groupFallback(): Record<string, ConsolePreset[]> {
  const list: ConsolePreset[] = [
    {
      group: "DML",
      name: "Queued packets by sat",
      sql: "SELECT origin_sat, mode, status, COUNT(*) FROM packet GROUP BY origin_sat, mode, status ORDER BY origin_sat LIMIT 50;",
    },
    {
      group: "Aggregates",
      name: "Low power sats (HAVING)",
      sql: "SELECT * FROM v_low_power;",
    },
    {
      group: "CGR",
      name: "CGR from SS-1",
      sql: "SELECT * FROM cgr_routes('SS-1', now());",
    },
    {
      group: "DCL",
      name: "Privilege matrix",
      sql: "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('mission_director','station_operator_bom','student_analyst','ai_router') ORDER BY grantee, table_name LIMIT 50;",
    },
  ];
  return groupPresets(list);
}
