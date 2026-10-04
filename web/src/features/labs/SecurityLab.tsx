import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/app/api";
import { Card, DataGrid, OfflineOrEmpty, RefusalCard, SqlBlock } from "./common";
import type { SecurityMatrix } from "./types";

const ACTIONS = [
  { key: "read_telemetry", label: "SELECT telemetry" },
  { key: "insert_telemetry", label: "INSERT telemetry" },
  { key: "read_station_secret", label: "SELECT station_key.secret" },
  { key: "read_station_keyid", label: "SELECT station_key.key_id" },
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
      const r = await apiFetch<SecurityMatrix>("/api/labs/security/matrix");
      setMatrix(r.data);
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
      const r = await apiFetch<{ ok: boolean; message?: string; per_station?: Record<string, number> }>(
        "/api/labs/security/try",
        { method: "POST", body: JSON.stringify({ role, action_key: action }) },
      );
      const ok = r.data.ok !== false;
      setResults((p) => ({ ...p, [k]: { ok, message: r.data.message ?? "allowed" } }));
      if (action === "read_downlinks") {
        const counts = (r.data.per_station ?? {}) as Record<string, number>;
        setDownlinks((p) => ({ ...p, [role]: counts }));
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
      <Card title="Privilege matrix" kicker="has_*_privilege · Exp 7">
        {cells.length === 0 && (
          <p className="font-mono mb-2 text-[11px] text-[var(--warn)]">
            Live matrix pending — showing the contracted shape. Hover a cell for the exact privilege call.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--navy-700)]">
              <tr>
                <th className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-2)]">role \ object</th>
                {objects.map((o) => (
                  <th key={o} className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-2)]">{o}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r} className="odd:bg-[var(--space)] even:bg-[var(--navy-800)]">
                  <td className="font-mono px-2.5 py-1.5 text-[11px] text-[var(--warn)]">{r}</td>
                  {objects.map((o) => {
                    const cell = cellOf(r, o);
                    const privs = cell?.privs ?? guessPrivs(r, o);
                    return (
                      <td
                        key={o}
                        title={cell?.detail ?? `SELECT has_table_privilege('${r}', '${o}', 'SELECT') — and INSERT/UPDATE/DELETE/EXECUTE likewise`}
                        className="px-2.5 py-1.5"
                      >
                        <span className="flex flex-wrap gap-1">
                          {["S", "I", "U", "D", "X"].map((p) => {
                            const has = privHas(privs, p);
                            return (
                              <span
                                key={p}
                                className={`font-mono rounded px-1 text-[10px] ${
                                  has
                                    ? "bg-[var(--navy-700)] text-[var(--text)]"
                                    : "text-[var(--text-3)] line-through decoration-[var(--ice)]"
                                }`}
                              >
                                {p}
                              </span>
                            );
                          })}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono mt-2 text-[10.5px] text-[var(--text-3)]">
          S/I/U/D/X = SELECT/INSERT/UPDATE/DELETE/EXECUTE. Bright cells are granted, dim cells with red strike are denied.
          station_key appears twice: key_id readable by operators, secret director-only.
        </p>
      </Card>

      <Card title="Role tree" kicker="pg_auth_members">
        <div className="font-mono flex flex-wrap items-center gap-2 text-[11.5px]">
          {(matrix?.memberships ?? defaultMemberships()).map((m, i) => (
            <span key={i} className="rounded-full border border-[var(--line)] bg-[var(--space)] px-3 py-1 text-[var(--text-2)]">
              <span className="text-[var(--text)]">{m.member}</span>
              <span className="mx-1.5 text-[var(--text-3)]">→</span>
              <span className="text-[var(--ice)]">{m.role}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card
        title="Row-level security"
        kicker="pg_policies"
        aside={
          <button
            onClick={() => {
              void runTry("station_operator_bom", "read_downlinks");
              void runTry("station_operator_hel", "read_downlinks");
              void runTry("mission_director", "read_downlinks");
            }}
            className="font-mono rounded-full border border-[var(--line)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)]"
          >
            compare 3 roles
          </button>
        }
      >
        <div className="flex flex-col gap-2">
          {(matrix?.policies ?? defaultPolicies()).map((p, i) => (
            <div key={i} className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-2.5">
              <p className="font-mono text-[11.5px] text-[var(--text)]">
                {String(p["policyname"] ?? p["name"] ?? `policy ${i + 1}`)}
                <span className="text-[var(--text-3)]"> · {String(p["tablename"] ?? p["table"] ?? "contact/telecommand")}</span>
              </p>
              <p className="font-mono mt-1 text-[10.5px] text-[var(--text-2)]">
                {String(p["qual"] ?? p["using"] ?? p["definition"] ?? "operator_role = current_user OR pg_has_role(current_user,'grp_director','MEMBER')")}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {["station_operator_bom", "station_operator_hel", "mission_director"].map((r) => {
            const counts = downlinks[r];
            const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
            return (
              <div key={r} className="rounded-lg border border-[var(--line)] bg-[var(--space)] p-3">
                <p className="font-mono text-[10.5px] text-[var(--warn)]">{r}</p>
                {counts ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {Object.entries(counts).map(([st, n]) => (
                      <div key={st} className="flex items-center gap-2">
                        <span className="font-mono w-16 text-[10px] text-[var(--text-2)]">{st}</span>
                        <div className="h-2 flex-1 rounded bg-[var(--navy-700)]">
                          <div
                            className="h-2 rounded bg-[var(--ice)]"
                            style={{ width: `${total ? Math.max(4, (n / total) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-[var(--text)]">{n}</span>
                      </div>
                    ))}
                    <p className="font-mono mt-1 text-[10px] text-[var(--text-3)]">
                      {r.startsWith("station_operator") ? "sees only own station" : "sees all stations"}
                    </p>
                  </div>
                ) : (
                  <p className="font-mono mt-2 text-[10.5px] text-[var(--text-3)]">
                    No live rows yet — press “compare 3 roles”.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Try it as…" kicker="POST /api/labs/security/try">
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[var(--navy-700)]">
              <tr>
                <th className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-2)]">action</th>
                {roles.map((r) => (
                  <th key={r} className="font-mono border-b border-[var(--line)] px-2.5 py-1.5 text-[10px] text-[var(--text-2)]">{shortRole(r)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a.key} className="odd:bg-[var(--space)] even:bg-[var(--navy-800)]">
                  <td className="px-2.5 py-1.5 text-[12px] text-[var(--text-2)]" title={a.key}>{a.label}</td>
                  {roles.map((r) => {
                    const k = `${r}:${a.key}`;
                    const res = results[k];
                    return (
                      <td key={r} className="px-2.5 py-1.5">
                        <button
                          onClick={() => void runTry(r, a.key)}
                          disabled={running !== null}
                          title={`POST /api/labs/security/try {"role":"${r}","action_key":"${a.key}"}`}
                          className="font-mono rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10px] text-[var(--text-2)] hover:border-[var(--ice)] hover:text-[var(--text)] disabled:opacity-40"
                        >
                          {running === k ? "…" : "run"}
                        </button>
                        {res !== undefined && (
                          <span
                            className={`font-mono ml-1.5 text-[11px] ${res.ok ? "text-[var(--ok)]" : "text-[var(--ice)]"}`}
                            title={res.sqlstate ? `SQLSTATE ${res.sqlstate}: ${res.message}` : res.message}
                          >
                            {res.ok ? "✓" : `refused ${res.sqlstate ?? "42501"}`}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-mono mt-2 text-[10.5px] text-[var(--text-3)]">
          Denials surface as “PostgreSQL refused 42501” — the error comes from GRANT/RLS, never the app.
        </p>
      </Card>

      <Card title="Audit log" kicker="director only">
        {auditError !== null ? (
          <RefusalCard error={auditError} />
        ) : audit === null ? (
          <p className="font-mono text-[11px] text-[var(--text-3)]">Loading audit_log…</p>
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
    S: ["SELECT"], I: ["INSERT"], U: ["UPDATE"], D: ["DELETE"], X: ["EXECUTE", "USAGE"],
  };
  return (map[p] ?? []).some((x) => privs.map((y) => y.toUpperCase()).includes(x));
}

function defaultObjects(): string[] {
  return ["telemetry", "packet", "contact", "telecommand", "station_key.secret", "station_key.key_id", "alert", "audit_log", "decide_for_satellite()"];
}

function guessPrivs(role: string, obj: string): string[] {
  if (role === "mission_director") return ["SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE"];
  if (obj === "station_key.secret") return role === "mission_director" ? ["SELECT"] : [];
  if (obj === "audit_log") return role === "mission_director" ? ["SELECT"] : [];
  if (obj === "telecommand" || obj.startsWith("decide")) return role === "student_analyst" || role === "ai_router" ? [] : ["SELECT", "INSERT", "EXECUTE"];
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

function defaultPolicies(): Array<Record<string, unknown>> {
  return [
    { policyname: "telecommand_isolation", tablename: "telecommand", qual: "operator_role = current_user OR pg_has_role(current_user,'grp_director','MEMBER')" },
    { policyname: "station_key_isolation", tablename: "station_key", qual: "operator_role = current_user OR pg_has_role(current_user,'grp_director','MEMBER')" },
    { policyname: "contact_downlink_rls", tablename: "contact", qual: "kind = 'ISL' OR to_node operator matches current_user OR grp_director/analyst/router" },
  ];
}

function AuditTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <p className="font-mono text-[11px] text-[var(--text-3)]">No audit rows yet.</p>;
  return (
    <div className="flex flex-col gap-2">
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
