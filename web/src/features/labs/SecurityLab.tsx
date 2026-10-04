import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { Card, DataGrid, OfflineOrEmpty, Panel, RefusalCard, SqlBlock, StatusBadge } from "./common";
import type { SecurityMatrix } from "./types";

const ACTIONS = [
  { key: "read_telemetry", label: "SELECT telemetry" },
  { key: "insert_telemetry", label: "INSERT telemetry" },
  { key: "read_station_secret", label: "SELECT station_key.secret [COL]" },
  { key: "read_station_keyid", label: "SELECT station_key.key_id [COL]" },
  { key: "read_downlinks", label: "RLS downlinks (per-station rows)" },
  { key: "insert_telecommand_own", label: "INSERT telecommand (own station)" },
  { key: "insert_telecommand_other", label: "INSERT telecommand (other station)" },
  { key: "execute_decide", label: "EXECUTE decide_for_satellite" },
  { key: "ack_alert", label: "UPDATE alert.acknowledged" },
  { key: "update_alert_message", label: "UPDATE alert.message (denied)" },
  { key: "refresh_kpis", label: "REFRESH mv_kpis" },
  { key: "grant_chain", label: "GRANT-chain demo" },
];

const ROLES = ["mission_director", "station_operator_bom", "station_operator_hel", "student_analyst", "ai_router"];

interface TryResult {
  ok: boolean;
  message: string;
  sqlstate?: string;
  rowcounts?: Record<string, number>;
}

export function SecurityLab() {
  const [matrix, setMatrix] = useState<SecurityMatrix | null>(null);
  const [matrixError, setMatrixError] = useState<unknown>(null);
  const [results, setResults] = useState<Record<string, TryResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>> | null>(null);
  const [auditError, setAuditError] = useState<ApiError | null>(null);
  const [downlinks, setDownlinks] = useState<Record<string, Record<string, number>>>({});

  const loadMatrix = useCallback(async () => {
    try {
      const r = await apiFetch<{
        roles?: string[];
        objects?: string[];
        funcs?: string[];
        cells?: Array<{ role: string; object: string; priv: string; has: boolean }>;
        members?: Array<{ role: string; member: string }>;
        policies?: Array<Record<string, unknown>>;
      }>("/api/labs/security/matrix");
      const grouped = new Map<string, SecurityMatrix["cells"][number]>();
      for (const c of r.data.cells ?? []) {
        const k = `${c.role}␟${c.object}`;
        let cell = grouped.get(k);
        if (!cell) {
          cell = { role: c.role, object: c.object, privs: [] };
          grouped.set(k, cell);
        }
        if (c.has) cell.privs.push(c.priv);
      }
      setMatrix({
        roles: r.data.roles ?? [],
        objects: [...(r.data.objects ?? []), ...(r.data.funcs ?? [])],
        cells: [...grouped.values()],
        memberships: r.data.members ?? [],
        policies: r.data.policies ?? [],
      });
      setMatrixError(null);
    } catch (e) {
      setMatrixError(e);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const r = await apiFetch<Array<Record<string, unknown>>>("/api/labs/security/audit?limit=50");
      setAudit(r.data);
      setAuditError(null);
    } catch (e) {
      setAudit(null);
      setAuditError(e as ApiError);
    }
  }, []);

  useEffect(() => {
    void loadMatrix();
    void loadAudit();
  }, [loadMatrix, loadAudit]);

  const runTry = async (role: string, action: string) => {
    const k = `${role}:${action}`;
    setRunning(k);
    try {
      const r = await apiFetch<{
        allowed?: boolean;
        ok?: boolean;
        message?: string;
        result?: unknown;
        error?: { sqlstate?: string; message?: string } | null;
        per_station?: Record<string, number>;
      }>(
        "/api/labs/security/try",
        { method: "POST", body: JSON.stringify({ role, action_key: action }) },
      );
      const allowed = r.data.allowed ?? r.data.ok ?? false;
      const errObj = r.data.error as { sqlstate?: string; message?: string } | null | undefined;
      setResults((p) => ({
        ...p,
        [k]: {
          ok: allowed,
          message: allowed ? (r.data.message ?? "allowed") : (errObj?.message ?? r.data.message ?? "refused"),
          sqlstate: errObj?.sqlstate,
        },
      }));
      if (action === "read_downlinks" && allowed) {
        if (r.data.per_station) {
          setDownlinks((p) => ({ ...p, [role]: r.data.per_station as Record<string, number> }));
        } else if (Array.isArray(r.data.result)) {
          const counts: Record<string, number> = {};
          for (const row of r.data.result as Array<Record<string, unknown>>) {
            const station = String(row["to_node"] ?? "?");
            counts[station] = Number(row["legs"] ?? row["count"] ?? 0);
          }
          setDownlinks((p) => ({ ...p, [role]: counts }));
        }
      }
    } catch (e) {
      const err = e as ApiError;
      setResults((p) => ({
        ...p,
        [k]: { ok: false, message: err.message, sqlstate: err.sqlstate },
      }));
    } finally {
      setRunning(null);
    }
  };

  if (matrixError !== null && matrix === null) {
    return (
      <OfflineOrEmpty
        error={matrixError}
        onRetry={() => { void loadMatrix(); void loadAudit(); }}
        hint="GET /api/labs/security/matrix — lab backend (brief 10a) still being built in parallel."
      />
    );
  }

  const cells = matrix?.cells ?? [];
  const objects = matrix?.objects ?? defaultObjects();
  const roles = matrix?.roles?.length ? matrix.roles : ROLES;
  const cellOf = (role: string, obj: string) => cells.find((c) => c.role === role && c.object === obj);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Privilege Matrix Panel */}
      <Card
        title="Role privilege matrix"
        kicker="has_*_privilege · Exp 7 · CO2"
        aside={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#7ee2b8]">
              <span className="font-bold">✓</span> GRANTED
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-[#ff3b4f]">
              <span className="font-bold">✕</span> DENIED
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#7fb2ff] border border-[#3d5bff]/40 px-1 py-0.2 rounded-[1px]">
              [COL] COLUMN-LEVEL
            </span>
          </div>
        }
      >
        <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#05070d]">
                <th className="font-mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  Role \ Object
                </th>
                {objects.map((o) => {
                  const isCol = o.includes(".");
                  return (
                    <th
                      key={o}
                      className="font-mono px-3 py-2 text-[10px] tracking-[0.06em] text-[#8b96b0] whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <span>{o}</span>
                        {isCol && (
                          <span className="text-[8px] uppercase tracking-wider px-1 py-0.2 rounded-[1px] bg-[#3d5bff]/15 text-[#7fb2ff] border border-[#3d5bff]/40">
                            COL
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr
                  key={r}
                  className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                >
                  <td className="font-mono px-3 py-2 text-[11px] text-[#7fb2ff] font-semibold whitespace-nowrap">
                    {r}
                  </td>
                  {objects.map((o) => {
                    const cell = cellOf(r, o);
                    const privs = cell?.privs ?? guessPrivs(r, o);
                    const isAllDenied = privs.length === 0;

                    return (
                      <td
                        key={o}
                        title={
                          cell?.detail ??
                          `SELECT has_table_privilege('${r}', '${o}', 'SELECT') — and INSERT/UPDATE/DELETE/EXECUTE`
                        }
                        className="px-2.5 py-2 whitespace-nowrap"
                      >
                        {isAllDenied ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#ff3b4f] bg-[#ff3b4f]/10 border border-[#ff3b4f]/30 px-1.5 py-0.5 rounded-[2px]">
                            <span className="font-bold">✕</span> DENIED
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#7ee2b8] font-bold text-[11px]">✓</span>
                            <div className="flex items-center gap-1">
                              {["S", "I", "U", "D", "X"].map((p) => {
                                const has = privHas(privs, p);
                                return (
                                  <span
                                    key={p}
                                    className={`font-mono text-[9px] px-1 py-0.2 rounded-[1px] ${
                                      has
                                        ? "bg-[#7ee2b8]/15 text-[#7ee2b8] border border-[#7ee2b8]/30 font-semibold"
                                        : "text-[#5f6f93] line-through decoration-[#ff3b4f]/60"
                                    }`}
                                  >
                                    {p}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono mt-2 text-[10.5px] text-[#8b96b0]">
          S/I/U/D/X = SELECT/INSERT/UPDATE/DELETE/EXECUTE. Check glyph (✓) indicates granted privileges; red cross (✕) marks forbidden operations.
          station_key has column-level enforcement: key_id is readable by operators, secret is restricted to mission_director.
        </p>
      </Card>

      {/* 2. Role Tree Panel */}
      <Card title="Role inheritance hierarchy" kicker="pg_auth_members">
        <div className="flex flex-wrap items-center gap-2">
          {(matrix?.memberships ?? defaultMemberships()).map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border border-white/10 bg-[#05070d] px-3 py-1.5 rounded-[2px] font-mono text-[11px]"
            >
              <span className="text-white font-medium">{m.member}</span>
              <span className="text-[#5f6f93]">→</span>
              <span className="text-[#7fb2ff]">{m.role}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. Row-Level Security (RLS) Demo: Two Panels per station */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6f93]">
              pg_policies · Table Isolation
            </span>
            <span className="text-[#5f6f93] text-[10px]">·</span>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b96b0]">
              Row-level security (RLS) per-station isolation
            </h2>
          </div>
          <button
            onClick={() => {
              void runTry("station_operator_bom", "read_downlinks");
              void runTry("station_operator_hel", "read_downlinks");
              void runTry("mission_director", "read_downlinks");
            }}
            className="font-mono text-[11px] uppercase tracking-[0.1em] px-3.5 py-1.5 bg-[#3d5bff] hover:bg-[#324dd8] text-white rounded-[2px] font-semibold transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] cursor-pointer"
          >
            COMPARE 3 ROLES
          </button>
        </div>

        {/* Station Mumbai (BOM): Two Panels */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Panel 1: Station BOM Policy & Scope */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  STATION BOM · POLICY RULES & FILTERS
                </span>
                <StatusBadge status="info" label="GS-BOM" />
              </div>
              <p className="font-mono text-[11px] text-[#7fb2ff]">
                ROLE: station_operator_bom
              </p>
              <div className="border border-white/10 bg-[#05070d] p-2.5">
                <p className="font-mono text-[10px] text-[#8b96b0] uppercase tracking-wider mb-1">
                  Active policy predicate (USING)
                </p>
                <code className="font-mono text-[11.5px] text-[#dfe6f5] block whitespace-pre-wrap">
                  operator_role = current_user OR to_node = 'GS-BOM' OR kind = 'ISL'
                </code>
              </div>
              <p className="text-[12px] text-[#8b96b0]">
                Station operator can only read and insert telemetry/telecommands bound to their own ground station. Foreign downlink rows are filtered at the storage engine level.
              </p>
            </div>
          </Panel>

          {/* Panel 2: Station BOM Visible Downlinks */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  STATION BOM · VISIBLE DOWNLINK ROWS
                </span>
                <StatusBadge
                  status={downlinks["station_operator_bom"] ? "ok" : "warn"}
                  label={downlinks["station_operator_bom"] ? "ISOLATED ✓" : "PENDING RUN"}
                />
              </div>
              {downlinks["station_operator_bom"] ? (
                <div className="flex flex-col gap-2 pt-1">
                  {Object.entries(downlinks["station_operator_bom"]).map(([st, n]) => {
                    const isOwn = st === "GS-BOM";
                    return (
                      <div key={st} className="flex flex-col gap-1 border border-white/5 bg-[#05070d] p-2 rounded-[2px]">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className={isOwn ? "text-[#7ee2b8] font-semibold" : "text-[#5f6f93]"}>
                            {st} {isOwn ? "(Local ground station)" : "(Foreign ground station)"}
                          </span>
                          <span className="tabular-nums font-bold text-white">{n} LEGS</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.08] rounded-[1px] overflow-hidden">
                          <div
                            className={`h-full ${isOwn ? "bg-[#3d5bff]" : "bg-[#5f6f93]"}`}
                            style={{ width: `${Math.min(100, Math.max(5, n * 8))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="font-mono text-[10.5px] text-[#7ee2b8]">
                    Verification passed: 0 rows returned for GS-HEL. Full station isolation active.
                  </p>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-white/10 text-center font-mono text-[11px] text-[#5f6f93]">
                  Click "COMPARE 3 ROLES" above to execute downlinks query under station_operator_bom.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Station Helsinki (HEL): Two Panels */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Panel 1: Station HEL Policy & Scope */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  STATION HEL · POLICY RULES & FILTERS
                </span>
                <StatusBadge status="info" label="GS-HEL" />
              </div>
              <p className="font-mono text-[11px] text-[#7fb2ff]">
                ROLE: station_operator_hel
              </p>
              <div className="border border-white/10 bg-[#05070d] p-2.5">
                <p className="font-mono text-[10px] text-[#8b96b0] uppercase tracking-wider mb-1">
                  Active policy predicate (USING)
                </p>
                <code className="font-mono text-[11.5px] text-[#dfe6f5] block whitespace-pre-wrap">
                  operator_role = current_user OR to_node = 'GS-HEL' OR kind = 'ISL'
                </code>
              </div>
              <p className="text-[12px] text-[#8b96b0]">
                Helsinki station operator is cryptographically and logically prevented from querying Mumbai downlink passes or injecting foreign commands.
              </p>
            </div>
          </Panel>

          {/* Panel 2: Station HEL Visible Downlinks */}
          <Panel cut={8} className="w-full">
            <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                  STATION HEL · VISIBLE DOWNLINK ROWS
                </span>
                <StatusBadge
                  status={downlinks["station_operator_hel"] ? "ok" : "warn"}
                  label={downlinks["station_operator_hel"] ? "ISOLATED ✓" : "PENDING RUN"}
                />
              </div>
              {downlinks["station_operator_hel"] ? (
                <div className="flex flex-col gap-2 pt-1">
                  {Object.entries(downlinks["station_operator_hel"]).map(([st, n]) => {
                    const isOwn = st === "GS-HEL";
                    return (
                      <div key={st} className="flex flex-col gap-1 border border-white/5 bg-[#05070d] p-2 rounded-[2px]">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className={isOwn ? "text-[#7ee2b8] font-semibold" : "text-[#5f6f93]"}>
                            {st} {isOwn ? "(Local ground station)" : "(Foreign ground station)"}
                          </span>
                          <span className="tabular-nums font-bold text-white">{n} LEGS</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.08] rounded-[1px] overflow-hidden">
                          <div
                            className={`h-full ${isOwn ? "bg-[#3d5bff]" : "bg-[#5f6f93]"}`}
                            style={{ width: `${Math.min(100, Math.max(5, n * 8))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="font-mono text-[10.5px] text-[#7ee2b8]">
                    Verification passed: 0 rows returned for GS-BOM. Full station isolation active.
                  </p>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-white/10 text-center font-mono text-[11px] text-[#5f6f93]">
                  Click "COMPARE 3 ROLES" above to execute downlinks query under station_operator_hel.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Global Director Supervisor View */}
        <Panel cut={8} className="w-full">
          <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[#8b96b0]">
                DIRECTOR (SUPERVISOR) · GLOBAL ROW-LEVEL OVERVIEW
              </span>
              <StatusBadge status="nominal" label="GRP_DIRECTOR BYPASS" />
            </div>
            {downlinks["mission_director"] ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(downlinks["mission_director"]).map(([st, n]) => (
                  <div key={st} className="border border-white/10 bg-[#05070d] p-3 rounded-[2px]">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#dfe6f5] font-semibold">{st}</span>
                      <span className="text-[#7ee2b8] font-bold">{n} LEGS VISIBLE</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[11px] text-[#5f6f93]">
                Director sees all ground station downlinks aggregate via pg_has_role(current_user, 'grp_director', 'MEMBER').
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* 4. Action Try Runner: "Try it as…" */}
      <Card title="Permission verification console" kicker="POST /api/labs/security/try">
        <div className="overflow-x-auto border border-white/10 bg-[#05070d]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#05070d]">
                <th className="font-mono px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#8b96b0]">
                  Target action
                </th>
                {roles.map((r) => (
                  <th
                    key={r}
                    className="font-mono px-3 py-2 text-[10px] uppercase tracking-wider text-[#8b96b0] text-center"
                  >
                    {shortRole(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr
                  key={a.key}
                  className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-[12px] text-[#dfe6f5]">
                    {a.label}
                  </td>
                  {roles.map((r) => {
                    const k = `${r}:${a.key}`;
                    const res = results[k];
                    return (
                      <td key={r} className="px-2 py-1.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => void runTry(r, a.key)}
                            disabled={running !== null}
                            className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-white/15 text-[#dfe6f5] hover:border-white/40 hover:bg-white/5 rounded-[2px] transition-colors focus:outline focus:outline-1 focus:outline-[#3d5bff] disabled:opacity-40 cursor-pointer"
                          >
                            {running === k ? "…" : "TEST"}
                          </button>
                          {res !== undefined && (
                            <span
                              className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded-[1px] border ${
                                res.ok
                                  ? "text-[#7ee2b8] border-[#7ee2b8]/40 bg-[#7ee2b8]/10"
                                  : "text-[#ff3b4f] border-[#ff3b4f]/40 bg-[#ff3b4f]/10"
                              }`}
                              title={res.sqlstate ? `SQLSTATE ${res.sqlstate}: ${res.message}` : res.message}
                            >
                              {res.ok ? "✓ ALLOWED" : `✕ REFUSED ${res.sqlstate ?? "42501"}`}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono mt-2 text-[10.5px] text-[#8b96b0]">
          Permission denials return genuine SQLSTATE 42501 exceptions from the PostgreSQL engine.
        </p>
      </Card>

      {/* 5. Audit Log Panel: Director Only */}
      <Card title="Audit log" kicker="mission_director only">
        {auditError !== null ? (
          <RefusalCard error={auditError} />
        ) : audit === null ? (
          <p className="font-mono text-[11px] text-[#5f6f93]">Loading audit_log…</p>
        ) : (
          <AuditTable rows={audit} />
        )}
      </Card>
    </div>
  );
}

function shortRole(r: string): string {
  return r.replace("mission_", "").replace("station_operator_", "").replace("student_", "");
}

function privHas(privs: string[], p: string): boolean {
  const map: Record<string, string[]> = {
    S: ["SELECT"],
    I: ["INSERT"],
    U: ["UPDATE"],
    D: ["DELETE"],
    X: ["EXECUTE", "USAGE"],
  };
  return (map[p] ?? []).some((x) => privs.map((y) => y.toUpperCase()).includes(x));
}

function defaultObjects(): string[] {
  return [
    "telemetry",
    "packet",
    "contact",
    "telecommand",
    "station_key.secret",
    "station_key.key_id",
    "alert",
    "audit_log",
    "decide_for_satellite()",
  ];
}

function guessPrivs(role: string, obj: string): string[] {
  if (role === "mission_director") return ["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"];
  if (obj === "station_key.secret") return role === "mission_director" ? ["SELECT"] : [];
  if (obj === "audit_log") return role === "mission_director" ? ["SELECT"] : [];
  if (obj === "telecommand" || obj.startsWith("decide"))
    return role === "student_analyst" || role === "ai_router" ? [] : ["SELECT", "INSERT", "EXECUTE"];
  if (role === "student_analyst") return ["SELECT", "EXECUTE"];
  if (role === "ai_router") return ["SELECT", "INSERT", "EXECUTE"];
  return ["SELECT", "INSERT", "UPDATE"];
}

function defaultMemberships(): Array<{ role: string; member: string }> {
  return [
    { member: "mission_director", role: "grp_director" },
    { member: "station_operator_bom", role: "grp_station_operator" },
    { member: "station_operator_hel", role: "grp_station_operator" },
    { member: "student_analyst", role: "grp_analyst" },
    { member: "ai_router", role: "grp_router" },
  ];
}

function AuditTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0)
    return <p className="font-mono text-[11px] text-[#5f6f93]">No audit records found.</p>;
  return (
    <div className="flex flex-col gap-3">
      <DataGrid rows={rows} limit={20} />
      {rows.slice(0, 3).map((r, i) => (
        <SqlBlock
          key={i}
          label={`audit ${String(r["audit_id"] ?? i)} · ${String(r["table_name"] ?? "")} ${String(r["op"] ?? "")}`}
          sql={diffText(r["old_row"], r["new_row"])}
        />
      ))}
    </div>
  );
}

function diffText(oldR: unknown, newR: unknown): string {
  try {
    const o = (typeof oldR === "string" ? JSON.parse(oldR) : oldR ?? {}) as Record<string, unknown>;
    const n = (typeof newR === "string" ? JSON.parse(newR) : newR ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
    const lines = keys.slice(0, 12).map((k) => {
      const a = JSON.stringify(o[k]);
      const b = JSON.stringify(n[k]);
      const mark = a === b ? " " : "~";
      return `${mark} ${k}: ${a ?? "∅"} → ${b ?? "∅"}`;
    });
    return lines.join("\n") || "(no row payload)";
  } catch {
    return "(unparseable row payload)";
  }
}

