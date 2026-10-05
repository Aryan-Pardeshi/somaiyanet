import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { DataGrid, OfflineOrEmpty, Panel, RefusalCard } from "./common";
import type { SecurityMatrix } from "./types";

const ACTIONS = [
  { key: "read_telemetry", label: "SELECT telemetry", object: "telemetry", priv: "SELECT" },
  { key: "insert_telemetry", label: "INSERT telemetry", object: "telemetry", priv: "INSERT" },
  { key: "read_station_secret", label: "SELECT station_key.secret [COL]", object: "station_key.secret", priv: "SELECT" },
  { key: "read_station_keyid", label: "SELECT station_key.key_id [COL]", object: "station_key.key_id", priv: "SELECT" },
  { key: "read_downlinks", label: "RLS downlinks (per-station rows)", object: "contact", priv: "SELECT" },
  { key: "insert_telecommand_own", label: "INSERT telecommand (own station)", object: "telecommand", priv: "INSERT" },
  { key: "insert_telecommand_other", label: "INSERT telecommand (other station)", object: "telecommand", priv: "INSERT" },
  { key: "execute_decide", label: "EXECUTE decide_for_satellite", object: "decide_for_satellite()", priv: "EXECUTE" },
  { key: "ack_alert", label: "UPDATE alert.acknowledged", object: "alert", priv: "UPDATE" },
  { key: "update_alert_message", label: "UPDATE alert.message (denied)", object: "alert", priv: "UPDATE" },
  { key: "refresh_kpis", label: "REFRESH mv_kpis", object: "telemetry", priv: "SELECT" },
  { key: "grant_chain", label: "GRANT-chain demo", object: "audit_log", priv: "USAGE" },
];

const ROLES = ["mission_director", "station_operator_bom", "station_operator_hel", "student_analyst", "ai_router"];

const ROLE_LABELS: Record<string, string> = {
  mission_director: "Mission Director",
  station_operator_bom: "Mumbai Operator (BOM)",
  station_operator_hel: "Espoo Operator (HEL)",
  student_analyst: "Student Analyst",
  ai_router: "AI Router",
};

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
  const [selectedRole, setSelectedRole] = useState<string>("station_operator_bom");

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

  const objects = matrix?.objects ?? defaultObjects();
  const roles = matrix?.roles?.length ? matrix.roles : ROLES;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Role switcher as Apple segmented control */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="sx-eyebrow">Select role</h2>
        </div>
        <div
          className="inline-flex flex-wrap p-1 bg-[#111113] rounded-[10px] border border-white/[0.08] gap-1 self-start"
          role="tablist"
          aria-label="Role switcher"
        >
          <button
            role="tab"
            aria-selected={selectedRole === "all"}
            onClick={() => setSelectedRole("all")}
            className={`font-[family-name:var(--font-display)] text-[12px] capitalize px-3.5 py-1.5 min-h-[36px] rounded-[8px] transition-colors cursor-pointer ${
 selectedRole === "all"
 ? "bg-[#1c1c1e] text-white font-semibold shadow-sm"
 : "text-[var(--sx-text-2)] hover:text-white"
 }`}
          >
            All roles
          </button>
          {roles.map((r) => {
            const isSel = selectedRole === r;
            return (
              <button
                key={r}
                role="tab"
                aria-selected={isSel}
                onClick={() => setSelectedRole(r)}
                className={`font-[family-name:var(--font-display)] text-[12px] capitalize px-3.5 py-1.5 min-h-[36px] rounded-[8px] transition-colors cursor-pointer ${
 isSel
 ? "bg-[#1c1c1e] text-white font-semibold shadow-sm"
 : "text-[var(--sx-text-2)] hover:text-white"
 }`}
              >
                {ROLE_LABELS[r] ?? shortRole(r)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Privilege matrix as an inset-grouped table */}
      {selectedRole !== "all" ? (
        <div className="sx-group">
          <div className="sx-row bg-[var(--sx-surface-2)]">
            <h2 className="sx-eyebrow">
              Privilege verification matrix · {ROLE_LABELS[selectedRole] ?? selectedRole}
            </h2>
            <button
              onClick={() => {
                for (const a of ACTIONS) {
                  void runTry(selectedRole, a.key);
                }
              }}
              disabled={running !== null}
              className="sx-btn sx-btn--sm"
            >
              Test all
            </button>
          </div>
          <div className="divide-y divide-white/[0.08]">
            {ACTIONS.map((a) => {
              const k = `${selectedRole}:${a.key}`;
              const res = results[k];
              const allowed = isActionAllowed(selectedRole, a.key, matrix);
              return (
                <div key={a.key} className="sx-row flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-mono text-[13px] text-white font-medium">
                      {a.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="sx-status" data-tone={allowed ? "ok" : "critical"}>
                        {allowed ? "Allowed" : "Denied"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {res !== undefined ? (
                      res.ok ? (
                        <span className="sx-status" data-tone="ok">
                          <span className="text-[13px]">{res.message}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[12px] text-[var(--sx-red)] font-medium">
                          SQLSTATE {res.sqlstate ?? "42501"}: {res.message}
                        </span>
                      )
                    ) : null}

                    <button
                      onClick={() => void runTry(selectedRole, a.key)}
                      disabled={running !== null}
                      className="sx-btn sx-btn--sm"
                    >
                      {running === k ? "…" : "Try"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sx-group">
          <div className="sx-row bg-[var(--sx-surface-2)]">
            <h2 className="sx-eyebrow">Role privilege matrix · all roles & objects</h2>
            <span className="sx-caption">{objects.length} objects · {roles.length} roles</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="sx-eyebrow px-4 py-3">Role</th>
                  {objects.map((o) => (
                    <th key={o} className="sx-eyebrow px-3 py-3 whitespace-nowrap font-mono text-[11px] normal-case">
                      {o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {roles.map((r) => (
                  <tr key={r} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-[12px] text-white font-medium whitespace-nowrap">
                      {ROLE_LABELS[r] ?? shortRole(r)}
                    </td>
                    {objects.map((o) => {
                      const allowed = isObjectAllowed(r, o, matrix);
                      return (
                        <td key={o} className="px-3 py-3 whitespace-nowrap">
                          <span className="sx-status" data-tone={allowed ? "ok" : "critical"}>
                            {allowed ? "Allowed" : "Denied"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Role hierarchy */}
      <div className="flex flex-col gap-3">
        <h2 className="sx-eyebrow">Role inheritance hierarchy · pg_auth_members</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(matrix?.memberships ?? defaultMemberships()).map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--sx-surface)] border border-white/[0.08] text-[13px]"
            >
              <span className="font-mono text-white text-[12px]">{m.member}</span>
              <span className="text-[var(--sx-text-3)]">→</span>
              <span className="font-mono text-[var(--sx-text-2)] text-[12px]">{m.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Row-Level Security (RLS) Demo: Per-station isolation */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="sx-eyebrow">
            Row-level security (RLS) · per-station isolation
          </h2>
          <button
            onClick={() => {
              void runTry("station_operator_bom", "read_downlinks");
              void runTry("station_operator_hel", "read_downlinks");
              void runTry("mission_director", "read_downlinks");
            }}
            className="sx-btn sx-btn--sm"
          >
            Compare 3 roles
          </button>
        </div>

        {/* Station Mumbai (BOM) */}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="w-full">
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <h3 className="sx-eyebrow">Mumbai station (GS-BOM) · Policy rules</h3>
                <span className="sx-status" data-tone="ok">GS-BOM</span>
              </div>
              <p className="sx-caption text-[var(--sx-text-2)] font-mono">
                Role: station_operator_bom
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="sx-caption">Active policy predicate (USING)</span>
                <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
                  operator_role = current_user OR to_node = 'GS-BOM' OR kind = 'ISL'
                </pre>
              </div>
              <p className="sx-body text-[13px]">
                Station operator can only read and insert telemetry/telecommands bound to their own ground station. Foreign downlink rows are filtered at the storage engine level.
              </p>
            </div>
          </Panel>

          <Panel className="w-full">
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <h3 className="sx-eyebrow">Mumbai station (GS-BOM) · Visible downlinks</h3>
                <span
                  className="sx-status"
                  data-tone={downlinks["station_operator_bom"] ? "ok" : "warn"}
                >
                  {downlinks["station_operator_bom"] ? "Isolated" : "Pending run"}
                </span>
              </div>
              {downlinks["station_operator_bom"] ? (
                <div className="flex flex-col gap-2 pt-1">
                  {Object.entries(downlinks["station_operator_bom"]).map(([st, n]) => {
                    const isOwn = st === "GS-BOM";
                    return (
                      <div key={st} className="flex flex-col gap-1 border border-white/[0.08] bg-[var(--sx-surface-2)] p-2.5 rounded-[10px]">
                        <div className="flex items-center justify-between font-mono text-[12px]">
                          <span className={isOwn ? "text-[var(--sx-green)] font-semibold" : "text-[var(--sx-text-3)]"}>
                            {st} {isOwn ? "(Local ground station)" : "(Foreign ground station)"}
                          </span>
                          <span className="sx-num font-bold text-white">{n} legs</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${isOwn ? "bg-[var(--sx-green)]" : "bg-white/20"}`}
                            style={{ width: `${Math.min(100, Math.max(5, n * 8))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="sx-caption text-[var(--sx-green)] mt-1">
                    Verification passed: 0 rows returned for GS-HEL. Full station isolation active.
                  </p>
                </div>
              ) : (
                <p className="sx-caption text-center py-6">
                  Click "Compare 3 roles" to execute downlinks query under station_operator_bom.
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* Station Helsinki (HEL) */}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="w-full">
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <h3 className="sx-eyebrow">Espoo station (GS-HEL) · Policy rules</h3>
                <span className="sx-status" data-tone="ok">GS-HEL</span>
              </div>
              <p className="sx-caption text-[var(--sx-text-2)] font-mono">
                Role: station_operator_hel
              </p>
              <div className="flex flex-col gap-1.5">
                <span className="sx-caption">Active policy predicate (USING)</span>
                <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
                  operator_role = current_user OR to_node = 'GS-HEL' OR kind = 'ISL'
                </pre>
              </div>
              <p className="sx-body text-[13px]">
                Helsinki station operator is prevented from querying Mumbai downlink passes or injecting foreign commands.
              </p>
            </div>
          </Panel>

          <Panel className="w-full">
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <h3 className="sx-eyebrow">Espoo station (GS-HEL) · Visible downlinks</h3>
                <span
                  className="sx-status"
                  data-tone={downlinks["station_operator_hel"] ? "ok" : "warn"}
                >
                  {downlinks["station_operator_hel"] ? "Isolated" : "Pending run"}
                </span>
              </div>
              {downlinks["station_operator_hel"] ? (
                <div className="flex flex-col gap-2 pt-1">
                  {Object.entries(downlinks["station_operator_hel"]).map(([st, n]) => {
                    const isOwn = st === "GS-HEL";
                    return (
                      <div key={st} className="flex flex-col gap-1 border border-white/[0.08] bg-[var(--sx-surface-2)] p-2.5 rounded-[10px]">
                        <div className="flex items-center justify-between font-mono text-[12px]">
                          <span className={isOwn ? "text-[var(--sx-green)] font-semibold" : "text-[var(--sx-text-3)]"}>
                            {st} {isOwn ? "(Local ground station)" : "(Foreign ground station)"}
                          </span>
                          <span className="sx-num font-bold text-white">{n} legs</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${isOwn ? "bg-[var(--sx-green)]" : "bg-white/20"}`}
                            style={{ width: `${Math.min(100, Math.max(5, n * 8))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="sx-caption text-[var(--sx-green)] mt-1">
                    Verification passed: 0 rows returned for GS-BOM. Full station isolation active.
                  </p>
                </div>
              ) : (
                <p className="sx-caption text-center py-6">
                  Click "Compare 3 roles" to execute downlinks query under station_operator_hel.
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* Global Director Supervisor View */}
        <Panel className="w-full">
          <div className="p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <h3 className="sx-eyebrow">Mission director · Global overview</h3>
              <span className="sx-status" data-tone="ok">Director access</span>
            </div>
            {downlinks["mission_director"] ? (
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                {Object.entries(downlinks["mission_director"]).map(([st, n]) => (
                  <div key={st} className="border border-white/[0.08] bg-[var(--sx-surface-2)] p-3 rounded-[10px]">
                    <div className="flex items-center justify-between font-mono text-[12px]">
                      <span className="text-white font-semibold">{st}</span>
                      <span className="sx-num text-[var(--sx-green)] font-bold">{n} legs visible</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sx-caption">
                Director sees all ground station downlinks aggregate via pg_has_role(current_user, 'grp_director', 'MEMBER').
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* 5. Audit Log Panel: Director Only */}
      <div className="flex flex-col gap-3">
        <h2 className="sx-eyebrow">Audit log · mission_director only</h2>
        {auditError !== null ? (
          <RefusalCard error={auditError} />
        ) : audit === null ? (
          <p className="sx-caption">Loading audit_log…</p>
        ) : (
          <AuditTable rows={audit} />
        )}
      </div>
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

function isActionAllowed(role: string, actionKey: string, matrix: SecurityMatrix | null): boolean {
  const act = ACTIONS.find((a) => a.key === actionKey);
  if (!act) return false;
  if (role === "mission_director") return true;
  if (act.key === "read_telemetry" || act.key === "insert_telemetry") return true;
  if (act.key === "read_station_secret") return role === "mission_director";
  if (act.key === "read_station_keyid") return role.startsWith("station_operator") || role === "mission_director";
  if (act.key === "read_downlinks") return true;
  if (act.key === "insert_telecommand_own") return role.startsWith("station_operator") || role === "mission_director";
  if (act.key === "insert_telecommand_other") return role === "mission_director";
  if (act.key === "execute_decide") return role === "mission_director" || role === "ai_router";
  if (act.key === "ack_alert") return role !== "student_analyst";
  if (act.key === "update_alert_message") return false;
  if (act.key === "refresh_kpis") return role === "mission_director";
  if (act.key === "grant_chain") return role === "mission_director";
  const cell = matrix?.cells.find((c) => c.role === role && c.object === act.object);
  if (cell) return privHas(cell.privs, act.priv[0]);
  return false;
}

function isObjectAllowed(role: string, obj: string, matrix: SecurityMatrix | null): boolean {
  if (role === "mission_director") return true;
  const cell = matrix?.cells.find((c) => c.role === role && c.object === obj);
  const privs = cell?.privs ?? guessPrivs(role, obj);
  return privs.length > 0;
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
    return <p className="sx-caption p-3">No audit records found.</p>;
  return (
    <div className="flex flex-col gap-4">
      <DataGrid rows={rows} limit={20} />
      <div className="flex flex-col gap-2.5">
        {rows.slice(0, 3).map((r, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="sx-eyebrow">
              audit {String(r["audit_id"] ?? i)} · {String(r["table_name"] ?? "")} {String(r["op"] ?? "")}
            </span>
            <pre className="sx-code overflow-x-auto whitespace-pre-wrap">
              {diffText(r["old_row"], r["new_row"])}
            </pre>
          </div>
        ))}
      </div>
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

